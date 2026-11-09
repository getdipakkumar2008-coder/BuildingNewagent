# ADR-006: BullMQ (Redis) for research jobs

Status: Proposed

## Context
Research runs take minutes and must survive restarts, be cancellable and rate-limited.

## Decision
BullMQ queue + worker; progress events written to a Redis stream and relayed over SSE; run state in Postgres.

## Consequences
+ retries, concurrency caps, delayed jobs. - Redis becomes required infra.

## Alternatives
In-process async (lost on restart); Temporal/Inngest (heavier / vendor).
