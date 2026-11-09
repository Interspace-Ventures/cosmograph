# Rollback: Render app + Convex backend

Cosmograph has two halves that roll back separately:

| Half | Staging | Production |
| --- | --- | --- |
| Render web service (Express + built SPA) | `cosmograph-staging` `srv-dbjokvvf3r2c73cna39g` | `cosmograph-production` `srv-dbn7ltbm8hqs73c49rkg` |
| Convex deployment (functions, HTTP actions, env, data) | `shiny-magpie-750` | `marvelous-grouse-975` |

Samir never runs a terminal command for any of this
([no-owner-terminal.md](no-owner-terminal.md)). Every step below is a Render
or Convex dashboard action, a Render API call, or a reviewable PR, done by
Hark. Production steps need Samir's yes first; staging steps are pre-approved.

## Decide what to roll back

1. **Only a feature is misbehaving.** Turn the flag off (step 3). No deploy,
   no build minutes, seconds to take effect on Convex.
2. **The app or the Express server is broken.** Roll back Render (step 1).
3. **Convex functions are broken** (billing, account, Ask Cosmo, `/health`).
   Roll back Convex functions (step 2). Do this together with step 1 when the
   bad change touched both halves, which is the normal case: one merge
   changes both.
4. **Convex env is wrong.** Step 4.
5. **Data is wrong.** Step 5, last resort.

## 1. Render: previous deploy

Render keeps recent build artifacts, so a rollback reuses one and costs no
build minutes.

- Dashboard: service → Deploys → a previous **live** deploy → Rollback →
  Rollback to this deploy. This also switches **auto-deploy off**, so the next
  push to the branch does not redeploy the bad commit.
- API (what Hark uses): `POST https://api.render.com/v1/services/<service id>/rollback`
  with `{"deployId": "<dep-…>"}`. The API does **not** switch auto-deploy off;
  also `PATCH /v1/services/<id>` with `{"autoDeploy": "no"}` until the fix lands.
- The rollback uses the target deploy's start command, build artifact and
  environment variables; it does not overwrite the service's current settings,
  so the next normal deploy uses today's `render.yaml` again.
- Check: `GET /cosmograph/api/health` (staging) or `/api/health` (production)
  returns 200 and `deployment.commit` is the target commit.
- Re-enable auto-deploy once the fix is merged.

A Render rollback does **not** reliably roll back Convex. Render does not
document whether the pre-deploy command runs on a rollback, and on staging the
pre-deploy skips without its Bitwarden token anyway. Read the rollback's
deploy log: if it shows `[convex-deploy] … deploying.` followed by a passing
`smoke test on https://<deployment>.convex.site`, Convex is back too;
otherwise do step 2.

## 2. Convex functions: redeploy the previous commit

Convex has no "undo" for a push. Rolling back means pushing the functions and
schema from the last good commit, which is exactly what the Render pre-deploy
(`scripts/convex/deploy-from-bitwarden.mjs`) does on a normal deploy.

- **Staging** (`shiny-magpie-750`): open a revert PR of the bad merge into
  `staging` (GitHub "Revert" on the merged PR, or `git revert -m 1 <merge>` in
  Hark's sandbox), let it pass the build gate, merge. Render builds the reverted
  commit and its pre-deploy pushes the old functions to `shiny-magpie-750`.
  This costs one build.
- **Production** (`marvelous-grouse-975`): the same revert, promoted to `main`
  through the release PR, after Samir's yes. The production pre-deploy pushes
  only with `COSMOGRAPH_DEPLOYMENT_ENVIRONMENT=production`,
  `COSMOGRAPH_ALLOW_PROD_CONVEX_DEPLOY=1` and a `prod:marvelous-grouse-975|…`
  key from the "Cosmograph Production" Bitwarden project.
- Schema: a push is refused if the old schema no longer matches stored data.
  If the bad change added a table or a required field that has been written
  since, revert to a schema that keeps that table or field `optional`, then
  roll forward.
- Emergency stop without a deploy: Convex dashboard → deployment → Settings →
  **Pause deployment** stops all functions, HTTP actions and crons until it is
  resumed. Everything that depends on Convex (sign-in, checkout, Ask Cosmo)
  is down while paused; the galaxy itself still renders.
- Check: `GET https://<deployment>.convex.site/health` returns 200, and the
  dashboard's History page (Convex Professional) shows the push with the audit
  message `render pre-deploy <commit>`.

## 3. Feature kill switch

Every Convex-served feature is behind a release flag
(`lib/release-flags/src/index.ts`, enforced in `convex/lib/features.ts`).
To turn one off on a Convex deployment, set its env
`FEATURE_FLAG_OVERRIDES=<flag>=off` (comma-separate several), for example
`convex-account=off` (billing, account, unlocks) or `ask-cosmo=off`:

- Fastest: Convex dashboard → deployment → Settings → Environment Variables.
  Takes effect on the next function call; no deploy.
- Durable: also store it in that environment's Bitwarden project as
  `CONVEX_ENV_FEATURE_FLAG_OVERRIDES`, so the next pre-deploy keeps it.
- Keep the SPA in step: `VITE_FEATURE_FLAG_OVERRIDES` in `render.yaml` hides
  the UI; that is a code change (PR) and a build.

The billing kill switch only stops new checkouts. Leave the Stripe webhook
working so payments already in flight still land.

## 4. Convex env

The pre-deploy adds and updates Convex env from `CONVEX_ENV_<NAME>` secrets in
the environment's Bitwarden project; it never deletes.

- Wrong value: set the Bitwarden secret back to the old value and set the
  same value in the Convex dashboard (immediate). The next deploy keeps it.
- Variable that should not exist: delete it in the Convex dashboard and
  remove its `CONVEX_ENV_` secret, or the next deploy brings it back.
- What changed, and when: Convex dashboard → History (Professional).
- To deploy without touching env: `COSMOGRAPH_CONVEX_ENV_SYNC=off` on the
  Render service. To skip the Convex push entirely:
  `COSMOGRAPH_CONVEX_PREDEPLOY=off`.

## 5. Data

Convex keeps backups (dashboard → Backups). Restoring replaces the
deployment's tables with the backup and can take minutes to hours; anything
written since is lost, including Stripe-driven membership changes, which then
need a replay from the Stripe dashboard (resend the events). Production
restores need Samir's yes.

## After any rollback

- Re-enable Render auto-deploy once the fix is merged.
- Note the rollback, the commit and the reason in the PR that fixes it.
