# Architecture

The loopback orchestrator is the policy boundary and intended system of record. Public clients are thin; domain packages hold reusable policy and deterministic logic; SQLite and the private artifact vault hold durable local state.

## Package dependencies

```mermaid
flowchart TD
  Contracts["shared-contracts"] --> Policy["site-policy-registry"]
  Contracts --> SDK["connector-sdk"]
  Contracts --> Forms["universal-form-engine"]
  Contracts --> Resume["resume import / tailor / renderer"]
  Policy --> Resolver["destination-resolver"]
  Forms --> ATS["ATS adapters"]
  SDK --> ATS
  Resume --> Service["generic job application service"]
  Resolver --> Service
  ATS --> Service
  Service --> Orchestrator["loopback orchestrator"]
  Persistence["SQLite persistence / durable queue"] --> Orchestrator
  Orchestrator --> Clients["extension / OpenClaw / Composio / CLI"]
  Persistence --> Worker["Playwright worker"]
```

## Runtime flow

```mermaid
sequenceDiagram
  participant U as User
  participant C as Thin client
  participant O as Orchestrator
  participant D as SQLite/vault
  participant W as Worker
  participant B as Existing Chrome
  U->>C: Search/import/review command
  C->>O: Scoped loopback request
  O->>D: Normalize, authorize, persist, enqueue
  W->>D: Atomic lease + heartbeat
  W->>B: Inspect/fill reviewed destination
  W->>D: Progress and structured result
  O-->>C: Sanitized status/result
```

The generic service normalizes jobs, resolves discovery and destination independently, consults versioned capability policy, selects only verified profile facts, and owns the application lifecycle. Wuzzuf connector execution sits behind this service; deprecated Wuzzuf routes and tools are thin aliases back into it. Unknown connectors, states, capabilities, hosts, layouts, redirects, and form fingerprints fail closed.

The extension service worker owns its bearer session; content scripts receive only operation-specific messages. OpenClaw and Composio use distinct configured credentials and cannot approve submissions. Browser cookies remain inside the user's existing Chrome profile. Resume sources and generated files live in a private vault with opaque IDs and hashes.

The standalone worker runtime implements authenticated encrypted payloads, leases, heartbeat, cancellation, progress, results, recovery, and one-attempt final submission. Production Wuzzuf operations, browser-backed generic discovery used by search/campaigns, and Chromium resume rendering execute there. Development fixtures may run locally because they contain no production browser access. Unsupported ATS operations fail closed rather than falling back to daemon Playwright.
