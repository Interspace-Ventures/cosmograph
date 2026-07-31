# Security Policy

## Reporting a vulnerability

We take security seriously and appreciate responsible disclosure.

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, report it privately using one of these channels:

- **GitHub:** use [private vulnerability reporting](https://github.com/heyinterspace/cosmograph/security/advisories/new) (Security → Report a vulnerability), or
- **Email:** **security@cosmograph.space**

Please include:

- A description of the issue and its potential impact
- Steps to reproduce (a proof of concept if possible)
- Any suggested remediation

## What to expect

- We aim to acknowledge your report within **3 business days**.
- We'll keep you updated as we investigate and work on a fix.
- We'll credit you in the release notes once the issue is resolved, unless you prefer to remain anonymous.

## Scope

The core research visualization is generated from public
[OpenAlex](https://openalex.org) records, but the deployed product also includes
Clerk identity, a Postgres-backed entitlement layer, optional Stripe commerce,
AI-assisted queries, feedback, referrals, and realtime presence. Treat the web
client, API server, authentication proxy, database, webhook handlers, and
deployment configuration as security-sensitive surfaces.

Staging is private by default. It uses a dedicated database branch and requires
an authenticated Clerk session for application access while leaving only its
health endpoint and sign-in dependencies public. See
[`docs/staging.md`](docs/staging.md) for the enforced boundary and verification
checklist.

Thank you for helping keep Cosmograph and its users safe.
