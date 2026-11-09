# Linting

`pnpm run lint` runs ESLint over the whole repo with the flat config in
`eslint.config.mjs`. It is part of `pnpm run gate`, which the Render staging
build runs before `deploy:build`: any lint **error** fails the deploy.

## Libraries-first assessment (2026-11-08)

| Candidate | For | Against |
| --- | --- | --- |
| **ESLint 10 + typescript-eslint 8 + eslint-plugin-react-hooks 7** | The standard. The React team's own hooks rules (rules-of-hooks, exhaustive-deps and the React Compiler checks) only exist as an ESLint plugin. typescript-eslint tracks TypeScript releases. Large rule ecosystem if we need more later. | More packages in the lockfile (dev only). Slower than a native linter (about 20 s on this repo on 2 CPUs). |
| Biome 2 | One native binary, very fast, lint and format in one tool. | Its hooks rule is a port, not the React team's; no React Compiler checks; we would still want ESLint for react-hooks, so it adds a tool instead of replacing one. Formatting is already Prettier. |
| oxlint | Very fast, ESLint-compatible rule names. | Partial coverage of typescript-eslint and react-hooks rules; it is usually run next to ESLint, not instead of it. |

Pick: **ESLint**, because the rules that catch real bugs in this codebase
(hooks order and dependencies in the R3F scene code, TypeScript misuse) are
the canonical implementations there, and its 20 s cost is small inside a build
that already type-checks.

## Rule set

The stock presets: `@eslint/js` recommended, `typescript-eslint` recommended
(not type-aware, to keep it fast), and `react-hooks` recommended for
`artifacts/cosmograph` and `artifacts/trailer`.

## Baseline

At adoption the code had 71 findings and no behavior was changed to silence
them. Each rule that fired is listed in `BASELINE` / `HOOKS_BASELINE` in
`eslint.config.mjs` as a warning, with its count:

- React Compiler advisories (immutability 15, set-state-in-effect 9,
  preserve-manual-memoization 9, refs 7, purity 5): the three.js scene code
  mutates refs and objects on purpose; changing it is product work with its
  own review.
- `no-useless-assignment` 12 (defensive `let x = fallback; try { … }`),
  `no-explicit-any` 5, `no-unused-expressions` 3, `no-unused-vars` 2.
- `react-hooks/exhaustive-deps` is a warning in the preset itself (4).

Every other recommended rule is an error, so new code that breaks one fails
the gate. Shrink the baseline when touching those files; never add a rule to
it to get a new violation through.
