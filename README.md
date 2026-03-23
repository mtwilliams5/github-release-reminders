# GitHub Release Reminders

An AWS Lambda service that monitors GitHub repositories for unreleased changes and posts Slack notifications about release readiness, with Jira ticket status integration.

## How It Works

On a schedule (Monday 9am UTC), or when triggered manually, the service:

1. Fetches all commits on each configured repository's default branch since its latest release
2. Associates commits with pull requests and extracts Jira ticket IDs from PR titles
3. Queries Jira for ticket statuses and classifies each PR as **ready**, **in QA**, or **other**
4. If only a subset of changes are ready, identifies the latest commit SHA where all preceding PRs are ready and generates a git tag command
5. Posts a threaded Slack report — one summary message with a reply per repository

## Prerequisites

- Node.js 24.x
- yarn
- AWS CLI configured with credentials
- AWS CDK CLI: `npm install -g aws-cdk`

## Local Development

```bash
yarn install
cp .env.example .env   # fill in values (see Configuration below)
IS_LOCAL=true yarn start
```

## Configuration

### Runtime Config (SSM String Parameters)

These are stored as SSM String parameters under `/github-release-reminders/` and can be updated at any time without redeploying:

| SSM Parameter Name | Required | Default           | Description                                                    |
| ------------------ | -------- | ----------------- | -------------------------------------------------------------- |
| `REPOSITORIES`     | Yes      | —                 | Comma-separated `owner/repo` list (e.g. `org/repo1,org/repo2`) |
| `TICKET_PATTERN`   | No       | `\w+[-\s]\d+`     | Regex to extract Jira ticket IDs from PR titles                |
| `READY_STATUSES`   | No       | `Ready to Deploy` | Comma-separated Jira statuses meaning a PR is ready            |
| `QA_STATUSES`      | No       | `In QA`           | Comma-separated Jira statuses meaning a PR is in QA            |

Create them via the AWS CLI (prefix each name with `/github-release-reminders/`):

```bash
aws ssm put-parameter \
  --name /github-release-reminders/REPOSITORIES \
  --value "org/repo1,org/repo2" \
  --type String \
  --overwrite
```

For local development, set `IS_LOCAL=true` and provide these as environment variables instead.

### Secrets (SSM SecureString Parameters)

In production, secrets are stored as SSM SecureString parameters under `/github-release-reminders/`. For local development, set `IS_LOCAL=true` and provide them as environment variables.

| Secret             | Description                                          |
| ------------------ | ---------------------------------------------------- |
| `GITHUB_TOKEN`     | GitHub Personal Access Token (repo read access)      |
| `JIRA_BASE_URL`    | Jira instance URL (e.g. `https://org.atlassian.net`) |
| `JIRA_USER_EMAIL`  | Jira Basic Auth email                                |
| `JIRA_API_TOKEN`   | Jira API token                                       |
| `SLACK_BOT_TOKEN`  | Slack Bot User OAuth Token (`xoxb-...`)              |
| `SLACK_CHANNEL_ID` | Slack channel ID to post messages to                 |

## Deployment

The CDK stack creates a Lambda function, EventBridge schedule, Function URL, SSM parameters for secrets, and the required IAM role.

```bash
# Preview infrastructure changes
yarn diff

# Deploy
yarn deploy
```

After the initial deployment, create the runtime config SSM parameters and update the secret SSM parameters with real values:

```bash
# Runtime config (String parameters)
aws ssm put-parameter \
  --name /github-release-reminders/REPOSITORIES \
  --value "org/repo1,org/repo2" \
  --type String \
  --overwrite

# Secrets (SecureString parameters)
aws ssm put-parameter \
  --name /github-release-reminders/GITHUB_TOKEN \
  --value "your-token-here" \
  --type SecureString \
  --overwrite
```

## Commands

| Command       | Description                  |
| ------------- | ---------------------------- |
| `yarn build`  | Compile TypeScript           |
| `yarn test`   | Run tests                    |
| `yarn lint`   | Run ESLint                   |
| `yarn diff`   | Show CDK infrastructure diff |
| `yarn deploy` | Deploy to AWS                |

## CI/CD

To deploy this to your own infrastructure, either fork the repository and add your CI config, or create your repository using this one as a template (if you require your repo to be private, for example).
