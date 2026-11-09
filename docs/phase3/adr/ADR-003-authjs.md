# ADR-003: Auth.js with database sessions

Status: Proposed

## Context
Need OAuth/magic-link login and revocable sessions.

## Decision
Auth.js with Prisma adapter, database session strategy, `__Host-` cookie.

## Consequences
+ revocable, no JWT secrets in browser. - DB hit per request (cache in Redis later).

## Alternatives
JWT sessions (hard to revoke); Clerk/Lucia (external dependency / different model).
