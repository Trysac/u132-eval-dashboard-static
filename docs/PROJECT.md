# Project record: eval-dashboard-static

## Objective

To provide a zero-dependency, script-free dashboard generator that helps teams perform offline evaluation comparisons of model metrics against a baseline.

## Scope

- In scope:
    - `buildDashboard` function for data aggregation and delta calculation.
    - `renderHtml` for secure, CSP-compliant HTML generation.
    - CLI interface for generating reports from JSON files.

- Out of scope:
    - Graphical charts or visualizations.
    - Historical trend analysis.
    - Interactive or dynamic browser-side filtering.
    - Any JavaScript execution in the output.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 1013734 / 21976 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 0.2192 | factory ledger |

## Factory run u132b (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | gemini-3.8-flash | yes | 4431 | 16315 | 0 | 0 | 0.0323 |
| fix-1 | gemini-3.8-flash | no | 90968 | 3238 | 0 | 725953 | 0.1348 |
| fix-2 | gemini-3.8-flash | no | 35156 | 980 | 0 | 87400 | 0.0366 |
| audit | gemini-3.1-flash-lite | no | 31732 | 125 | 0 | 18308 | 0.0086 |
| docs | gemini-3.1-flash-lite | no | 19786 | 1318 | 0 | 0 | 0.0069 |

Total: $0.2192. Prices: Anthropic list prices.
