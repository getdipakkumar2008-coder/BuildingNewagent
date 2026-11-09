# ADR-008: Treat fetched/uploaded content as untrusted data

Status: Proposed

## Context
Research agent reads arbitrary web pages; prompt injection is expected.

## Decision
Delimit untrusted content, state its status in the system prompt, give the agent no side-effect tools, SSRF-guard the fetcher, validate citations against stored sources, never execute model output.

## Consequences
+ bounded blast radius. - Cannot fully prevent bad summaries; mitigated by visible sources.

## Alternatives
Rely on prompt wording only (insufficient).
