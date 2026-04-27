#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { ReleaseRemindersStack } from './release-reminders-stack';

const app = new cdk.App();

new ReleaseRemindersStack(app, 'ReleaseRemindersStack');
