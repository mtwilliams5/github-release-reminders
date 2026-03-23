#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ReleaseRemindersStack } from './release-reminders-stack';

const app = new cdk.App();

// eslint-disable-next-line no-new
new ReleaseRemindersStack(app, 'ReleaseRemindersStack', {
  // Configure repos via CDK context or defaults
  repositories: app.node.tryGetContext('repositories') ?? 'your-org/your-repo',
  ticketPattern: app.node.tryGetContext('ticketPattern'),
  readyStatuses: app.node.tryGetContext('readyStatuses'),
  qaStatuses: app.node.tryGetContext('qaStatuses'),
});
