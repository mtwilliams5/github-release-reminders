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

/** SSM parameter / environment variable names for runtime config. */
export const REPOSITORIES_PARAM = 'REPOSITORIES';
export const TICKET_PATTERN_PARAM = 'TICKET_PATTERN';
export const READY_STATUSES_PARAM = 'READY_STATUSES';
export const QA_STATUSES_PARAM = 'QA_STATUSES';

function isLocal(): boolean {
  return process.env.IS_LOCAL === 'true';
}

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
  if (isLocal()) {
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

/**
 * Retrieve an SSM/env parameter, returning a default value if it is not set.
 * When IS_LOCAL=true, reads from environment variables; otherwise from SSM.
 */
async function getParameterOrDefault(
  paramName: string,
  defaultValue: string,
): Promise<string> {
  if (isLocal() && !process.env[paramName]) {
    return defaultValue;
  }
  try {
    return await getSecret(paramName);
  } catch {
    return defaultValue;
  }
}

/** Build config from SSM parameters (or environment variables when IS_LOCAL=true). */
export async function loadConfig(): Promise<ReleaseReminderConfig> {
  const repositories = await getSecret(REPOSITORIES_PARAM);

  const [ticketPattern, readyStatusesRaw, qaStatusesRaw] = await Promise.all([
    getParameterOrDefault(TICKET_PATTERN_PARAM, '\\w+[-\\s]\\d+'),
    getParameterOrDefault(READY_STATUSES_PARAM, 'Ready to Deploy'),
    getParameterOrDefault(QA_STATUSES_PARAM, 'In QA'),
  ]);

  return {
    repositories: repositories.split(',').map((r) => r.trim()),
    ticketPattern,
    readyStatuses: readyStatusesRaw.split(',').map((s) => s.trim()),
    qaStatuses: qaStatusesRaw.split(',').map((s) => s.trim()),
  };
}
