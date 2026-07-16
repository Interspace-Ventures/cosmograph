import OpenAI from "openai";

const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const baseURL = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;

// Ask Cosmo is optional infrastructure. Keep the public galaxy and the rest of
// the API online when an OpenAI connection has not been configured yet.
export const openai =
  apiKey && baseURL
    ? new OpenAI({
        apiKey,
        baseURL,
      })
    : null;
