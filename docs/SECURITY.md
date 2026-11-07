# Security Model

## Threat Model

This utility processes potentially untrusted evaluation run names, model identifiers, and metric labels which may contain XSS payloads. 

### Defended
- **XSS Injection**: All textual data (model names, metric names, titles) is passed through `escapeHtml`, neutralizing `&`, `<`, `>`, `"`, and `'` characters.
- **Unauthorized Execution**: The output is entirely static, script-free HTML. It includes a Content Security Policy header (`default-src 'none'; style-src 'unsafe-inline'`) to prevent execution of any malicious code, should it be injected into styles.
- **Denial of Service**: The utility enforces strict limits: 10,000 runs, 200 metrics, and a 20 MiB input file size (CLI).

### Not Defended
- **Data Integrity**: The tool assumes the input JSON is authentic and has not been tampered with prior to being provided to the library.
