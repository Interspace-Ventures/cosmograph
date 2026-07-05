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

Cosmograph's core visualization is a **static site** with no backend, no database, and no user accounts — its data is baked in at build time from public [OpenAlex](https://openalex.org) records, so the attack surface is small.

The optional realtime `api-server` (anonymous, in-memory presence + a cached GitHub star count) is the main server-side surface. It persists nothing and stores no personal data, but reports of abuse vectors (e.g. denial of service, resource exhaustion) are welcome.

Thank you for helping keep Cosmograph and its users safe.
