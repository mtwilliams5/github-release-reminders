import { KnownBlock, WebClient } from '@slack/web-api';
import {
  getSecret,
  JIRA_BASE_URL_PARAM,
  SLACK_BOT_TOKEN_PARAM,
  SLACK_CHANNEL_ID_PARAM,
} from '../config';
import { RepositoryReport } from '../types';

let slackClient: WebClient | undefined;

async function getSlackClient(): Promise<WebClient> {
  if (!slackClient) {
    const token = await getSecret(SLACK_BOT_TOKEN_PARAM);
    slackClient = new WebClient(token);
  }
  return slackClient;
}

/**
 * Build a Slack message payload for a repository report.
 */
function buildSlackMessage(
  report: RepositoryReport,
  jiraBaseUrl: string,
): object {
  const blocks: object[] = [];

  /** Format a ticket ID as a Slack link to Jira. */
  const ticketLink = (id: string): string =>
    `<${jiraBaseUrl.replace(/\/$/, '')}/browse/${id}|${id}>`;

  // Header
  blocks.push({
    type: 'header',
    text: {
      type: 'plain_text',
      text: `📦 Unreleased changes: ${report.repository}`,
      emoji: true,
    },
  });

  // Group PRs by readiness
  const readyPrs = report.pullRequests.filter((pr) => pr.readiness === 'ready');
  const qaPrs = report.pullRequests.filter((pr) => pr.readiness === 'qa');
  const otherPrs = report.pullRequests.filter((pr) => pr.readiness === 'other');

  if (readyPrs.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*✅ Ready to Deploy (${readyPrs.length}):*`,
      },
    });
    readyPrs.forEach((pr) => {
      const tickets =
        pr.ticketIds.length > 0
          ? ` [${pr.ticketIds.map(ticketLink).join(', ')}]`
          : '';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <${pr.url}|#${pr.number}> ${pr.title}${tickets}`,
        },
      });
    });
  }

  if (qaPrs.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🧪 In QA (${qaPrs.length}):*`,
      },
    });
    qaPrs.forEach((pr) => {
      const tickets =
        pr.ticketIds.length > 0
          ? ` [${pr.ticketIds.map(ticketLink).join(', ')}]`
          : '';
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <${pr.url}|#${pr.number}> ${pr.title}${tickets}`,
        },
      });
    });
  }

  // Separate direct commits (PR #0) from actual PRs with other statuses
  const directCommits = otherPrs.filter((pr) => pr.number === 0);
  const otherStatusPrs = otherPrs.filter((pr) => pr.number !== 0);

  if (otherStatusPrs.length > 0) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ Other Status (${otherStatusPrs.length}):*`,
      },
    });
    otherStatusPrs.forEach((pr) => {
      let statusSuffix: string;
      if (pr.ticketIds.length === 0) {
        statusSuffix = ' _(no Jira ticket found)_';
      } else {
        const statuses = pr.ticketStatuses
          .map((t) => `${ticketLink(t.ticketId)}: ${t.status}`)
          .join(', ');
        statusSuffix = statuses ? ` [${statuses}]` : '';
      }
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• <${pr.url}|#${pr.number}> ${pr.title}${statusSuffix}`,
        },
      });
    });
  }

  if (directCommits.length > 0) {
    const allCommits = directCommits.flatMap((pr) => pr.commits);
    const MAX_DIRECT_COMMITS = 20;
    const displayed = allCommits.slice(0, MAX_DIRECT_COMMITS);
    const remaining = allCommits.length - displayed.length;
    const heading = `*🔧 Direct Commits — no PR (${allCommits.length}):*`;
    const commitLines = displayed.map((commit) => {
      const shortSha = commit.sha.substring(0, 7);
      const firstLine = commit.message.split('\n')[0];
      return `• \`${shortSha}\` ${firstLine}`;
    });
    if (remaining > 0) {
      commitLines.push(
        `_…and ${remaining} more commit${remaining === 1 ? '' : 's'}_`,
      );
    }

    // Slack section text has a 3000 char limit; chunk lines into blocks that fit
    const MAX_TEXT_LENGTH = 3000;
    let currentText = heading;
    commitLines.forEach((line) => {
      if (`${currentText}\n${line}`.length > MAX_TEXT_LENGTH) {
        blocks.push({
          type: 'section',
          text: { type: 'mrkdwn', text: currentText },
        });
        currentText = line;
      } else {
        currentText = `${currentText}\n${line}`;
      }
    });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: currentText },
    });
  }

  // If mixed statuses, provide tagging guidance
  if (report.hasMixedStatuses && report.latestReadyCommitSha) {
    blocks.push({ type: 'divider' });
    const shortSha = report.latestReadyCommitSha.substring(0, 7);
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `*Partial release guidance:*\n` +
          `The latest commit where all preceding changes are Ready to Deploy is \`${shortSha}\`.\n` +
          `To create a release up to this point:\n` +
          '```\n' +
          `git tag v<version> ${report.latestReadyCommitSha}\n` +
          `git push origin v<version>\n` +
          '```\n' +
          `Then create a release from that tag in GitHub.`,
      },
    });
  }

  return { blocks };
}

