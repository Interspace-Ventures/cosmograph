#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db migrate
pnpm --filter db push
