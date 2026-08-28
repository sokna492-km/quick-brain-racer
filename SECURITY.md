# Security Policy

## Supported versions

Security fixes are applied to the latest release on the default branch.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for security-sensitive reports.

Instead, contact the KruMath maintainers through your usual private channel (email or internal security contact).

Include:

- A description of the issue and potential impact
- Steps to reproduce
- Any suggested fix, if you have one

We aim to acknowledge reports within a few business days.

## Scope

In scope:

- Authentication bypass in this game Worker
- Cross-site issues affecting game routes or server functions
- Secret exposure in the repository or build artifacts

Out of scope:

- Issues in the main KruMath monorepo (report to that project separately)
- Social engineering or physical attacks
- Denial-of-service against Cloudflare infrastructure

## Secrets hygiene

This repo must never contain:

- Supabase service-role keys
- Cloudflare API tokens
- Private signing keys or `.dev.vars` with production credentials

Use `.env.local` locally and CI/CD secrets for deploys. Only commit `.env.example` with empty placeholders.
