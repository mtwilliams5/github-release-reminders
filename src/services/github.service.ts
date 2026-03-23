import { Octokit } from '@octokit/rest';
import { getSecret, GITHUB_TOKEN_PARAM } from '../config';
import { UnreleasedCommit, UnreleasedPullRequest } from '../types';

let octokit: Octokit | undefined;

async function getOctokit(): Promise<Octokit> {
  if (!octokit) {
    const token = await getSecret(GITHUB_TOKEN_PARAM);
    octokit = new Octokit({ auth: token });
  }
  return octokit;
}

/**
 * Get the SHA of the latest release's tag commit.
 * Returns undefined if the repo has no releases.
 */
async function getLatestReleaseSha(
  owner: string,
  repo: string,
): Promise<string | undefined> {
  const client = await getOctokit();
  try {
    const { data: release } = await client.repos.getLatestRelease({
      owner,
      repo,
    });
    // Resolve the tag to a commit SHA
    const { data: ref } = await client.git.getRef({
      owner,
      repo,
      ref: `tags/${release.tag_name}`,
    });
    // Tags can point to a commit directly or to a tag object
    if (ref.object.type === 'tag') {
      const { data: tag } = await client.git.getTag({
        owner,
        repo,
        tag_sha: ref.object.sha,
      });
      return tag.object.sha;
    }
    return ref.object.sha;
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      'status' in err &&
      (err as { status: number }).status === 404
    ) {
      return undefined;
    }
    throw err;
  }
}

/**
 * Get commits on the default branch since the latest release.
 * If no release exists, returns the last 100 commits.
 */
async function getCommitsSinceRelease(
  owner: string,
  repo: string,
): Promise<UnreleasedCommit[]> {
  const client = await getOctokit();
  const releaseSha = await getLatestReleaseSha(owner, repo);

  // Get the default branch
  const { data: repoData } = await client.repos.get({ owner, repo });
  const defaultBranch = repoData.default_branch;

  const params: Parameters<typeof client.repos.listCommits>[0] = {
    owner,
    repo,
    sha: defaultBranch,
    per_page: 100,
  };

  const { data: commits } = await client.repos.listCommits(params);

  // Take commits up to (but not including) the release commit
  const cutoff = releaseSha
    ? commits.findIndex((c) => c.sha === releaseSha)
    : -1;
  const sliced = cutoff >= 0 ? commits.slice(0, cutoff) : commits;

  return sliced.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    date: commit.commit.committer?.date ?? commit.commit.author?.date ?? '',
  }));
}

/**
 * Find the PR that a merge commit belongs to.
 * GitHub merge commits typically contain "Merge pull request #N" or
 * the squash-merge associates the commit with a PR.
 */
async function findPrForCommit(
  owner: string,
  repo: string,
  commitSha: string,
): Promise<
  { number: number; title: string; url: string; mergedAt: string } | undefined
> {
  const client = await getOctokit();
  const { data: prs } = await client.repos.listPullRequestsAssociatedWithCommit(
    {
      owner,
      repo,
      commit_sha: commitSha,
    },
  );

  // Take the first merged PR
  const merged = prs.find((pr) => pr.merged_at);
  if (!merged) return undefined;

  return {
    number: merged.number,
    title: merged.title,
    url: merged.html_url,
    mergedAt: merged.merged_at!,
  };
}

/**
 * Get unreleased changes for a repository, grouped by pull request.
 * Commits not associated with a PR are collected under a synthetic PR number 0.
 */
export async function getUnreleasedPullRequests(
  repoFullName: string,
  ticketPattern: string,
): Promise<UnreleasedPullRequest[]> {
  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) {
    throw new Error(
      `Invalid repository name: ${repoFullName}. Expected "owner/repo" format.`,
    );
  }

  const commits = await getCommitsSinceRelease(owner, repo);
  if (commits.length === 0) return [];

  const prMap = new Map<number, UnreleasedPullRequest>();
  const regex = new RegExp(ticketPattern, 'gi');

  // Resolve PR info for all commits in parallel
  const prInfos = await Promise.all(
    commits.map((commit) => findPrForCommit(owner, repo, commit.sha)),
  );

  commits.forEach((commit, idx) => {
    const prInfo = prInfos[idx];
    const prNumber = prInfo?.number ?? 0;

    if (!prMap.has(prNumber)) {
      const tickets: string[] = [];
      if (prInfo) {
        const matches = prInfo.title.match(regex);
        if (matches) {
          // Normalize ticket IDs: replace spaces with hyphens (e.g. 'PLCON 8398' -> 'PLCON-8398')
          tickets.push(
            ...matches.map((m) => m.replace(/\s+/g, '-').toUpperCase()),
          );
        }
      }

      prMap.set(prNumber, {
        number: prNumber,
        title: prInfo?.title ?? 'Direct commits (no PR)',
        url: prInfo?.url ?? '',
        mergedAt: prInfo?.mergedAt ?? commit.date,
        ticketIds: [...new Set(tickets)],
        commits: [],
      });
    }

    prMap.get(prNumber)!.commits.push({
      ...commit,
      prNumber,
    });
  });

  // Return PRs sorted by merge date descending (most recent first)
  return Array.from(prMap.values()).sort(
    (a, b) => new Date(b.mergedAt).getTime() - new Date(a.mergedAt).getTime(),
  );
}
