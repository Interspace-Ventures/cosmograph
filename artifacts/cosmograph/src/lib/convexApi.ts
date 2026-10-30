import {
  anyApi,
  type ApiFromModules,
  type FilterApi,
  type FunctionReference,
} from "convex/server";
import type * as account from "../../../../convex/account";
import type * as billing from "../../../../convex/billing";
import type * as referral from "../../../../convex/referral";
import type * as ship from "../../../../convex/ship";
import type * as users from "../../../../convex/users";

/**
 * Typed references to Cosmograph's public Convex functions: the same shape
 * `convex codegen` writes to convex/_generated/api.d.ts. Codegen needs a
 * configured deployment, so until one exists the types are derived here from
 * the function modules directly (type-only imports; nothing from convex/ is
 * bundled into the SPA).
 */
type FullApi = ApiFromModules<{
  account: typeof account;
  billing: typeof billing;
  referral: typeof referral;
  ship: typeof ship;
  users: typeof users;
}>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const api = anyApi as unknown as FilterApi<FullApi, FunctionReference<any, "public">>;
