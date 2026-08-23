export function parseExactOrigins(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function authEnvironmentErrors(input: {
  appEnvironment?: string;
  authorizedParties?: string;
  publishableKey?: string;
  secretKey?: string;
}): string[] {
  const errors: string[] = [];
  const origins = parseExactOrigins(input.authorizedParties);
  const productionLike =
    input.appEnvironment === "production" || input.appEnvironment === "release-candidate";

  if (!input.publishableKey || !input.secretKey) errors.push("Clerk keys are missing");
  if (origins.length === 0) errors.push("Clerk authorized parties are missing");
  if (origins.some((origin) => {
    if (origin.includes("*")) return true;
    try {
      const parsed = new URL(origin);
      return parsed.protocol !== "https:" || parsed.origin !== origin;
    } catch {
      return true;
    }
  })) {
    errors.push("Clerk authorized parties must be exact HTTPS origins");
  }
  if (
    productionLike &&
    (!input.publishableKey?.startsWith("pk_live_") || !input.secretKey?.startsWith("sk_live_"))
  ) {
    errors.push("Production-like environments require matching Clerk live keys");
  }

  return errors;
}
