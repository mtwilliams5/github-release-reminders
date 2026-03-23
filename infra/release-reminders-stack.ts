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
  SSM_PARAM_PREFIX,
} from '../src/config';

interface ReleaseRemindersStackProps extends cdk.StackProps {
  /** Comma-separated list of "owner/repo" repositories to monitor. */
  repositories: string;
  /** Ticket pattern regex (default: \w+-\d+). */
  ticketPattern?: string;
  /** Comma-separated Jira statuses considered ready (default: Ready to Deploy). */
  readyStatuses?: string;
  /** Comma-separated Jira statuses considered in QA (default: In QA). */
  qaStatuses?: string;
}

export class ReleaseRemindersStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ReleaseRemindersStackProps) {
    super(scope, id, props);

    const SSM_PARAM_NAMES = [
      GITHUB_TOKEN_PARAM,
      JIRA_API_TOKEN_PARAM,
      JIRA_BASE_URL_PARAM,
      JIRA_USER_EMAIL_PARAM,
      SLACK_BOT_TOKEN_PARAM,
      SLACK_CHANNEL_ID_PARAM,
    ];

    // Create SSM SecureString parameters (initial dummy values; real values
    // should be set out-of-band via the AWS Console or CLI)
    SSM_PARAM_NAMES.forEach((paramName) => {
      const ssmName = `${SSM_PARAM_PREFIX}${paramName}`;
      // eslint-disable-next-line no-new
      new ssm.StringParameter(this, `SsmParam${paramName}`, {
        parameterName: ssmName,
        stringValue: 'REPLACE_ME',
        description: `${paramName} for github-release-reminders`,
      });
    });

    // Lambda function
    const fn = new nodejs.NodejsFunction(this, 'ReleaseReminderFn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: path.join(__dirname, '..', 'src', 'handler.ts'),
      timeout: cdk.Duration.minutes(5),
      memorySize: 256,
      environment: {
        REPOSITORIES: props.repositories,
        TICKET_PATTERN: props.ticketPattern ?? '\\w+-\\d+',
        READY_STATUSES: props.readyStatuses ?? 'Ready to Deploy',
        QA_STATUSES: props.qaStatuses ?? 'In QA',
      },
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
