import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import {
  GITHUB_TOKEN_PARAM,
  JIRA_API_TOKEN_PARAM,
  JIRA_BASE_URL_PARAM,
  JIRA_USER_EMAIL_PARAM,
  SLACK_BOT_TOKEN_PARAM,
  SLACK_CHANNEL_ID_PARAM,
  REPOSITORIES_PARAM,
  TICKET_PATTERN_PARAM,
  READY_STATUSES_PARAM,
  QA_STATUSES_PARAM,
  SSM_PARAM_PREFIX,
} from '../src/config';

// Resolve project root — works from both source (infra/) and compiled (dist/infra/)
const PROJECT_ROOT =
  path.basename(path.resolve(__dirname, '..')) === 'dist'
    ? path.resolve(__dirname, '..', '..')
    : path.resolve(__dirname, '..');

export class ReleaseRemindersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const SSM_PARAM_NAMES = [
      GITHUB_TOKEN_PARAM,
      JIRA_API_TOKEN_PARAM,
      JIRA_BASE_URL_PARAM,
      JIRA_USER_EMAIL_PARAM,
      SLACK_BOT_TOKEN_PARAM,
      SLACK_CHANNEL_ID_PARAM,
    ];

    /** Config params stored as SSM String parameters (not managed by CDK — create via console/CLI). */
    const SSM_CONFIG_PARAM_NAMES = [
      REPOSITORIES_PARAM,
      TICKET_PATTERN_PARAM,
      READY_STATUSES_PARAM,
      QA_STATUSES_PARAM,
    ];

    // Lambda function
    const fn = new nodejs.NodejsFunction(this, 'ReleaseReminderFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(PROJECT_ROOT, 'src', 'handler.ts'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      bundling: {
        minify: true,
        sourceMap: true,
      },
    });

    // Grant the Lambda permission to read SSM parameters
    SSM_PARAM_NAMES.forEach((paramName) => {
      const ssmName = `${SSM_PARAM_PREFIX}${paramName}`;
      const param = ssm.StringParameter.fromSecureStringParameterAttributes(
        this,
        `Param${paramName.replace(/[^a-zA-Z0-9]/g, '')}`,
        { parameterName: ssmName },
      );
      param.grantRead(fn);
    });

    // Grant the Lambda permission to read config SSM String parameters
    SSM_CONFIG_PARAM_NAMES.forEach((paramName) => {
      const ssmName = `${SSM_PARAM_PREFIX}${paramName}`;
      const param = ssm.StringParameter.fromStringParameterName(
        this,
        `ConfigParam${paramName.replace(/[^a-zA-Z0-9]/g, '')}`,
        ssmName,
      );
      param.grantRead(fn);
    });

    // Also grant decrypt on the default SSM key
    fn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['kms:Decrypt'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms:ViaService': `ssm.${this.region}.amazonaws.com`,
          },
        },
      }),
    );

    // Scheduled rule: every Monday at 9am UTC
    const scheduleRule = new events.Rule(this, 'WeeklySchedule', {
      schedule: events.Schedule.cron({
        minute: '0',
        hour: '9',
        weekDay: 'MON',
      }),
    });
    scheduleRule.addTarget(new targets.LambdaFunction(fn));

    // Function URL for manual triggering (no auth for simplicity during testing;
    // in production, switch to AWS_IAM auth)
    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
    });

    // eslint-disable-next-line no-new
    new cdk.CfnOutput(this, 'FunctionUrl', {
      value: fnUrl.url,
      description: 'URL to manually trigger the release reminder Lambda',
    });

    // eslint-disable-next-line no-new
    new cdk.CfnOutput(this, 'FunctionName', {
      value: fn.functionName,
      description:
        'Lambda function name (use "aws lambda invoke" for manual trigger)',
    });
  }
}
