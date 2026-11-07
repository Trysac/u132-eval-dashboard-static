import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildDashboard,
  DashboardError,
  type EvalRun,
  escapeHtml,
  formatNumber,
  renderHtml,
} from "../src/index.js";

describe("buildDashboard", () => {
  it("uses for each model the run with the greatest created_at, ties broken by greatest run_id, so runs '2026-01-01T00:00:00Z' and '2026-01-02T00:00:00Z' for 'm2' select the second", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r_base",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.8 },
      },
      {
        run_id: "r_older",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.7 },
      },
      {
        run_id: "r_newer",
        model: "m2",
        created_at: "2026-01-02T00:00:00Z",
        metrics: { accuracy: 0.85 },
      },
    ];

    const d = buildDashboard(runs, { baseline: "m1" });
    const m2Cell = d.cells.find((c) => c.model === "m2" && c.metric === "accuracy");
    expect(m2Cell).toBeDefined();
    expect(m2Cell?.runId).toBe("r_newer");
    expect(m2Cell?.value).toBe(0.85);
  });

  it("breaks timestamp ties using greatest run_id", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r_base",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.8 },
      },
      {
        run_id: "r1",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.75 },
      },
      {
        run_id: "r2",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.85 },
      },
    ];

    const d = buildDashboard(runs, { baseline: "m1" });
    const m2Cell = d.cells.find((c) => c.model === "m2");
    expect(m2Cell?.runId).toBe("r2");
    expect(m2Cell?.value).toBe(0.85);
  });

  it("With baseline accuracy 0.80 and model 'm2' accuracy 0.77 and regressionThreshold 0.02, the cell has status 'worse' and delta toBeCloseTo(-0.03, 12); latency_ms 120 versus 100 with higherIsBetter { latency_ms: false } is 'worse'; accuracy 0.82 versus 0.80 is 'same' because |delta| <= threshold + 1e-12", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r_base",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.8, latency_ms: 100 },
      },
      {
        run_id: "r_m2",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.77, latency_ms: 120 },
      },
      {
        run_id: "r_m3",
        model: "m3",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.82, latency_ms: 100 },
      },
    ];

    const d = buildDashboard(runs, {
      baseline: "m1",
      regressionThreshold: 0.02,
      higherIsBetter: { latency_ms: false },
    });

    const m2Acc = d.cells.find((c) => c.model === "m2" && c.metric === "accuracy");
    expect(m2Acc).toBeDefined();
    expect(m2Acc?.status).toBe("worse");
    expect(m2Acc?.delta).toBeCloseTo(-0.03, 12);

    const m2Lat = d.cells.find((c) => c.model === "m2" && c.metric === "latency_ms");
    expect(m2Lat).toBeDefined();
    expect(m2Lat?.status).toBe("worse");
    expect(m2Lat?.delta).toBe(20);

    const m3Acc = d.cells.find((c) => c.model === "m3" && c.metric === "accuracy");
    expect(m3Acc).toBeDefined();
    expect(m3Acc?.status).toBe("same");
    expect(m3Acc?.delta).toBeCloseTo(0.02, 12);
  });

  it("A metric present for the baseline but absent for a model yields a cell with status 'missing' and value null; baseline cells have status 'baseline' and delta 0", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r_base",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.85, f1: 0.8 },
      },
      {
        run_id: "r_m2",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.9 },
      },
    ];

    const d = buildDashboard(runs, { baseline: "m1" });

    const baseAcc = d.cells.find((c) => c.model === "m1" && c.metric === "accuracy");
    expect(baseAcc).toBeDefined();
    expect(baseAcc?.status).toBe("baseline");
    expect(baseAcc?.delta).toBe(0);
    expect(baseAcc?.value).toBe(0.85);

    const m2F1 = d.cells.find((c) => c.model === "m2" && c.metric === "f1");
    expect(m2F1).toBeDefined();
    expect(m2F1?.status).toBe("missing");
    expect(m2F1?.value).toBeNull();
    expect(m2F1?.delta).toBeNull();
  });

  it("handles metric absent from baseline but present in another model", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r_base",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.85 },
      },
      {
        run_id: "r_m2",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.9, extra: 42 },
      },
    ];

    const d = buildDashboard(runs, { baseline: "m1" });
    const baseExtra = d.cells.find((c) => c.model === "m1" && c.metric === "extra");
    expect(baseExtra).toBeDefined();
    expect(baseExtra?.status).toBe("missing");
    expect(baseExtra?.value).toBeNull();

    const m2Extra = d.cells.find((c) => c.model === "m2" && c.metric === "extra");
    expect(m2Extra).toBeDefined();
    expect(m2Extra?.status).toBe("missing");
    expect(m2Extra?.value).toBe(42);
    expect(m2Extra?.delta).toBeNull();
  });

  it("for models 'm1' (baseline), 'c' and 'a' and metrics 'latency_ms' and 'accuracy', d.models deep-equals ['m1', 'a', 'c'] and d.metrics ['accuracy', 'latency_ms']", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r_c",
        model: "c",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { latency_ms: 100, accuracy: 0.8 },
      },
      {
        run_id: "r_m1",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { latency_ms: 120, accuracy: 0.85 },
      },
      {
        run_id: "r_a",
        model: "a",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { latency_ms: 110, accuracy: 0.9 },
      },
    ];

    const d = buildDashboard(runs, { baseline: "m1" });
    expect(d.models).toEqual(["m1", "a", "c"]);
    expect(d.metrics).toEqual(["accuracy", "latency_ms"]);
  });

  it("renderHtml(buildDashboard(runs, opts)) is byte-identical across 2 calls and for shuffled input order", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r1",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.8, latency: 50 },
      },
      {
        run_id: "r2",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.85, latency: 45 },
      },
      {
        run_id: "r3",
        model: "m3",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.75, latency: 60 },
      },
    ];

    const opts = { baseline: "m1", higherIsBetter: { latency: false } };
    const html1 = renderHtml(buildDashboard(runs, opts));
    const html2 = renderHtml(buildDashboard(runs, opts));
    expect(html1).toBe(html2);

    const [run0, run1, run2] = runs;
    if (!run0 || !run1 || !run2) {
      throw new Error("Missing fixture runs");
    }
    const shuffled = [run2, run0, run1];
    const html3 = renderHtml(buildDashboard(shuffled, opts));
    expect(html1).toBe(html3);
  });

  it("buildDashboard throws DashboardError with code 'unknown_baseline' when no run has the baseline model, 'invalid_value' for a metric value NaN or Infinity, and 'too_many_runs' for 10_001 runs", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r1",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { accuracy: 0.8 },
      },
    ];

    expect(() => buildDashboard(runs, { baseline: "m1" })).toThrowError(
      expect.objectContaining({ code: "unknown_baseline" }),
    );

    const nanRun: EvalRun = {
      run_id: "r1",
      model: "m1",
      created_at: "2026-01-01T00:00:00Z",
      metrics: { accuracy: Number.NaN },
    };
    expect(() => buildDashboard([nanRun], { baseline: "m1" })).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );

    const infRun: EvalRun = {
      run_id: "r1",
      model: "m1",
      created_at: "2026-01-01T00:00:00Z",
      metrics: { accuracy: Number.POSITIVE_INFINITY },
    };
    expect(() => buildDashboard([infRun], { baseline: "m1" })).toThrowError(
      expect.objectContaining({ code: "invalid_value" }),
    );

    const manyRuns: EvalRun[] = Array.from({ length: 10_001 }, (_, i) => ({
      run_id: `r_${i}`,
      model: "m1",
      created_at: "2026-01-01T00:00:00Z",
      metrics: { accuracy: 0.8 },
    }));
    expect(() => buildDashboard(manyRuns, { baseline: "m1" })).toThrowError(
      expect.objectContaining({ code: "too_many_runs" }),
    );
  });

  it("enforces limit on metrics and handles invalid options or runs", () => {
    const manyMetrics: Record<string, number> = {};
    for (let i = 0; i < 201; i++) {
      manyMetrics[`metric_${i}`] = 1.0;
    }
    const runWithManyMetrics: EvalRun = {
      run_id: "r1",
      model: "m1",
      created_at: "2026-01-01T00:00:00Z",
      metrics: manyMetrics,
    };
    expect(() => buildDashboard([runWithManyMetrics], { baseline: "m1" })).toThrowError(
      expect.objectContaining({ code: "too_many_metrics" }),
    );

    // invalid options
    expect(() => buildDashboard([], null as unknown as { baseline: string })).toThrowError(
      expect.objectContaining({ code: "invalid_options" }),
    );
    expect(() => buildDashboard([], { baseline: "" })).toThrowError(
      expect.objectContaining({ code: "invalid_options" }),
    );
    expect(() => buildDashboard([], { baseline: "m1", regressionThreshold: -1 })).toThrowError(
      expect.objectContaining({ code: "invalid_options" }),
    );
    expect(() =>
      buildDashboard("not an array" as unknown as EvalRun[], { baseline: "m1" }),
    ).toThrowError(expect.objectContaining({ code: "invalid_run" }));

    // invalid run elements
    expect(() => buildDashboard([null as unknown as EvalRun], { baseline: "m1" })).toThrowError(
      expect.objectContaining({ code: "invalid_run" }),
    );
    expect(() =>
      buildDashboard(
        [{ run_id: "", model: "m1", created_at: "2026-01-01T00:00:00Z", metrics: {} }],
        { baseline: "m1" },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_run" }));
    expect(() =>
      buildDashboard(
        [{ run_id: "r1", model: "", created_at: "2026-01-01T00:00:00Z", metrics: {} }],
        { baseline: "m1" },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_run" }));
    expect(() =>
      buildDashboard([{ run_id: "r1", model: "m1", created_at: "not a date", metrics: {} }], {
        baseline: "m1",
      }),
    ).toThrowError(expect.objectContaining({ code: "invalid_run" }));
    expect(() =>
      buildDashboard(
        [
          {
            run_id: "r1",
            model: "m1",
            created_at: "2026-01-01T00:00:00Z",
            metrics: null as unknown as Record<string, number>,
          },
        ],
        { baseline: "m1" },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_run" }));
    expect(() =>
      buildDashboard(
        [{ run_id: "r1", model: "m1", created_at: "2026-01-01T00:00:00Z", metrics: { "": 1 } }],
        { baseline: "m1" },
      ),
    ).toThrowError(expect.objectContaining({ code: "invalid_run" }));
  });

  it("handles edge case: single model equal to baseline", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r1",
        model: "only-model",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { acc: 0.95 },
      },
    ];
    const d = buildDashboard(runs, { baseline: "only-model" });
    expect(d.models).toEqual(["only-model"]);
    expect(d.cells).toHaveLength(1);
    expect(d.cells[0]?.status).toBe("baseline");
  });

  it("handles edge case: metric names with spaces and unicode, and negative values", () => {
    const runs: EvalRun[] = [
      {
        run_id: "r1",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { "mean squared error Δ": -0.05 },
      },
      {
        run_id: "r2",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { "mean squared error Δ": -0.02 },
      },
    ];
    const d = buildDashboard(runs, {
      baseline: "m1",
      higherIsBetter: { "mean squared error Δ": true },
    });
    expect(d.metrics).toEqual(["mean squared error Δ"]);
    const m2Cell = d.cells.find((c) => c.model === "m2");
    expect(m2Cell).toBeDefined();
    expect(m2Cell?.status).toBe("better");
    expect(m2Cell?.delta).toBeCloseTo(0.03, 12);
  });
});

describe("renderHtml", () => {
  it("starts with '<!doctype html>', contains CSP meta, contains no '<script' in any case, and escapes '<img src=x onerror=1>'", () => {
    const evilModel = "<img src=x onerror=1>";
    const runs: EvalRun[] = [
      {
        run_id: "r1",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { "acc & <test>": 0.8 },
      },
      {
        run_id: "r2",
        model: evilModel,
        created_at: "2026-01-01T00:00:00Z",
        metrics: { "acc & <test>": 0.85 },
      },
    ];

    const d = buildDashboard(runs, { baseline: "m1", title: "<script>alert(1)</script>" });
    const html = renderHtml(d);

    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain(
      "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'\">",
    );
    expect(html.toLowerCase()).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=1&gt;");
    expect(html).not.toContain("<img src=x onerror=1>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("matches golden fixture test/fixtures/three-models.golden byte-for-byte", () => {
    const goldenRuns: EvalRun[] = [
      {
        run_id: "run-01",
        model: "model-a",
        created_at: "2026-03-01T12:00:00Z",
        metrics: { accuracy: 0.825, latency_ms: 120.4 },
      },
      {
        run_id: "run-02",
        model: "model-b",
        created_at: "2026-03-01T12:05:00Z",
        metrics: { accuracy: 0.795, latency_ms: 110.0 },
      },
      {
        run_id: "run-03",
        model: "model-c",
        created_at: "2026-03-01T12:10:00Z",
        metrics: { accuracy: 0.85, latency_ms: 150.2 },
      },
    ];

    const dashboard = buildDashboard(goldenRuns, {
      baseline: "model-a",
      higherIsBetter: { latency_ms: false, accuracy: true },
      regressionThreshold: 0.02,
      title: "Benchmark Results",
    });

    const generatedHtml = renderHtml(dashboard);
    const goldenPath = path.resolve(__dirname, "fixtures/three-models.golden");
    const goldenContent = fs.readFileSync(goldenPath, "utf-8");

    expect(generatedHtml).toBe(goldenContent);
  });
});

describe("helper functions", () => {
  it("formatNumber correctly formats and trims precision", () => {
    expect(formatNumber(0.8)).toBe("0.8");
    expect(formatNumber(120.0)).toBe("120");
    expect(formatNumber(0.1234567)).toBe("0.123457");
    expect(formatNumber(-0.0)).toBe("0");
    expect(formatNumber(1e-8)).toBe("1.00000e-8");
  });

  it("escapeHtml escapes all HTML entities", () => {
    expect(escapeHtml("\"hello\" & <world> 'test'")).toBe(
      "&quot;hello&quot; &amp; &lt;world&gt; &#39;test&#39;",
    );
  });

  it("DashboardError truncates messages exceeding 200 characters", () => {
    const longMsg = "A".repeat(250);
    const err = new DashboardError("invalid_run", longMsg);
    expect(err.message.length).toBe(200);
    expect(err.message.endsWith("...")).toBe(true);
  });
});
