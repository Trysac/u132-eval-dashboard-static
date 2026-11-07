# Script-free offline static evaluation dashboard with explicit regression rules

Status: accepted (generated, pending human review)

## Context

Evaluating AI models requires comparing multiple runs across diverse metrics against a reference baseline. Spreadsheets are error-prone and hosted dashboards introduce security risks and external server dependencies.

## Decision

Implement a pure, zero-dependency library that selects the latest run per model, computes deltas against a specified baseline, applies metric-direction awareness (higher vs lower is better) and tolerance thresholds, and outputs self-contained, script-free HTML with strict CSP.

## Consequences

Produces predictable, diffable, byte-deterministic HTML reports without external asset fetches or client-side JavaScript execution.
