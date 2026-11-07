/**
 * Command-line interface for @trysac/eval-dashboard-static.
 */

import * as fs from "node:fs/promises";
import { buildDashboard, type EvalRun, renderHtml } from "./index.js";

export interface CliIo {
  stdout: { write(s: string): void };
  stderr: { write(s: string): void };
}

export const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MiB

interface ParsedArgs {
  baseline?: string;
  threshold?: number;
  format: "html" | "json";
  out?: string;
  title?: string;
  higherIsBetter: Record<string, boolean>;
  inputFile?: string;
  help: boolean;
}

function parseCliArgs(argv: string[]): ParsedArgs {
  const result: ParsedArgs = {
    format: "html",
    higherIsBetter: {},
    help: false,
  };

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      result.help = true;
      i++;
    } else if (arg === "--baseline" || arg === "-b") {
      i++;
      const val = argv[i];
      if (val !== undefined) {
        result.baseline = val;
      }
      i++;
    } else if (arg === "--threshold" || arg === "-t") {
      i++;
      const valStr = argv[i];
      if (valStr !== undefined) {
        const val = Number.parseFloat(valStr);
        result.threshold = val;
      }
      i++;
    } else if (arg === "--format" || arg === "-f") {
      i++;
      const fmt = argv[i];
      if (fmt === "json" || fmt === "html") {
        result.format = fmt;
      }
      i++;
    } else if (arg === "--out" || arg === "-o") {
      i++;
      const val = argv[i];
      if (val !== undefined) {
        result.out = val;
      }
      i++;
    } else if (arg === "--title") {
      i++;
      const val = argv[i];
      if (val !== undefined) {
        result.title = val;
      }
      i++;
    } else if (arg?.startsWith("--lower-is-better=")) {
      const metricName = arg.slice("--lower-is-better=".length);
      result.higherIsBetter[metricName] = false;
      i++;
    } else if (arg?.startsWith("--higher-is-better=")) {
      const metricName = arg.slice("--higher-is-better=".length);
      result.higherIsBetter[metricName] = true;
      i++;
    } else if (arg?.startsWith("-")) {
      i++;
    } else {
      if (!result.inputFile && arg !== undefined) {
        result.inputFile = arg;
      }
      i++;
    }
  }

  return result;
}

/**
 * Executes the CLI given command-line arguments and standard I/O writers.
 *
 * @param argv - Argument list (without node or script name).
 * @param io - Standard streams wrapper.
 * @returns Process exit code (0 for success, 2 for error).
 */
export async function run(argv: string[], io: CliIo): Promise<number> {
  const parsed = parseCliArgs(argv);

  if (parsed.help) {
    io.stdout.write(
      "Usage: eval-dashboard-static --baseline <model> [options] <runs.json>\n\n" +
        "Options:\n" +
        "  -b, --baseline <model>         Baseline model name (required)\n" +
        "  -t, --threshold <num>          Regression threshold (default: 0.02)\n" +
        "  -f, --format <html|json>       Output format (default: html)\n" +
        "  -o, --out <file>               Output file path (default: stdout)\n" +
        "  --title <text>                 Dashboard title\n" +
        "  --lower-is-better=<metric>     Mark metric as lower-is-better\n" +
        "  --higher-is-better=<metric>    Mark metric as higher-is-better\n" +
        "  -h, --help                     Show this help message\n",
    );
    return 0;
  }

  if (!parsed.baseline) {
    io.stderr.write("Missing required argument: --baseline <model>\n");
    return 2;
  }

  if (!parsed.inputFile) {
    io.stderr.write("Missing input JSON file argument\n");
    return 2;
  }

  let fileStat: Awaited<ReturnType<typeof fs.stat>>;
  try {
    fileStat = await fs.stat(parsed.inputFile);
  } catch (err) {
    io.stderr.write(
      `${parsed.inputFile}: failed to open file (${err instanceof Error ? err.message : String(err)})\n`,
    );
    return 2;
  }

  if (fileStat.size > MAX_FILE_SIZE) {
    io.stderr.write(`${parsed.inputFile}: file exceeds maximum size of 20 MiB\n`);
    return 2;
  }

  let content: string;
  try {
    content = await fs.readFile(parsed.inputFile, "utf-8");
  } catch (err) {
    io.stderr.write(
      `${parsed.inputFile}: read error (${err instanceof Error ? err.message : String(err)})\n`,
    );
    return 2;
  }

  let parsedRuns: unknown;
  try {
    parsedRuns = JSON.parse(content);
  } catch (err) {
    io.stderr.write(
      `${parsed.inputFile}: invalid JSON (${err instanceof Error ? err.message : String(err)})\n`,
    );
    return 2;
  }

  if (!Array.isArray(parsedRuns)) {
    io.stderr.write(`${parsed.inputFile}: invalid JSON (root must be an array of runs)\n`);
    return 2;
  }

  let dashboard: ReturnType<typeof buildDashboard>;
  try {
    const opts: {
      baseline: string;
      higherIsBetter: Record<string, boolean>;
      regressionThreshold?: number;
      title?: string;
    } = {
      baseline: parsed.baseline,
      higherIsBetter: parsed.higherIsBetter,
    };
    if (parsed.threshold !== undefined) {
      opts.regressionThreshold = parsed.threshold;
    }
    if (parsed.title !== undefined) {
      opts.title = parsed.title;
    }
    dashboard = buildDashboard(parsedRuns as EvalRun[], opts);
  } catch (err) {
    io.stderr.write(
      `Dashboard build failed: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  let output: string;
  if (parsed.format === "json") {
    output = JSON.stringify(dashboard, null, 2);
  } else {
    output = renderHtml(dashboard);
  }

  if (parsed.out) {
    try {
      await fs.writeFile(parsed.out, output, "utf-8");
    } catch (err) {
      io.stderr.write(
        `Failed to write output file: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
  } else {
    io.stdout.write(output);
  }

  return 0;
}
