# Dashboard API

Base path: `/v1/dashboard`. All responses except PDF/SSE use:

```json
{
  "ok": true,
  "data": {},
  "correlationId": "uuid"
}
```

Errors use `ok: false`, a safe `error` string, and the correlation ID. The daemon also returns `X-Correlation-Id`.

## Session

| Method | Path | Purpose |
|---|---|---|
| POST | `/session` | Exchange pairing code for HttpOnly cookie and in-memory CSRF |
| GET | `/session` | Validate session and rotate CSRF |
| DELETE | `/session` | Invalidate current session |

All following endpoints require the cookie. Non-GET requests also require `X-CSRF-Token`.

## Overview and live data

| Method | Path | Purpose |
|---|---|---|
| GET | `/summary` | Health, KPIs, attention, match distribution, campaign pulse |
| GET | `/events` | Bounded SSE ready/heartbeat stream |
| GET | `/activity` | Sanitized cursor-paginated audit events |
| GET | `/analytics` | Derived funnel and source performance |
| POST | `/chat` | Grounded NDJSON assistant stream |

## Jobs

`GET /jobs` accepts `q`, `source`, `disposition`, `state`, `minScore`, `sort`, `cursor`, and `limit` (1–100). Results are filtered and paginated by the daemon.

| Method | Path | Purpose |
|---|---|---|
| GET | `/jobs/:id` | Detail, match explanation, and connector capability |
| POST | `/jobs/:id/shortlist` | Shortlist |
| POST | `/jobs/:id/reject` | Reject |
| PUT | `/jobs/:id/note` | Versioned note |
| POST | `/jobs/:id/prepare` | Delegate dry/live preparation to application service |
| POST | `/jobs/:id/tailor` | Idempotent, fact-grounded tailoring and optional worker render |
| POST | `/jobs/bulk` | Safe shortlist/reject/tag only |
| GET/POST | `/jobs/views` | List/create/update saved views |
| DELETE | `/jobs/views/:id` | Delete saved view |

There is no bulk prepare, approval, or submit action.

## Applications and approvals

| Method | Path | Purpose |
|---|---|---|
| GET | `/applications` | Cursor page, optionally by state |
| GET | `/applications/:id` | Authenticated exact review record; never used in audit/list payloads |
| GET | `/applications/:id/timeline` | State transitions and audit events |
| POST | `/applications/:id/fill` | Delegate dry/live reviewed fill to the connector service |
| POST | `/applications/:id/request-approval` | Create short-lived review request |
| GET | `/approvals` | Cursor page by status |
| POST | `/approvals/:id/decision` | Dashboard-only approve/reject |
| POST | `/approvals/:id/submit` | Explicit one-attempt submission using daemon-held token |

## Resumes and artifacts

| Method | Path | Purpose |
|---|---|---|
| GET | `/resumes` | Source fact records and tailored reviews |
| POST | `/resumes/import` | Validated local import into artifact vault |
| GET | `/resumes/:id` | Source metadata and facts |
| POST | `/resumes/:id/approve` | Verify facts and create immutable snapshot |
| POST | `/tailored-resumes/:id/approve` | Approve tailored variant |
| POST | `/tailored-resumes/:id/reject` | Record negative review response |
| GET | `/artifacts/:id/content` | Inline authenticated PDF only |

## Campaigns, connectors, and local control

| Method | Path | Purpose |
|---|---|---|
| GET/POST | `/campaigns` | List/create |
| POST | `/campaigns/preview` | Return effective safeguards without persistence |
| PATCH | `/campaigns/:id` | Update |
| POST | `/campaigns/:id/run` | Run with daemon limits/lock |
| POST | `/campaigns/:id/pause` | Pause |
| POST | `/campaigns/:id/resume` | Resume |
| GET | `/connectors` | Truthful capability list |
| GET | `/connectors/:id` | Connector detail |
| POST | `/connectors/:id/enable` | Enable known policy |
| POST | `/connectors/:id/disable` | Disable known policy |
| GET | `/manual-actions` | Derived/persisted handoff inbox |
| POST | `/manual-actions/:id/continue` | Mark continued |
| POST | `/manual-actions/:id/cancel` | Cancel item and application where bound |
| GET/PUT | `/preferences` | Versioned dashboard preferences |
| POST | `/emergency-stop` | Stop and request queue cancellation |
| POST | `/emergency-stop/reset` | Clear stop |

Cursor values are opaque base64url offsets in v1. Consumers must not derive or modify them.
