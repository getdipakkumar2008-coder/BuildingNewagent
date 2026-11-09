# ADR-001: Next.js monolith (App Router, TypeScript)

Status: Proposed

## Context
Need streaming endpoints, SSR shell, and one deployable for a small team.

## Decision
Use Next.js with route handlers for the API and a separate Node worker process for research jobs, sharing a `src/server` library.

## Consequences
+ one repo, shared types, easy SSE. - Long-lived SSE needs a Node runtime (not edge); serverless hosts may cap duration, so deploy on a container host.

## Alternatives
Vite SPA + Fastify API (more wiring); Remix (smaller ecosystem for chosen UI kit).
