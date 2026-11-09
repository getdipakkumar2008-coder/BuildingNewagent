# ADR-007: SearchProvider abstraction

Status: Proposed

## Context
Search vendor, pricing and ToS are undecided and may change.

## Decision
Define `SearchProvider { search(query, opts): Result[] }`; ship one adapter plus a fake for tests. Provider chosen by user (Q4).

## Consequences
+ swappable, testable offline. - lowest-common-denominator features.

## Alternatives
Hard-code one vendor.
