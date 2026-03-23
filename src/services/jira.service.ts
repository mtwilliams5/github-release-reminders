import {
  getSecret,
  JIRA_API_TOKEN_PARAM,
  JIRA_BASE_URL_PARAM,
  JIRA_USER_EMAIL_PARAM,
} from '../config';
import { TicketStatus } from '../types';

interface JiraIssueResponse {
  key: string;
  fields: {
    summary: string;
    status: {
      name: string;
    };
  };
}

/**
 * Query Jira for the status of a single ticket.
 */
async function fetchTicketStatus(ticketId: string): Promise<TicketStatus> {
  const [baseUrl, email, apiToken] = await Promise.all([
    getSecret(JIRA_BASE_URL_PARAM),
    getSecret(JIRA_USER_EMAIL_PARAM),
    getSecret(JIRA_API_TOKEN_PARAM),
  ]);

  const url = `${baseUrl.replace(/\/$/, '')}/rest/api/3/issue/${encodeURIComponent(ticketId)}?fields=summary,status`;
  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64');

  const response = await fetch(url, {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    if (response.status === 404) {
      return {
        ticketId,
        status: 'Unknown',
        summary: `Ticket ${ticketId} not found in Jira`,
      };
    }
    throw new Error(
      `Jira API error for ${ticketId}: ${response.status} ${response.statusText}`,
    );
  }

  const data = (await response.json()) as JiraIssueResponse;
  return {
    ticketId: data.key,
    status: data.fields.status.name,
    summary: data.fields.summary,
  };
}

/**
 * Fetch statuses for multiple Jira tickets in parallel.
 * Deduplicates ticket IDs before querying.
 */
export async function getTicketStatuses(
  ticketIds: string[],
): Promise<Map<string, TicketStatus>> {
  const unique = [...new Set(ticketIds)];
  const results = await Promise.all(unique.map(fetchTicketStatus));

  const statusMap = new Map<string, TicketStatus>();
  results.forEach((result) => {
    statusMap.set(result.ticketId, result);
  });
  return statusMap;
}
