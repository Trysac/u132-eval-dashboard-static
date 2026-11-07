# @trysac/eval-dashboard-static

Static, script-free HTML dashboard comparing the latest evaluation run of each model against a baseline, with per-metric deltas and regression flags.

## The Problem

After each evaluation round, teams often manually copy numbers into spreadsheets to identify regressions, manually tracking the direction of each metric. Existing hosted dashboards require servers, introduce maintenance overhead, and may leak sensitive model performance data to third-party services. This library automates the comparison process, ensuring that regression rules are consistent and result in a single, portable, self-contained HTML file.

## Installation

```bash
npm install @trysac/eval-dashboard-static
```

## Usage

```typescript
import { buildDashboard, renderHtml } from '@trysac/eval-dashboard-static';
const runs = [
  { run_id: 'r1', model: 'base', created_at: '2026-01-01T00:00:00Z', metrics: { acc: 0.8 } },
  { run_id: 'r2', model: 'cand', created_at: '2026-01-02T00:00:00Z', metrics: { acc: 0.85 } },
];
const html = renderHtml(buildDashboard(runs, { baseline: 'base' }));
```

## Public API

- `buildDashboard(runs: EvalRun[], opts: DashboardOptions): Dashboard`: Analyzes evaluation runs. Throws `DashboardError` (codes: `unknown_baseline`, `invalid_value`, `invalid_run`, `too_many_runs`, `too_many_metrics`, `invalid_options`) on validation failure.
- `renderHtml(d: Dashboard): string`: Renders the dashboard structure to secure HTML.

### Limits

- Maximum 10,000 runs.
- Maximum 200 unique metrics.
- Model and metric names must be 1-100 characters.
- CLI input file size capped at 20 MiB.

## Why not hosted alternatives?

This utility provides an offline, diffable artifact that avoids network requests and data leakage, while ensuring every metric comparison strictly adheres to defined improvement rules.

## Security

See [docs/SECURITY.md](docs/SECURITY.md) for details on threat models and sanitization.
