# ADR-004: Tenant scoping in a repository layer; RLS deferred

Status: Proposed

## Context
Every row belongs to one user; IDOR is the top authZ risk.

## Decision
All data access goes through repositories that require `userId`; lint rule bans direct Prisma use in route handlers; IDOR tests per endpoint. Revisit Postgres RLS after v1.

## Consequences
+ simple, testable. - Relies on discipline; one missed scope = leak.

## Alternatives
Postgres RLS from day one (stronger, but Prisma + pooling friction).
