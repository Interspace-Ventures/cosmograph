import type { Logger } from "pino";

// Provider-neutral Linear integration. LINEAR_API_KEY stays server-side.

export interface CreatedIssue {
  url: string;
  number: number;
}

// Resolved once and reused: which Linear team new issues are filed into. Set
// LINEAR_TEAM_ID to pin a specific team; otherwise the first team is used.
let cachedTeamId: string | null = null;

async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown>,
  log: Logger,
): Promise<T> {
  const apiKey = process.env.LINEAR_API_KEY?.trim();
  if (!apiKey) throw new Error("LINEAR_API_KEY is not configured");
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      Authorization: apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    log.error(
      { status: res.status, detail: detail.slice(0, 500) },
      "linear graphql request failed",
    );
    throw new Error(`Linear responded ${res.status}`);
  }
  const json = (await res.json()) as { data?: T; errors?: unknown };
  if (json.errors) {
    log.error({ errors: json.errors }, "linear graphql returned errors");
    throw new Error("Linear GraphQL error");
  }
  if (!json.data) {
    throw new Error("Linear GraphQL response missing data");
  }
  return json.data;
}

async function resolveTeamId(log: Logger): Promise<string> {
  const fromEnv = process.env.LINEAR_TEAM_ID?.trim();
  if (fromEnv) return fromEnv;
  if (cachedTeamId) return cachedTeamId;
  const data = await linearGraphql<{ teams: { nodes: { id: string }[] } }>(
    `query { teams(first: 1) { nodes { id } } }`,
    {},
    log,
  );
  const team = data.teams.nodes[0];
  if (!team) {
    throw new Error("No Linear team available to file issues into");
  }
  cachedTeamId = team.id;
  return team.id;
}

// Create an issue in the project's Linear workspace from a visitor's message.
export async function createLinearIssue(
  title: string,
  description: string,
  log: Logger,
): Promise<CreatedIssue> {
  const teamId = await resolveTeamId(log);
  const data = await linearGraphql<{
    issueCreate: {
      success: boolean;
      issue: { url: string; number: number } | null;
    };
  }>(
    `mutation IssueCreate($input: IssueCreateInput!) {
       issueCreate(input: $input) {
         success
         issue { url number }
       }
     }`,
    { input: { teamId, title, description } },
    log,
  );
  const created = data.issueCreate;
  if (!created?.success || !created.issue) {
    throw new Error("Linear issueCreate did not return an issue");
  }
  return { url: created.issue.url, number: created.issue.number };
}
