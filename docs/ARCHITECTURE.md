# Architecture

`@trysac/eval-dashboard-static` is organized into two primary layers:

1. **Core Library (`src/index.ts`)**:
   - Pure TypeScript, zero runtime dependencies, no Node standard library imports.
   - `buildDashboard`: Validates input runs, selects latest run per model by `created_at` (ties broken by `run_id`), computes deltas against the baseline model, and assigns regression statuses (`baseline`, `better`, `worse`, `same`, `missing`).
   - `renderHtml`: Produces a deterministic, script-free HTML table with strict CSP (`default-src 'none'; style-src 'unsafe-inline'`). All textual and attribute outputs are HTML-escaped.

2. **CLI Layer (`src/cli.ts`)**:
   - Accepts command-line options (`--baseline`, `--threshold`, `--format`, `--out`, `--higher-is-better`, `--lower-is-better`).
   - Reads up to 20 MiB of JSON data, constructs the dashboard, and emits HTML or JSON.
