import OpenAI from "openai";

// Ask Cosmo is optional infrastructure. Keep the public galaxy and the rest of
// the API online when an OpenAI connection has not been configured yet.
//
// This module never reads the API key from env itself: the API server loads
// it at boot (from Bitwarden Secrets Manager on hosted builds, env only in
// local dev) and hands it over through configureOpenAI. The base URL is non-secret config;
// unset means the OpenAI SDK default (https://api.openai.com/v1).
let client: OpenAI | null = null;

export function configureOpenAI(
  config: { apiKey: string; baseURL?: string | null } | null,
): void {
  client = config
    ? new OpenAI({
        apiKey: config.apiKey,
        ...(config.baseURL?.trim() ? { baseURL: config.baseURL.trim() } : {}),
      })
    : null;
}

/** The configured client, or null while Ask Cosmo is disabled. */
export function getOpenAI(): OpenAI | null {
  return client;
}
