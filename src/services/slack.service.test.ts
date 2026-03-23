import { buildSlackMessage, buildSummaryMessage } from './slack.service';
import { RepositoryReport, ClassifiedPullRequest } from '../types';

const JIRA_BASE_URL = 'https://org.atlassian.net';

function makePr(
  overrides: Partial<ClassifiedPullRequest> = {},
): ClassifiedPullRequest {
  return {
    number: 1,
    title: 'PLCON-123 Fix something',
    url: 'https://github.com/org/repo/pull/1',
    mergedAt: '2026-03-10T12:00:00Z',
    ticketIds: ['PLCON-123'],
    commits: [
      {
        sha: 'abc1234',
        message: 'fix',
        date: '2026-03-10T12:00:00Z',
        prNumber: 1,
      },
    ],
    ticketStatuses: [
      {
        ticketId: 'PLCON-123',
        status: 'Ready to Deploy',
        summary: 'Fix something',
      },
    ],
    readiness: 'ready',
    ...overrides,
  };
}

describe('buildSlackMessage', () => {
  it('should include header with repo name', () => {
    const report: RepositoryReport = {
      repository: 'org/repo',
      pullRequests: [makePr()],
      hasMixedStatuses: false,
    };

    const message = buildSlackMessage(report, JIRA_BASE_URL) as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };

    expect(message.blocks[0].type).toBe('header');
    expect(message.blocks[0].text?.text).toContain('org/repo');
  });

  it('should group PRs by readiness', () => {
    const report: RepositoryReport = {
      repository: 'org/repo',
      pullRequests: [
        makePr({ number: 1, readiness: 'ready' }),
        makePr({ number: 2, readiness: 'qa', title: 'PLCON-456 QA thing' }),
        makePr({
          number: 3,
          readiness: 'other',
          title: 'PLCON-789 Other thing',
          ticketIds: ['PLCON-789'],
          ticketStatuses: [
            {
              ticketId: 'PLCON-789',
              status: 'In Progress',
              summary: 'Other thing',
            },
          ],
        }),
      ],
      hasMixedStatuses: true,
      latestReadyCommitSha: 'abc1234567890',
    };

    const message = buildSlackMessage(report, JIRA_BASE_URL) as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const texts = message.blocks
      .filter(
        (b: { type: string; text?: { text: string } }) => b.type === 'section',
      )
      .map(
        (b: { type: string; text?: { text: string } }) => b.text?.text ?? '',
      );

    expect(texts.some((t: string) => t.includes('Ready to Deploy'))).toBe(true);
    expect(texts.some((t: string) => t.includes('In QA'))).toBe(true);
    expect(texts.some((t: string) => t.includes('Other Status'))).toBe(true);
  });

  it('should show "no Jira ticket found" for PRs with no ticket IDs', () => {
    const report: RepositoryReport = {
      repository: 'org/repo',
      pullRequests: [
        makePr({
          number: 5,
          readiness: 'other',
          title: 'Fix typo in readme',
          ticketIds: [],
          ticketStatuses: [],
        }),
      ],
      hasMixedStatuses: false,
    };

    const message = buildSlackMessage(report, JIRA_BASE_URL) as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const allText = JSON.stringify(message);

    expect(allText).toContain('no Jira ticket found');
    expect(allText).not.toContain('#0');
  });

  it('should render direct commits without PR link formatting', () => {
    const report: RepositoryReport = {
      repository: 'org/repo',
      pullRequests: [
        makePr({
          number: 0,
          readiness: 'other',
          title: 'Direct commits (no PR)',
          url: '',
          ticketIds: [],
          ticketStatuses: [],
          commits: [
            {
              sha: 'deadbeef1234567',
              message: 'quick hotfix',
              date: '2026-03-10T12:00:00Z',
              prNumber: 0,
            },
          ],
        }),
      ],
      hasMixedStatuses: false,
    };

    const message = buildSlackMessage(report, JIRA_BASE_URL) as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const allText = JSON.stringify(message);

    expect(allText).toContain('Direct Commits');
    expect(allText).toContain('deadbee');
    expect(allText).toContain('quick hotfix');
    expect(allText).not.toContain('<|#0>');
  });

  it('should include tagging guidance for mixed statuses', () => {
    const report: RepositoryReport = {
      repository: 'org/repo',
      pullRequests: [
        makePr({ number: 1, readiness: 'ready' }),
        makePr({ number: 2, readiness: 'qa' }),
      ],
      hasMixedStatuses: true,
      latestReadyCommitSha: 'abc1234567890def',
    };

    const message = buildSlackMessage(report, JIRA_BASE_URL) as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const allText = JSON.stringify(message);

    expect(allText).toContain('abc1234');
    expect(allText).toContain('git tag');
    expect(allText).toContain('Partial release guidance');
  });

  it('should not include tagging guidance when all statuses are the same', () => {
    const report: RepositoryReport = {
      repository: 'org/repo',
      pullRequests: [makePr({ readiness: 'ready' })],
      hasMixedStatuses: false,
    };

    const message = buildSlackMessage(report, JIRA_BASE_URL) as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const allText = JSON.stringify(message);

    expect(allText).not.toContain('Partial release guidance');
  });
});

describe('buildSummaryMessage', () => {
  it('should list all repos with PR counts', () => {
    const reports: RepositoryReport[] = [
      {
        repository: 'org/repo1',
        pullRequests: [
          makePr({ readiness: 'ready' }),
          makePr({ number: 2, readiness: 'qa' }),
        ],
        hasMixedStatuses: true,
      },
      {
        repository: 'org/repo2',
        pullRequests: [makePr({ readiness: 'ready' })],
        hasMixedStatuses: false,
      },
    ];

    const message = buildSummaryMessage(reports) as {
      blocks: Array<{ type: string; text?: { text: string } }>;
    };
    const allText = JSON.stringify(message);

    expect(message.blocks[0].type).toBe('header');
    expect(allText).toContain('Release Reminder Summary');
    expect(allText).toContain('org/repo1');
    expect(allText).toContain('org/repo2');
    expect(allText).toContain('2 repositories');
  });
});
