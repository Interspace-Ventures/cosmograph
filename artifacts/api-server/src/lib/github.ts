import { ReplitConnectors } from "@replit/connectors-sdk";
import type { Logger } from "pino";

// GitHub integration (Replit connector). The connector proxy injects the OAuth
// token automatically and refreshes it as needed, so we never handle a token.
// See the GitHub blueprint added via the integrations system.

const REPO = process.env.GITHUB_REPO || "heyinterspace/cosmograph";

export interface CreatedIssue {
  url: string;
  number: number;
}

// Create a public issue on the project repo from a visitor's bug/feature message.
export async function createGithubIssue(
  title: string,
  body: string,
  labels: string[],
  log: Logger,
): Promise<CreatedIssue> {
  const connectors = new ReplitConnectors();
  const res = await connectors.proxy("github", `/repos/${REPO}/issues`, {
    method: "POST",
    body: { title, body, labels },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    log.error(
      { status: res.status, detail: detail.slice(0, 500) },
      "github issue creation failed",
    );
    throw new Error(`GitHub responded ${res.status}`);
  }
  const json = (await res.json()) as {
    html_url?: string;
    number?: number;
  };
  if (!json.html_url || typeof json.number !== "number") {
    throw new Error("GitHub issue response missing url/number");
  }
  return { url: json.html_url, number: json.number };
}
