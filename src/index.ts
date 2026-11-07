/**
 * Public entry point of @trysac/eval-dashboard-static.
 *
 * Provides pure functions and types for building model evaluation comparison
 * dashboards and rendering them to secure, script-free static HTML.
 */

/** Error codes raised by {@link DashboardError}. */
export type DashboardErrorCode =
  | "unknown_baseline"
  | "invalid_value"
  | "invalid_run"
  | "too_many_runs"
  | "too_many_metrics"
  | "invalid_options";

/**
 * Typed error thrown by dashboard building and rendering operations.
 */
export class DashboardError extends Error {
  readonly code: DashboardErrorCode;

  constructor(code: DashboardErrorCode, message: string) {
    const safeMessage = message.length > 200 ? `${message.slice(0, 197)}...` : message;
    super(safeMessage);
    this.name = "DashboardError";
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/** Input evaluation run record. */
export interface EvalRun {
  run_id: string;
  model: string;
  created_at: string;
  metrics: Record<string, number>;
}

/** Configuration options for {@link buildDashboard}. */
export interface DashboardOptions {
  baseline: string;
  regressionThreshold?: number;
  higherIsBetter?: Record<string, boolean>;
  title?: string;
}

/** Comparison status of a model's metric cell relative to baseline. */
export type CellStatus = "baseline" | "better" | "worse" | "same" | "missing";

/** Evaluated metric cell for a model. */
export interface Cell {
  model: string;
  metric: string;
  value: number | null;
  delta: number | null;
  status: CellStatus;
  runId: string;
}

/** Comparison dashboard structure. */
export interface Dashboard {
  title: string;
  baseline: string;
  models: string[];
  metrics: string[];
  cells: Cell[];
}

export const MAX_RUNS = 10_000;
export const MAX_METRICS = 200;
export const MIN_NAME_LEN = 1;
export const MAX_NAME_LEN = 100;
const DEFAULT_THRESHOLD = 0.02;
const DEFAULT_TITLE = "Evaluation dashboard";
const EPSILON = 1e-12;

const ISO_8601_UTC_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function validateRun(run: unknown, index: number): asserts run is EvalRun {
  if (typeof run !== "object" || run === null || Array.isArray(run)) {
    throw new DashboardError("invalid_run", `run at index ${index} must be an object`);
  }

  const r = run as Record<string, unknown>;

  if (typeof r.run_id !== "string" || r.run_id.length === 0) {
    throw new DashboardError("invalid_run", `run at index ${index} has missing or empty run_id`);
  }

  if (
    typeof r.model !== "string" ||
    r.model.length < MIN_NAME_LEN ||
    r.model.length > MAX_NAME_LEN
  ) {
    throw new DashboardError(
      "invalid_run",
      `run at index ${index} has invalid model name (length must be 1-100)`,
    );
  }

  if (
    typeof r.created_at !== "string" ||
    !ISO_8601_UTC_REGEX.test(r.created_at) ||
    Number.isNaN(Date.parse(r.created_at))
  ) {
    throw new DashboardError(
      "invalid_run",
      `run at index ${index} has invalid created_at (must be ISO 8601 UTC ending in 'Z')`,
    );
  }

  if (typeof r.metrics !== "object" || r.metrics === null || Array.isArray(r.metrics)) {
    throw new DashboardError("invalid_run", `run at index ${index} has invalid metrics object`);
  }

  for (const [k, v] of Object.entries(r.metrics)) {
    if (k.length < MIN_NAME_LEN || k.length > MAX_NAME_LEN) {
      throw new DashboardError(
        "invalid_run",
        `run at index ${index} has metric name '${k.slice(0, 50)}' outside allowed length 1-100`,
      );
    }
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new DashboardError(
        "invalid_value",
        `run at index ${index} metric '${k}' has non-finite value: ${v}`,
      );
    }
  }
}

/**
 * Builds an evaluation dashboard by aggregating the latest run per model
 * and comparing metrics against the designated baseline model.
 *
 * @param runs - List of evaluation run records.
 * @param opts - Dashboard configuration options.
 * @returns The built Dashboard structure.
 */
export function buildDashboard(runs: EvalRun[], opts: DashboardOptions): Dashboard {
  if (!opts || typeof opts !== "object") {
    throw new DashboardError("invalid_options", "DashboardOptions must be provided");
  }
  if (
    typeof opts.baseline !== "string" ||
    opts.baseline.length < MIN_NAME_LEN ||
    opts.baseline.length > MAX_NAME_LEN
  ) {
    throw new DashboardError(
      "invalid_options",
      "opts.baseline must be a non-empty string between 1 and 100 characters",
    );
  }

  const threshold = opts.regressionThreshold ?? DEFAULT_THRESHOLD;
  if (typeof threshold !== "number" || !Number.isFinite(threshold) || threshold < 0) {
    throw new DashboardError("invalid_options", "regressionThreshold must be a finite number >= 0");
  }

  const title = opts.title ?? DEFAULT_TITLE;
  const higherIsBetter = opts.higherIsBetter ?? {};

  if (!Array.isArray(runs)) {
    throw new DashboardError("invalid_run", "runs must be an array");
  }
  if (runs.length > MAX_RUNS) {
    throw new DashboardError(
      "too_many_runs",
      `Total runs ${runs.length} exceeds limit of ${MAX_RUNS}`,
    );
  }

  for (let i = 0; i < runs.length; i++) {
    validateRun(runs[i], i);
  }

  // Group runs by model and pick latest by created_at (ties broken by greatest run_id)
  const latestRunsByModel = new Map<string, EvalRun>();

  for (const run of runs) {
    const existing = latestRunsByModel.get(run.model);
    if (!existing) {
      latestRunsByModel.set(run.model, run);
      continue;
    }

    const timeComp = run.created_at.localeCompare(existing.created_at);
    if (timeComp > 0) {
      latestRunsByModel.set(run.model, run);
    } else if (timeComp === 0) {
      if (run.run_id.localeCompare(existing.run_id) > 0) {
        latestRunsByModel.set(run.model, run);
      }
    }
  }

  const baselineRun = latestRunsByModel.get(opts.baseline);
  if (!baselineRun) {
    throw new DashboardError(
      "unknown_baseline",
      `Baseline model '${opts.baseline}' not found in runs`,
    );
  }

  // Collect all unique metrics across selected latest runs
  const metricSet = new Set<string>();
  for (const run of latestRunsByModel.values()) {
    for (const m of Object.keys(run.metrics)) {
      metricSet.add(m);
    }
  }

  if (metricSet.size > MAX_METRICS) {
    throw new DashboardError(
      "too_many_metrics",
      `Metric count ${metricSet.size} exceeds maximum ${MAX_METRICS}`,
    );
  }

  // Sort metrics deterministically
  const sortedMetrics = Array.from(metricSet).sort((a, b) => a.localeCompare(b));

  // Models: baseline first, then other models alphabetically
  const otherModels = Array.from(latestRunsByModel.keys())
    .filter((m) => m !== opts.baseline)
    .sort((a, b) => a.localeCompare(b));
  const sortedModels = [opts.baseline, ...otherModels];

  const cells: Cell[] = [];

  for (const model of sortedModels) {
    const run = latestRunsByModel.get(model);
    if (!run) {
      continue;
    }
    for (const metric of sortedMetrics) {
      const isBaseline = model === opts.baseline;
      const baselineVal = baselineRun.metrics[metric];
      const modelVal = run.metrics[metric];

      if (isBaseline) {
        if (baselineVal === undefined) {
          cells.push({
            model,
            metric,
            value: null,
            delta: null,
            status: "missing",
            runId: run.run_id,
          });
        } else {
          cells.push({
            model,
            metric,
            value: baselineVal,
            delta: 0,
            status: "baseline",
            runId: run.run_id,
          });
        }
        continue;
      }

      // Non-baseline model
      if (baselineVal === undefined || modelVal === undefined) {
        cells.push({
          model,
          metric,
          value: modelVal ?? null,
          delta: null,
          status: "missing",
          runId: run.run_id,
        });
        continue;
      }

      const delta = modelVal - baselineVal;
      const metricHigherIsBetter = higherIsBetter[metric] ?? true;
      const improvement = metricHigherIsBetter ? delta : -delta;

      let status: CellStatus;
      if (Math.abs(delta) <= threshold + EPSILON) {
        status = "same";
      } else if (improvement > 0) {
        status = "better";
      } else {
        status = "worse";
      }

      cells.push({
        model,
        metric,
        value: modelVal,
        delta,
        status,
        runId: run.run_id,
      });
    }
  }

  return {
    title,
    baseline: opts.baseline,
    models: sortedModels,
    metrics: sortedMetrics,
    cells,
  };
}

/**
 * Escapes HTML special characters in text and attribute values.
 */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Formats a number with precision 6 and trims trailing zeros after a decimal point.
 */
export function formatNumber(val: number): string {
  const p = val.toPrecision(6);
  if (p.includes("e") || p.includes("E")) {
    return p;
  }
  if (p.includes(".")) {
    const trimmed = p.replace(/\.?0+$/, "");
    return trimmed === "-0" ? "0" : trimmed;
  }
  return p;
}

function formatCellContent(cell: Cell): string {
  if (cell.status === "baseline") {
    return cell.value !== null ? formatNumber(cell.value) : "—";
  }
  if (cell.value === null) {
    return "—";
  }
  if (cell.delta === null) {
    return formatNumber(cell.value);
  }
  const sign = cell.delta > 0 ? "+" : "";
  return `${formatNumber(cell.value)} (${sign}${formatNumber(cell.delta)})`;
}

/**
 * Renders a Dashboard into a secure, script-free HTML document string.
 *
 * @param d - The dashboard structure.
 * @returns The complete HTML document.
 */
export function renderHtml(d: Dashboard): string {
  const titleEscaped = escapeHtml(d.title);
  const baselineEscaped = escapeHtml(d.baseline);

  const cellLookup = new Map<string, Cell>();
  for (const c of d.cells) {
    cellLookup.set(`${c.model}\u0000${c.metric}`, c);
  }

  const rows: string[] = [];

  for (const model of d.models) {
    const isBase = model === d.baseline;
    const rowCols: string[] = [];
    const modelEscaped = escapeHtml(model);
    const modelLabel = isBase ? `${modelEscaped} (baseline)` : modelEscaped;
    rowCols.push(`      <th scope="row" class="model-name">${modelLabel}</th>`);

    for (const metric of d.metrics) {
      const cell = cellLookup.get(`${model}\u0000${metric}`);
      if (!cell) {
        rowCols.push('      <td class="missing">—</td>');
        continue;
      }
      const content = escapeHtml(formatCellContent(cell));
      rowCols.push(`      <td class="${cell.status}">${content}</td>`);
    }

    rows.push(`    <tr>\n${rowCols.join("\n")}\n    </tr>`);
  }

  const headerCols = d.metrics.map((m) => `      <th scope="col">${escapeHtml(m)}</th>`).join("\n");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">
  <title>${titleEscaped}</title>
  <style>
    :root { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #222; background: #fff; line-height: 1.4; }
    body { margin: 2rem; }
    h1 { margin-bottom: 0.5rem; font-size: 1.6rem; }
    p.meta { margin-top: 0; color: #555; font-size: 0.9rem; }
    table { border-collapse: collapse; width: 100%; margin-top: 1.5rem; font-variant-numeric: tabular-nums; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: right; }
    th { background: #f7f7f7; font-weight: 600; }
    th[scope="row"], th.model-name { text-align: left; }
    td.baseline { background: #fdfdfd; font-weight: 500; }
    td.better { background: #e6f4ea; color: #137333; font-weight: 600; }
    td.worse { background: #fce8e6; color: #c5221f; font-weight: 600; }
    td.same { background: #f1f3f4; color: #3c4043; }
    td.missing { background: #fafafa; color: #80868b; font-style: italic; }
    .legend { margin-top: 1.5rem; display: flex; gap: 1rem; font-size: 0.85rem; }
    .legend span { display: inline-block; padding: 0.2rem 0.5rem; border-radius: 3px; }
  </style>
</head>
<body>
  <header>
    <h1>${titleEscaped}</h1>
    <p class="meta">Baseline: <strong>${baselineEscaped}</strong></p>
  </header>
  <main>
    <table>
      <thead>
        <tr>
          <th scope="col">Model</th>
${headerCols}
        </tr>
      </thead>
      <tbody>
${rows.join("\n")}
      </tbody>
    </table>
    <div class="legend">
      <span class="better">Better</span>
      <span class="same">Within threshold</span>
      <span class="worse">Worse</span>
      <span class="baseline">Baseline</span>
      <span class="missing">Missing</span>
    </div>
  </main>
</body>
</html>`;
}
