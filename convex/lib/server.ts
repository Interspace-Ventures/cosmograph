import {
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
  type ActionBuilder,
  type DataModelFromSchemaDefinition,
  type GenericActionCtx,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type MutationBuilder,
  type QueryBuilder,
} from "convex/server";
import type { GenericId } from "convex/values";
import type schema from "../schema";

/**
 * Typed function builders for Cosmograph's Convex functions.
 *
 * These are exactly what `convex codegen` emits into convex/_generated/server.ts.
 * Phase 1 is scaffold-only with no Convex deployment yet, and `convex codegen`
 * refuses to run without one (CONVEX_DEPLOYMENT), so the builders live here to
 * keep a local typecheck possible.
 *
 * TODO(convex phase 2): once a dev deployment exists, run `npx convex codegen`
 * (or `npx convex dev`), commit convex/_generated, and switch imports from
 * "./lib/server" to "./_generated/server" so the SPA can use the generated
 * `api` object.
 */
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type TableNames = keyof DataModel & string;
export type Doc<T extends TableNames> = DataModel[T]["document"];
export type Id<T extends TableNames> = GenericId<T>;

export type QueryCtx = GenericQueryCtx<DataModel>;
export type MutationCtx = GenericMutationCtx<DataModel>;
export type ActionCtx = GenericActionCtx<DataModel>;

export const query: QueryBuilder<DataModel, "public"> = queryGeneric;
export const internalQuery: QueryBuilder<DataModel, "internal"> =
  internalQueryGeneric;
export const mutation: MutationBuilder<DataModel, "public"> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, "internal"> =
  internalMutationGeneric;
export const internalAction: ActionBuilder<DataModel, "internal"> =
  internalActionGeneric;
export const httpAction = httpActionGeneric;