/**
 * Build a summary parent message listing all repos with unreleased changes.
 */
function buildSummaryMessage(reports: RepositoryReport[]): object {
  const lines = reports.map((report) => {
    const total = report.pullRequests.length;
    const ready = report.pullRequests.filter(
      (pr) => pr.readiness === 'ready',
    ).length;
    let emoji: string;
    if (ready === total) {
      emoji = '✅';
    } else if (ready > 0) {
      emoji = '⚠️';
    } else {
      emoji = 'ℹ️';
    }
    const releasesUrl = `https://github.com/${report.repository}/releases`;
    return `${emoji} *<${releasesUrl}|${report.repository}>* — ${total} unreleased PR${total === 1 ? '' : 's'} (${ready} ready)`;
  });

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📦 Release Reminder Summary',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: lines.join('\n'),
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `_${reports.length} repositor${reports.length === 1 ? 'y' : 'ies'} with unreleased changes — see thread for details_`,
          },
        ],
      },
    ],
  };
}

/**
 * Post all repository reports to Slack: a summary parent message with
 * individual repo reports as threaded replies.
 */
export async function postSlackReports(
  reports: RepositoryReport[],
): Promise<void> {
  if (reports.length === 0) return;

  const client = await getSlackClient();
  const [channelId, jiraBaseUrl] = await Promise.all([
    getSecret(SLACK_CHANNEL_ID_PARAM),
    getSecret(JIRA_BASE_URL_PARAM),
  ]);

  // Post the summary parent message
  const summaryPayload = buildSummaryMessage(reports) as {
    blocks: KnownBlock[];
  };
  const parentResult = await client.chat.postMessage({
    channel: channelId,
    blocks: summaryPayload.blocks,
    text: `📦 Release Reminder: ${reports.length} repos with unreleased changes`,
  });

  if (!parentResult.ok || !parentResult.ts) {
    throw new Error(
      `Failed to post summary message: ${parentResult.error ?? 'unknown error'}`,
    );
  }

  const threadTs = parentResult.ts;

  // Post each repo report as a threaded reply sequentially
  // eslint-disable-next-line no-restricted-syntax
  await reports.reduce(async (prev, report) => {
    await prev;
    const payload = buildSlackMessage(report, jiraBaseUrl) as {
      blocks: KnownBlock[];
    };
    const result = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      blocks: payload.blocks,
      text: `📦 Unreleased changes: ${report.repository}`,
    });
    if (!result.ok) {
      console.error(
        `Failed to post thread for ${report.repository}: ${result.error ?? 'unknown error'}`,
      );
    }
  }, Promise.resolve());
}

// Exported for testing
export { buildSlackMessage, buildSummaryMessage };
