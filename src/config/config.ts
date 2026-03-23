import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { ReleaseReminderConfig } from '../types';

const CACHE_TTL_MS = 5 * 60 * 1000;

/** Prefix applied to SSM parameter names to namespace them for this app. */
export const SSM_PARAM_PREFIX = '/github-release-reminders/';

/** SSM parameter / environment variable names for secrets. */
export const GITHUB_TOKEN_PARAM = 'GITHUB_TOKEN';
export const JIRA_API_TOKEN_PARAM = 'JIRA_API_TOKEN';
export const JIRA_BASE_URL_PARAM = 'JIRA_BASE_URL';
export const JIRA_USER_EMAIL_PARAM = 'JIRA_USER_EMAIL';
export const SLACK_BOT_TOKEN_PARAM = 'SLACK_BOT_TOKEN';
export const SLACK_CHANNEL_ID_PARAM = 'SLACK_CHANNEL_ID';

const IS_LOCAL = process.env.IS_LOCAL === 'true';

let ssmClient: SSMClient | undefined;

function getSsmClient(): SSMClient {
  if (!ssmClient) {
    ssmClient = new SSMClient({});
  }
  return ssmClient;
}

const secretCache = new Map<string, { value: string; expiresAt: number }>();

/**
 * Retrieve a secret value.
 * When IS_LOCAL=true, reads from environment variables instead of SSM.
 */
export async function getSecret(paramName: string): Promise<string> {
  if (IS_LOCAL) {
    const value = process.env[paramName];
    if (!value) {
      throw new Error(
        `Environment variable ${paramName} is required when running locally`,
      );
    }
    return value;
  }

  const cached = secretCache.get(paramName);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value;
  }

  const ssmName = `${SSM_PARAM_PREFIX}${paramName}`;
  const response = await getSsmClient().send(
    new GetParameterCommand({ Name: ssmName, WithDecryption: true }),
  );

  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error(`SSM parameter ${paramName} not found or empty`);
  }

  secretCache.set(paramName, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  return value;
}

/** Build config from environment variables. */
export function loadConfig(): ReleaseReminderConfig {
  const repositories = process.env.REPOSITORIES;
  if (!repositories) {
    throw new Error('REPOSITORIES environment variable is required');
  }

  return {
    repositories: repositories.split(',').map((r) => r.trim()),
    ticketPattern: process.env.TICKET_PATTERN ?? '\\w+[-\\s]\\d+',
    readyStatuses: (process.env.READY_STATUSES ?? 'Ready to Deploy')
      .split(',')
      .map((s) => s.trim()),
    qaStatuses: (process.env.QA_STATUSES ?? 'In QA')
      .split(',')
      .map((s) => s.trim()),
  };
}
