# Data flow

```mermaid
flowchart LR
  Page["Job page"] -->|"allowlisted JSON-LD/metadata"| Extension["MV3 extension"]
  OpenClaw["OpenClaw tools"] -->|"scoped token"| Daemon["Loopback orchestrator"]
  Composio["Composio toolkit"] -->|"distinct scoped token"| Daemon
  Extension -->|"paired short session"| Daemon
  Daemon --> DB["SQLite system of record"]
  Daemon --> Vault["Private artifact vault"]
  DB --> Worker["Leased browser/render worker"]
  Worker -->|"safe inspect/fill"| Browser["User Chrome profile"]
  Browser --> ATS["Approved destination"]
```

Approval is created from the extension decision surface and is bound to the reviewed job, resume, answers, profile snapshot, and form fingerprint. The daemon stores only its hash; the one-use value remains in extension memory. Worker results flow back to SQLite and safe status APIs.
