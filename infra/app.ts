#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ReleaseRemindersStack } from './release-reminders-stack';

const app = new cdk.App();

// eslint-disable-next-line no-new
new ReleaseRemindersStack(app, 'ReleaseRemindersStack');
