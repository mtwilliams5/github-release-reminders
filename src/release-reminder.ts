import {
  ClassifiedPullRequest,
  ReleaseReminderConfig,
  RepositoryReport,
  TicketReadiness,
  UnreleasedPullRequest,
} from './types';
import {
  getUnreleasedPullRequests,
  getTicketStatuses,
  postSlackReports,
} from './services';

/**
 * Classify a PR's readiness based on its referenced Jira tickets.
 * - 'ready' if all tickets are in a ready status
 * - 'qa' if any ticket is in QA
 * - 'other' for anything else
 * - PRs with no tickets default to 'other'
 */
function classifyReadiness(
  pr: UnreleasedPullRequest,
  ticketStatusMap: Map<string, { status: string }>,
  config: ReleaseReminderConfig,
): TicketReadiness {
  if (pr.ticketIds.length === 0) return 'other';

  const statuses = pr.ticketIds.map(
    (id) => ticketStatusMap.get(id)?.status ?? 'Unknown',
  );

  const allReady = statuses.every((s) =>
    config.readyStatuses.some((rs) => rs.toLowerCase() === s.toLowerCase()),
  );
  if (allReady) return 'ready';

  const anyQa = statuses.some((s) =>
    config.qaStatuses.some((qs) => qs.toLowerCase() === s.toLowerCase()),
  );
  if (anyQa) return 'qa';

  return 'other';
}

/**
 * Find the latest commit SHA where all PRs merged up to that point are 'ready'.
 *
 * We walk commits from oldest to newest (chronological order on the default branch).
 * We track which PRs each commit belongs to. As long as all PRs encountered so far
 * are 'ready', we update the candidate SHA.  Once we encounter a non-ready PR,
 * we stop advancing the candidate.
 */
function findLatestReadyCommitSha(
  pullRequests: ClassifiedPullRequest[],
): string | undefined {
  // Build a flat list of commits in merge order (oldest first)
  // PRs are sorted most-recent-first, so we reverse
  const sortedPrs = [...pullRequests].sort(
    (a, b) => new Date(a.mergedAt).getTime() - new Date(b.mergedAt).getTime(),
  );

  // Take the leading run of 'ready' PRs and find the last commit SHA
  const firstNonReady = sortedPrs.findIndex((pr) => pr.readiness !== 'ready');

  let leading: ClassifiedPullRequest[];
  if (firstNonReady === -1) {
    // All PRs are ready
    leading = sortedPrs;
  } else if (firstNonReady === 0) {
    // First PR is not ready, no leading ready prefix
    leading = [];
  } else {
    leading = sortedPrs.slice(0, firstNonReady);
  }

  if (leading.length === 0) return undefined;

  const lastPr = leading[leading.length - 1];
  const lastCommit = lastPr.commits[lastPr.commits.length - 1];
  return lastCommit?.sha;
}

/**
 * Process a single repository: fetch unreleased PRs, classify them, and build a report.
 */
async function processRepository(
  repoFullName: string,
  config: ReleaseReminderConfig,
): Promise<RepositoryReport | undefined> {
  const pullRequests = await getUnreleasedPullRequests(
    repoFullName,
    config.ticketPattern,
  );

  if (pullRequests.length === 0) {
    return undefined;
  }

  // Collect all unique ticket IDs across all PRs
  const allTicketIds = pullRequests.flatMap((pr) => pr.ticketIds);
  const ticketStatusMap =
    allTicketIds.length > 0 ? await getTicketStatuses(allTicketIds) : new Map();

  // Classify each PR
  const classified: ClassifiedPullRequest[] = pullRequests.map((pr) => ({
    ...pr,
    ticketStatuses: pr.ticketIds
      .map((id) => ticketStatusMap.get(id))
      .filter(
        (status): status is NonNullable<typeof status> => status !== undefined,
      ),
    readiness: classifyReadiness(pr, ticketStatusMap, config),
  }));

  const readinessValues = new Set(classified.map((pr) => pr.readiness));
  const hasMixedStatuses = readinessValues.size > 1;

  const latestReadyCommitSha = hasMixedStatuses
    ? findLatestReadyCommitSha(classified)
    : undefined;

  return {
    repository: repoFullName,
    pullRequests: classified,
    latestReadyCommitSha,
    hasMixedStatuses,
  };
}

/**
 * Main orchestrator: process all configured repos and post a single
 * Slack summary with threaded replies for each repo.
 */
export async function processReleaseReminders(
  config: ReleaseReminderConfig,
): Promise<void> {
  // Collect reports for all repos
  const reports: RepositoryReport[] = [];
  await config.repositories.reduce(async (prev, repo) => {
    await prev;
    try {
      const report = await processRepository(repo, config);
      if (report) {
        reports.push(report);
      }
    } catch (err) {
      console.error(`Error processing ${repo}:`, err);
    }
  }, Promise.resolve());

  // Post all reports as a single summary + threaded replies
  if (reports.length > 0) {
    await postSlackReports(reports);
  }
}
