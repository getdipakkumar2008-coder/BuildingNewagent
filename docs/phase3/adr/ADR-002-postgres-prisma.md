# ADR-002: Postgres + Prisma

Status: Proposed

## Context
Relational data with branching messages, cascades and full-text search.

## Decision
Postgres 16 with Prisma ORM; tsvector + GIN for search via raw SQL.

## Consequences
+ strong integrity, migrations. - Prisma has no native tsvector; raw queries needed.

## Alternatives
Drizzle (lighter, better raw SQL); SQLite (insufficient for concurrent workers).
