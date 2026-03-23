import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ReleaseRemindersStack } from './release-reminders-stack';

describe('ReleaseRemindersStack', () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new ReleaseRemindersStack(app, 'TestStack');
    template = Template.fromStack(stack);
  });

  it('should create a Lambda function', () => {
    template.resourceCountIs('AWS::Lambda::Function', 1);
  });

  it('should not set config environment variables on the Lambda', () => {
    const functions = template.findResources('AWS::Lambda::Function');
    const fnKey = Object.keys(functions)[0];
    const envVars = functions[fnKey].Properties?.Environment?.Variables ?? {};
    expect(envVars).not.toHaveProperty('REPOSITORIES');
    expect(envVars).not.toHaveProperty('TICKET_PATTERN');
    expect(envVars).not.toHaveProperty('READY_STATUSES');
    expect(envVars).not.toHaveProperty('QA_STATUSES');
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

  it('should not create CDK-managed SSM parameters', () => {
    template.resourceCountIs('AWS::SSM::Parameter', 0);
  });
});
