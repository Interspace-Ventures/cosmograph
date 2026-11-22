#!/usr/bin/env node
// Retired-names guard (mirrors Exo's `check:names` entry for the retired secrets provider).
// 2026-11-13: secrets provider changed to Bitwarden. Samir: "We're using Bitwarden everywhere. We
// shouldn't be talking about 1Password at all." This fails when any tracked text file mentions the
// old provider, its SDK, its secret-reference scheme or its service-account token variable.
// Bitwarden Secrets Manager (BWS_ACCESS_TOKEN) is the only secrets provider.
//
// Same pattern as Exo's config/names.registry.json: 1password|onepassword|\bop://|OP_SERVICE_ACCOUNT_TOKEN
// (case-insensitive).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const RETIRED = new RegExp(
  ['1pass' + 'word', 'onepass' + 'word', '\\bop' + ':\\/\\/', 'OP_SERVICE' + '_ACCOUNT_TOKEN'].join('|'),
  'i',
)
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', '.expo', 'coverage', '.turbo', '.cache'])
const MAX_BYTES = 5 * 1024 * 1024
// Paths (relative to the repo root) allowed to mention a retired name, each with a reason.
const ALLOW = new Map([
  ['scripts/check-retired-names.mjs', 'this guard: it names what it forbids'],
])

const hits = []
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path)
      continue
    }
    if (!entry.isFile()) continue
    const rel = relative(root, path)
    if (ALLOW.has(rel)) continue
    if (RETIRED.test(entry.name)) {
      hits.push(`${rel} (file name)`)
      continue
    }
    if (statSync(path).size > MAX_BYTES) continue
    const buf = readFileSync(path)
    if (buf.subarray(0, 8000).includes(0)) continue // binary
    const lines = buf.toString('utf8').split('\n')
    lines.forEach((line, i) => {
      if (RETIRED.test(line)) hits.push(`${rel}:${i + 1}`)
    })
  }
}
walk(root)

if (hits.length) {
  console.error(
    `check-retired-names: ${hits.length} mention(s) of the retired secrets provider. Bitwarden Secrets Manager is the only provider (BWS_ACCESS_TOKEN):`,
  )
  for (const hit of hits) console.error(`  ${hit}`)
  process.exit(1)
}
console.log('check-retired-names: ok')
