# Security policy

## Supported versions

Security fixes are provided for the newest release candidate or stable release. Older pre-release builds are unsupported.

## Reporting

Do not open a public issue for a suspected vulnerability. Use GitHub's private vulnerability reporting for `marwan562/extension-jobs` and include the affected version, reproduction, impact, and any proposed mitigation. Do not include real credentials, resumes, cookies, approval tokens, or production application data.

## Boundaries

Extension Jobs binds to loopback, keeps browser credentials in the user's browser, stores secrets and artifacts locally with restrictive permissions, hashes approval/client tokens at rest, and rejects unknown origins, destinations, layouts, capabilities, or form fingerprints. Agents may request but never grant submission approval. Challenges are never bypassed and uncertain submissions are never automatically retried.

See [the threat model](docs/threat-model.md) and [security model](docs/security-model.md).
