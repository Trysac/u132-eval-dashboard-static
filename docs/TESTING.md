# Testing

## Tools

- [Vitest](https://vitest.dev/) executes the test suites.
- Coverage is measured using `@vitest/coverage-v8`.

## Test Files

- `test/cli.test.ts`: Covers CLI argument parsing, input/output operations, error handling (missing baseline, invalid JSON), and file output.
- `test/index.test.ts`: Covers `buildDashboard` logic (timestamp sorting, baseline handling, metric validation, status calculation), `renderHtml` (sanitization, layout), and helper functions.

## Coverage

Coverage must remain at or above 80% for lines, branches, functions, and statements. Tests are deterministic, isolate the public API, and verify observable behavior (return values, thrown errors).
