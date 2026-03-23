import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ReleaseRemindersStack } from './release-reminders-stack';

describe('ReleaseRemindersStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new ReleaseRemindersStack(app, 'TestStack', {
      repositories: 'org/repo1,org/repo2',
    });
    template = Template.fromStack(stack);
  });

  it('should create a Lambda function', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1);
  });

  it('should set environment variables on the Lambda', () => {
    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: {
          REPOSITORIES: 'org/repo1,org/repo2',
          TICKET_PATTERN: '\\w+-\\d+',
        },
      },
    });
  });

  it('should create an EventBridge schedule rule', () => {
    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 9 ? * MON *)',
    });
  });

  it('should create a Function URL', () => {
    template.resourceCountIs('AWS::Lambda::Url', 1);
  });

  it('should output the function URL', () => {
    template.hasOutput('FunctionUrl', {});
  });

  it('should create SSM parameters with the prefix', () => {
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/github-release-reminders/GITHUB_TOKEN',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/github-release-reminders/SLACK_BOT_TOKEN',
    });
  });
});
