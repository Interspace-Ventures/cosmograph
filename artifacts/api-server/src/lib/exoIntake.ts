import { createHmac, randomUUID } from "node:crypto";

const REQUEST_TIMEOUT_MS = 10_000;

function configuration() {
  const apiUrl = process.env.EXO_INTAKE_API_URL?.trim();
  const secret = process.env.EXO_INTAKE_SECRET?.trim();
  if (!apiUrl || !secret || secret.length < 32) {
    throw new Error("EXO intake is not configured securely");
  }
  return { apiUrl: apiUrl.replace(/\/$/, ""), secret };
}

export async function createExoWorkItem(input: {
  kind: "bug" | "feature";
  title: string;
  description: string;
}) {
  const { apiUrl, secret } = configuration();
  const body = JSON.stringify({
    schemaVersion: "exo.intake.v1",
    requestId: randomUUID(),
    kind: input.kind,
    title: input.title,
    description: input.description,
    priority: 0,
  });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}\n${body}`)
    .digest("hex");
  const response = await fetch(`${apiUrl}/v1/intake/work`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Exo-App": "cosmograph",
      "X-Exo-Timestamp": timestamp,
      "X-Exo-Signature": `sha256=${signature}`,
    },
    body,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const result = (await response.json().catch(() => null)) as {
    trackingId?: unknown;
    identifier?: unknown;
    error?: unknown;
  } | null;
  if (
    !response.ok ||
    typeof result?.trackingId !== "string" ||
    typeof result.identifier !== "string"
  ) {
    throw new Error(
      typeof result?.error === "string" ? result.error : `EXO intake returned ${response.status}`,
    );
  }
  return { trackingId: result.trackingId, identifier: result.identifier };
}
