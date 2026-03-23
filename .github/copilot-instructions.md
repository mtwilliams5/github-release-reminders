---
applyTo: '**'
---
<!-- This file is auto-generated from AGENTS.md. Edit AGENTS.md and run 'yarn sync:agent-instructions' to update. -->

## Language & Tooling

- **TypeScript** with strict mode, ES2024 target, CommonJS modules
- **Node.js 24.x** runtime for Lambda functions
- **yarn** for package management
- **AWS CDK** for infrastructure as code
- **ESLint** with Airbnb base + Prettier (no `for...of` loops; use array methods instead)

## Code Style

- **Constants**: ALL_CAPS (e.g., `GITHUB_TOKEN_PARAM`, `CACHE_TTL_MS`, `SLACK_BOT_TOKEN_PARAM`)
- **Interfaces/Types**: PascalCase (e.g., `ReleaseReminderConfig`, `RepositoryReport`, `ClassifiedPullRequest`)
- **Functions**: camelCase (e.g., `handler`, `getSecret`, `loadConfig`, `processReleaseReminders`)
- **Variables**: camelCase (e.g., `octokit`, `ssmClient`, `ticketStatusMap`, `secretCache`); prefer descriptive names over single-character abbreviations so intent is clear at a glance
- **Files**: kebab-case with descriptive suffixes (e.g., `release-reminder.ts`, `github.service.ts`, `release-reminder.types.ts`)
- **Import organization**: External packages first, then local imports; group by source
- **Singleton clients**: Module-level lazy singletons for API clients (`octokit`, `ssmClient`) — Lambda module caching reuses the same instance across warm invocations
- **Comments**: JSDoc for exported functions/types; inline comments for code sections explaining "why" not "what"
- **Type safety**: Use union types for constrained values (e.g., `'ready' | 'qa' | 'other'`); explicit return types on exported functions
- **Error messages**: Specific and actionable, include what was expected
- **Linting**: Airbnb config disallows `for...of` — use `.forEach()`, `.map()`, `.reduce()`, `.filter()`, etc. Use `Promise.all()` over `await`-in-loop where possible

## Project Structure

```
src/
  handler.ts              # Lambda entry point — exports handler()
  release-reminder.ts     # Core orchestration logic
  config/
    config.ts             # Environment/SSM config loading and secret retrieval
    config.test.ts        # Config loading tests
    index.ts              # Barrel export
  services/
    github.service.ts     # GitHub API via Octokit (releases, commits, PRs)
    jira.service.ts       # Jira REST API (ticket statuses)
    slack.service.ts      # Slack Web API message building and posting with threading
    slack.service.test.ts # Slack message building tests
    index.ts              # Barrel export
  types/
    release-reminder.types.ts  # All shared interfaces and type aliases
    index.ts              # Barrel export
infra/
  app.ts                  # CDK app entry point
  release-reminders-stack.ts       # CDK stack (Lambda, EventBridge, Function URL)
  release-reminders-stack.test.ts  # CDK infrastructure assertion tests
```

## Architecture

The Lambda runs on a schedule (Monday 9am UTC) and can also be triggered manually via its Function URL.

**Processing pipeline:**

1. Load config from environment variables; secrets from SSM (or env vars when `IS_LOCAL=true`)
2. For each configured repository:
   - Fetch the latest release tag and get commits since that release
   - Group commits by pull request, extracting Jira ticket IDs from PR titles
   - Query Jira for ticket statuses in parallel
   - Classify each PR as `ready`, `qa`, or `other` based on ticket statuses
   - If mixed statuses exist, identify the latest commit where all preceding PRs are ready
3. Post a Slack summary message listing all repos, with individual repo reports as threaded replies

**Key services:**

- `getUnreleasedPullRequests(repo, ticketPattern)` — GitHub data fetching and PR grouping
- `getTicketStatuses(ticketIds)` — Parallel Jira lookups with deduplication
- `postSlackReports(reports)` — Posts summary + threaded replies via Slack Web API

## Configuration

**Environment variables** (set on the Lambda, or in `.env` for local testing):

| Variable         | Required | Default           | Description                                   |
| ---------------- | -------- | ----------------- | --------------------------------------------- |
| `REPOSITORIES`   | Yes      | —                 | Comma-separated `owner/repo` list             |
| `TICKET_PATTERN` | No       | `\w+[-\s]\d+`     | Regex to extract ticket IDs from PR titles    |
| `READY_STATUSES` | No       | `Ready to Deploy` | Comma-separated Jira statuses meaning "ready" |
| `QA_STATUSES`    | No       | `In QA`           | Comma-separated Jira statuses meaning "in QA" |
| `IS_LOCAL`       | No       | —                 | Set to `true` to read secrets from env vars   |

**Secrets** (SSM SecureString parameters in AWS, or env vars when `IS_LOCAL=true`):

| Parameter Name      | Description                                           |
| ------------------- | ----------------------------------------------------- |
| `GITHUB_TOKEN`      | GitHub PAT with repo read access                      |
| `JIRA_API_TOKEN`    | Jira API token                                        |
| `JIRA_BASE_URL`     | Jira instance URL (e.g., `https://org.atlassian.net`) |
| `JIRA_USER_EMAIL`   | Jira user email for Basic auth                        |
| `SLACK_BOT_TOKEN`   | Slack Bot User OAuth Token (`xoxb-...`)               |
| `SLACK_CHANNEL_ID`  | Slack channel ID to post messages to                  |

## Local Development

1. Copy `.env.example` to `.env` and populate with real values
2. Run the handler locally with `IS_LOCAL=true` to bypass SSM

## Build & Deploy Commands

- `yarn build` — Compile TypeScript (cleans dist/ first)
- `yarn test` — Run Jest tests
- `yarn lint` — ESLint with Airbnb + Prettier
- `yarn deploy` — Build and deploy CDK stack to AWS
- `yarn diff` — Build and show CDK infrastructure changes
- `yarn sync:agent-instructions` — Sync AGENTS.md to `.github/copilot-instructions.md`

## Testing Conventions

- Test files live alongside the files they test (e.g., `config.ts` and `config.test.ts` in the same directory)
- File naming: `<module>.test.ts` (e.g., `config.test.ts`, `slack.service.test.ts`)
- A separate `tsconfig.test.json` at the project root includes test files for Jest and ESLint
- Use `jest.mock()` for external dependencies
- CDK tests use `aws-cdk-lib/assertions` (`Template.fromStack`, `hasResourceProperties`)
- Service tests import internal functions directly (e.g., `buildSlackMessage` is exported for testing)
