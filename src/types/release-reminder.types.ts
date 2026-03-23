/** Configuration for the release reminder Lambda. */
export interface ReleaseReminderConfig {
  /** GitHub repos to check, in "owner/repo" format. */
  repositories: string[];
  /** Regex pattern string to extract ticket IDs from PR titles. */
  ticketPattern: string;
  /** Jira statuses considered ready to deploy. */
  readyStatuses: string[];
  /** Jira statuses considered in QA. */
  qaStatuses: string[];
}

/** A commit on the default branch not yet included in a release. */
export interface UnreleasedCommit {
  sha: string;
  message: string;
  date: string;
  /** The PR number this commit was merged from, if any. */
  prNumber?: number;
}

/** A pull request with unreleased commits. */
export interface UnreleasedPullRequest {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
  /** Ticket IDs extracted from the PR title. */
  ticketIds: string[];
  /** Commits from this PR that are unreleased. */
  commits: UnreleasedCommit[];
}

/** Jira ticket status information. */
export interface TicketStatus {
  ticketId: string;
  status: string;
  summary: string;
}

/** Classification of a ticket's readiness. */
export type TicketReadiness = 'ready' | 'qa' | 'other';

/** A PR annotated with its Jira ticket statuses and readiness classification. */
export interface ClassifiedPullRequest extends UnreleasedPullRequest {
  ticketStatuses: TicketStatus[];
  /** Overall readiness: 'ready' if ALL tickets are ready, 'qa' if any are in QA, 'other' otherwise. */
  readiness: TicketReadiness;
}

/** Summary of unreleased changes for a single repository. */
export interface RepositoryReport {
  repository: string;
  pullRequests: ClassifiedPullRequest[];
  /** The latest commit SHA where all PRs up to that point are "ready". */
  latestReadyCommitSha?: string;
  /** Whether there is a mix of statuses (needing partial release guidance). */
  hasMixedStatuses: boolean;
}
