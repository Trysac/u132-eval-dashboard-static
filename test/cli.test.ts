import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import type { EvalRun } from "../src/index.js";

class MemoryIo {
  stdoutStr = "";
  stderrStr = "";
  stdout = {
    write: (s: string) => {
      this.stdoutStr += s;
    },
  };
  stderr = {
    write: (s: string) => {
      this.stderrStr += s;
    },
  };
}

describe("CLI run()", () => {
  it("await run(['--baseline', 'm1', 'runs.json'], io) writes the HTML to io.stdout and returns 0; with '--format', 'json' it writes JSON.stringify(dashboard, null, 2); an invalid JSON file returns 2 with stderr starting 'runs.json: invalid JSON'", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-dash-cli-"));
    const runsFile = path.join(tempDir, "runs.json");
    const invalidJsonFile = path.join(tempDir, "invalid.json");

    const sampleRuns: EvalRun[] = [
      {
        run_id: "r1",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { acc: 0.9 },
      },
      {
        run_id: "r2",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { acc: 0.85 },
      },
    ];

    await fs.writeFile(runsFile, JSON.stringify(sampleRuns));
    await fs.writeFile(invalidJsonFile, "{ not valid json");

    try {
      // Test 1: HTML output to stdout
      const io1 = new MemoryIo();
      const code1 = await run(["--baseline", "m1", runsFile], io1);
      expect(code1).toBe(0);
      expect(io1.stdoutStr.startsWith("<!doctype html>")).toBe(true);
      expect(io1.stderrStr).toBe("");

      // Test 2: JSON format output to stdout
      const io2 = new MemoryIo();
      const code2 = await run(["--baseline", "m1", "--format", "json", runsFile], io2);
      expect(code2).toBe(0);
      const parsed = JSON.parse(io2.stdoutStr);
      expect(parsed.baseline).toBe("m1");
      expect(parsed.models).toEqual(["m1", "m2"]);
      expect(io2.stdoutStr).toContain('\n  "baseline": "m1",\n');

      // Test 3: Invalid JSON file returns 2 and stderr prefix
      const io3 = new MemoryIo();
      const code3 = await run(["--baseline", "m1", invalidJsonFile], io3);
      expect(code3).toBe(2);
      expect(io3.stderrStr.startsWith(`${invalidJsonFile}: invalid JSON`)).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("shows help with --help", async () => {
    const io = new MemoryIo();
    const code = await run(["--help"], io);
    expect(code).toBe(0);
    expect(io.stdoutStr).toContain("Usage: eval-dashboard-static");
  });

  it("returns code 2 when baseline is missing", async () => {
    const io = new MemoryIo();
    const code = await run(["runs.json"], io);
    expect(code).toBe(2);
    expect(io.stderrStr).toContain("Missing required argument: --baseline");
  });

  it("returns code 2 when input file is missing", async () => {
    const io = new MemoryIo();
    const code = await run(["--baseline", "m1"], io);
    expect(code).toBe(2);
    expect(io.stderrStr).toContain("Missing input JSON file");
  });

  it("returns code 2 when file does not exist", async () => {
    const io = new MemoryIo();
    const code = await run(["--baseline", "m1", "does_not_exist.json"], io);
    expect(code).toBe(2);
    expect(io.stderrStr).toContain("failed to open file");
  });

  it("returns code 2 when file root is not an array", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-dash-cli-obj-"));
    const notArrayFile = path.join(tempDir, "obj.json");
    await fs.writeFile(notArrayFile, JSON.stringify({ not: "an array" }));

    try {
      const io = new MemoryIo();
      const code = await run(["--baseline", "m1", notArrayFile], io);
      expect(code).toBe(2);
      expect(io.stderrStr).toContain("root must be an array");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("writes output to file when --out is specified", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-dash-cli-out-"));
    const runsFile = path.join(tempDir, "runs.json");
    const outFile = path.join(tempDir, "dash.html");

    const runs: EvalRun[] = [
      {
        run_id: "r1",
        model: "m1",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { acc: 0.9 },
      },
    ];
    await fs.writeFile(runsFile, JSON.stringify(runs));

    try {
      const io = new MemoryIo();
      const code = await run(
        [
          "--baseline",
          "m1",
          "--out",
          outFile,
          "--title",
          "Custom Title",
          "--threshold",
          "0.05",
          "--lower-is-better=latency",
          "--higher-is-better=accuracy",
          runsFile,
        ],
        io,
      );
      expect(code).toBe(0);
      expect(io.stdoutStr).toBe("");
      const outContent = await fs.readFile(outFile, "utf-8");
      expect(outContent).toContain("<title>Custom Title</title>");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("returns code 2 if dashboard build fails (e.g. baseline not found)", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "eval-dash-cli-fail-"));
    const runsFile = path.join(tempDir, "runs.json");
    const runs: EvalRun[] = [
      {
        run_id: "r1",
        model: "m2",
        created_at: "2026-01-01T00:00:00Z",
        metrics: { acc: 0.9 },
      },
    ];
    await fs.writeFile(runsFile, JSON.stringify(runs));

    try {
      const io = new MemoryIo();
      const code = await run(["--baseline", "m1", runsFile], io);
      expect(code).toBe(2);
      expect(io.stderrStr).toContain("Dashboard build failed:");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
