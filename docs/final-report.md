# Public v1 implementation report

Report date: 2026-07-23 (Africa/Cairo). This is a release-candidate report. Locally verified criteria are marked **PASS**; criteria requiring a hosted run are marked **FAIL**, not inferred.

## 1. Current HEAD inspected

- Branch: `main`, tracking `origin/main`.
- Baseline HEAD: `95538ae6c0cdd3b9c2524f08283cdfd2eb64879b` (`test: make stale lock regression deterministic`).
- First implementation commit inspected remotely: `be530572a880f54fcacf87c0bb4d2d992f64bb56` (`feat: implement openclaw-jobs SDK with supporting architecture, documentation, and orchestrator integration`).
- The first hosted CI run for that commit was audited before this follow-up; the release-candidate fixes remain reviewable as the current working-tree diff until committed.

## 2. Baseline command results

Before modification, `npm ci`, lint/typecheck, 18 unit tests, 6 contract tests, 16 integration tests, 8 E2E tests, build, and plugin validation passed. Integration/E2E required a sandbox exception for loopback listeners and Chromium. Doctor passed local invariants and warned that the daemon, Composio host, and Chrome CDP were not running/configured. The untouched architecture and results are recorded in [implementation-audit.md](implementation-audit.md).

## 3. Before-and-after architecture

Before: contracts and clients were Wuzzuf-specific; discovery source and application destination were coupled; queued browser jobs executed inline; resume bytes were stored in SQLite without a complete provenance/tailoring/render pipeline; the extension used broad static page access; the CLI did not provide a public-product lifecycle.

After: canonical generic contracts feed a versioned site-policy registry, separate source/destination boundaries, a safe current-page resolver, universal form engine, ATS adapters, daemon-owned SQLite state, private artifact vault, grounded resume import/tailor/render packages, authenticated standalone worker, generic daemon routes, generic OpenClaw and Composio packages, least-privilege extension, public CLI, CI, and reproducible release packaging. `JobApplicationService` owns the public application lifecycle; Wuzzuf connector execution sits behind it, and deprecated Wuzzuf routes/tools are tested aliases back into that same service.

## 4. Final repository tree

```text
extension-jobs/
├── apps/
│   ├── cli/                    public setup/administration CLI
│   ├── extension/              MV3 trusted review/control UI
│   ├── openclaw-jobs/          generic plugin + bundled skill
│   ├── openclaw-wuzzuf/        compatibility plugin
│   ├── composio-host/          persistent local Composio host
│   ├── orchestrator/           loopback policy/system-of-record daemon
│   └── playwright-worker/      standalone browser/render worker
├── packages/
│   ├── shared-contracts/ connector-sdk/ site-policy-registry/
│   ├── destination-resolver/ universal-form-engine/ ats-adapters/
│   ├── artifact-store/ resume-importers/ resume-tailor/ resume-renderer/
│   ├── composio-jobs/ composio-wuzzuf/ persistence/ profile-engine/
│   └── shared/ security/ site-adapters/ workflow-engine/ provider-sdk/
├── docs/                       architecture, safety, workflow, and release docs
├── tests/                      unit, contract, integration, browser, package, PDF
├── scripts/                    doctor, scan, PDF verifier, release packager
├── output/release/             generated archives/checksums (gitignored)
└── .github/                    OS-matrix CI and contribution templates
```

## 5. Packages created, renamed, moved, or deleted

Created public packages: `@extension-jobs/cli`, `@extension-jobs/openclaw-jobs`, and `@extension-jobs/composio-jobs`.

Created private internal packages: `artifact-store`, `ats-adapters`, `connector-sdk`, `destination-resolver`, `resume-importers`, `resume-tailor`, `resume-renderer`, `site-policy-registry`, and `universal-form-engine`.

No existing package was deleted or mechanically moved. `openclaw-wuzzuf` and `composio-wuzzuf` remain compatibility packages.

## 6. Migrations

- `002_public_v1.sql`: queue progress/results/cancellation, connector settings, resume sources, artifacts, tailored resumes, and approved-answer memory.
- `003_canonical_profile_snapshots.sql`: immutable provenance-rich canonical snapshots. This is separate because migration 002 may already exist in an installation.
- The runner bootstraps `schema_migrations`, applies only missing versions, wraps post-bootstrap migrations transactionally, and preserves legacy data/states.

## 7. Generic OpenClaw tool inventory

46 focused tools:

```text
job_automation_status, job_automation_doctor, job_automation_emergency_stop,
job_automation_clear_emergency_stop, job_automation_get_audit_events,
jobs_get_connector_capabilities, jobs_get_connection_status, jobs_open_login,
candidate_profile_list, candidate_profile_get, candidate_profile_update_preferences,
candidate_profile_list_resumes, candidate_profile_import_resume,
candidate_profile_select_resume, candidate_profile_approve_resume,
candidate_profile_get_resume_variants, jobs_search, jobs_import_current_page,
jobs_get_details, jobs_score, jobs_explain_match, jobs_shortlist, jobs_reject,
jobs_tailor_resume, jobs_get_tailored_resume_review, jobs_approve_tailored_resume,
jobs_get_resume_artifact, jobs_prepare_application, jobs_get_application_review,
jobs_set_application_answer, jobs_fill_application, jobs_validate_application,
jobs_request_submission_approval, jobs_submit_application,
jobs_cancel_application, jobs_get_application_status, campaign_create,
campaign_preview, campaign_update, campaign_run, campaign_pause,
campaign_resume, campaign_cancel, campaign_get, campaign_list,
campaign_get_activity
```

Generic details, scoring, tailoring/review, artifact metadata, campaigns, status, and emergency-stop routes call the daemon. Trusted-UI-only actions fail closed. Submission is not preloaded, disabled by default, requires a current trusted one-use approval, and is never retryable after uncertainty.

## 8. Compatibility tool inventory

15 deprecated aliases remain: `wuzzuf_create_connection`, `wuzzuf_open_login`, `wuzzuf_get_auth_status`, `wuzzuf_verify_connection`, `wuzzuf_disconnect`, `wuzzuf_search_jobs`, `wuzzuf_get_job_details`, `wuzzuf_score_job`, `wuzzuf_prepare_application`, `wuzzuf_fill_application`, `wuzzuf_get_application_review`, `wuzzuf_request_submission_approval`, `wuzzuf_submit_application`, `wuzzuf_get_application_status`, and `wuzzuf_cancel_application`.

## 9. Composio tool inventory

The local `JOBS` toolkit exposes 18 operations: `STATUS`, `CONNECTOR_CAPABILITIES`, `SEARCH_JOBS`, `IMPORT_CURRENT_PAGE`, `GET_JOB_DETAILS`, `SCORE_JOB`, `PREPARE_APPLICATION`, `GET_APPLICATION_REVIEW`, `FILL_APPLICATION`, `REQUEST_SUBMISSION_APPROVAL`, `GET_APPLICATION_STATUS`, `CANCEL_APPLICATION`, `CREATE_CAMPAIGN`, `RUN_CAMPAIGN`, `PAUSE_CAMPAIGN`, `RESUME_CAMPAIGN`, `LIST_CAMPAIGNS`, and `EMERGENCY_STOP`. It intentionally exposes no approval decision or submission tool.

## 10. Connector capability matrix

| Connector | Default | Discovery/details | Fill | Submit |
| --- | --- | --- | --- | --- |
| Wuzzuf | on | worker browser automation | worker automation | worker browser + approval |
| Indeed, LinkedIn, Bayt, Glassdoor | on | user-triggered/assisted | assisted | manual |
| ZipRecruiter | off | configured API/user-triggered | assisted | manual |
| Greenhouse, Lever, Ashby | on | public/API where available | assisted adapter | browser + approval |
| Workable, SmartRecruiters, Workday | on | user-triggered | assisted adapter | browser + approval |
| Employer site, email | off | limited/handoff | manual | manual |
| Unsupported | off | unsupported | unsupported | unsupported |
| Development fixture | off | deterministic fixture | deterministic | approval-gated fixture |

Policies are versioned `2026-07-22.1`, exact/suffix-host constrained, and fail closed for unknown IDs, hosts, layouts, redirects, and capabilities.

## 11. Trust boundaries

Job pages are untrusted. Content scripts extract only bounded allowlisted JSON-LD/metadata and never receive daemon credentials. The extension service worker holds a short paired session. OpenClaw and Composio use different scoped token hashes. The loopback daemon authorizes routes, enforces policies/idempotency/approvals, persists workflow, and sanitizes output. SQLite and the opaque artifact vault are private local storage. Worker payloads are authenticated and AES-256-GCM encrypted. Chrome retains cookies and browser-profile credentials. Agents cannot grant approval or read resume bytes, cookies, browser credentials, token hashes, local paths, or extension-only PDF content.

## 12. Application state machine

Canonical progression is `DISCOVERED → NORMALIZED → DEDUPLICATED → SCORED → SELECTED → RESUME_TAILORING → RESUME_REVIEW_REQUIRED → RESUME_APPROVED → APPLICATION_INSPECTING → APPLICATION_REVIEW_REQUIRED → APPROVED_FOR_FILL → FILLING → FILLED → VALIDATING → AWAITING_SUBMISSION_APPROVAL → SUBMITTING → SUBMITTED`. Auth, challenge, form-change, policy-blocked, retryable/permanent failure, duplicate, cancelled, skipped, and rejected side/terminal states are explicit. Persisted legacy states remain readable.

## 13. Campaign workflow

A local scheduled run acquires a durable lock, asks the worker-backed discovery source for jobs, normalizes, deduplicates, scores with explanations, applies per-run/day limits, and prepares review items. Research-only and prepare-and-review modes never submit. Every submission still requires its own trusted approval. Create/run/pause/resume are available in OpenClaw, Composio, daemon routes, and the extension; emergency stop cancels queued/running jobs. Correlation IDs and sanitized audit events make runs traceable.

## 14. Resume import and tailoring pipeline

CLI and extension imports validate direct user-selected PDF/DOCX/MD/TXT/JSON/YAML bytes, real paths, symlinks, signatures, extension, and size; copy into a mode-0600 opaque vault; hash content; and stop relying on the original path. Extraction produces identity/contact, employment, education, projects, skills, certifications, languages, links, and provenance facts. Facts start unverified. Approval creates an immutable snapshot. Tailoring selects only verified facts, reports matches and missing requirements, binds every line to fact IDs, produces a visible diff, supports idempotency, and rejects unsupported claims.

## 15. PDF renderer design

The worker creates stable canonical JSON, semantic single-column HTML, A4 selectable-text PDF, tailoring diff, and validation report. Chromium supplies print layout; `pdf-lib` normalizes metadata to a fixed epoch. Artifacts use opaque IDs, private files, SHA-256, and metadata-only agent access. Repeated render hashes match. Poppler extraction/rendering and visual inspection found no clipping, overlap, or glyph defects. Only a paired extension session can request PDF bytes for local preview.

## 16. Worker architecture

The daemon enqueues encrypted work; a separate process atomically claims leases, heartbeats, reports bounded progress, observes cancellation/emergency stop, stores structured results, recovers expired retryable leases, and shuts down safely. Production Wuzzuf operations, generic browser-backed discovery used by search/campaigns, and resume rendering execute in the worker. Final submission types have `maxAttempts=1`; approval secrets are not stored as plaintext queue payloads, and uncertain results are terminal/manual-review events. Unsupported generic ATS application handlers fail closed rather than executing inline.

## 17. Extension permission and UI changes

Removed `<all_urls>` and global `content_scripts`. Static host permission is loopback only. The extension uses `activeTab`, `scripting`, and connector-specific `optional_host_permissions`; permission and injection occur only after user invocation. Bearer sessions remain in the service worker. The UI now covers pairing/health, connector capabilities, safe current-page analysis, match score, canonical resume fact/provenance review, resume approval/deletion, tailoring diff/missing requirements, private PDF preview, sensitive-answer review, fill result, Wuzzuf submission approval, campaign create/run/pause/resume, queue/history, sanitized export, explicit personal-data deletion, actionable errors, and emergency stop.

## 18. CLI commands

`init`, `doctor`, `start`, `stop`, `status`; `resume add/list/inspect/approve/remove`; `connectors list/enable/disable/status`; `openclaw install/verify`; and `extension build`. `init` detects Node/OS prerequisites through diagnostics, creates private directories, initializes/migrates the daemon database, and writes distinct secrets only to a private `.env`. Start launches both daemon and standalone worker. Resume and connector commands operate on the same SQLite database/vault as the daemon.

## 19. Public package names

- `@extension-jobs/cli@1.0.0-rc.1`
- `@extension-jobs/openclaw-jobs@1.0.0-rc.1`
- `@extension-jobs/composio-jobs@1.0.0-rc.1`

The repository root remains `private: true`.

## 20. Commands executed

Audit/setup: Git status/log/revision/tree searches, full prompt read, `npm ci`, doctor, and GitHub Actions job/log inspection for pushed commit `be53057`. Verification: lint/typecheck, unit, contract, integration, E2E and wildcard suites; generic/compatibility convergence contracts; build; plugin build/validate; PDF verification plus Poppler inspection; secret scan; `git diff --check`. Packaging: `npm pack`, clean offline tarball install/import/runtime, OpenClaw link/inspect/skill/uninstall checks, extension ZIP integrity, and SHA-256 verification. `composio whoami` confirmed a local connection without printing credentials. The root online audit could not be independently refreshed under the network policy; an offline result is not treated as equivalent, and the authoritative hosted gate remains enabled.

## 21. Test, build, plugin, and skill results

- Typecheck/lint: **PASS**.
- Unit: **PASS 31/31**; contract: **PASS 10/10**; integration: **PASS 18/18**; E2E: **PASS 10/10**.
- Complete wildcard suite: **PASS 76/76**.
- Build: **PASS** for root, extension, CLI, generic packages, compatibility packages, and host.
- OpenClaw plugin build/validation: **PASS**; warnings were limited to read-only unrelated global OpenClaw state.
- Bundled `skills/extension-jobs/SKILL.md`, manifest/runtime inventory, link/install/uninstall, and clean packed import: **PASS**.
- Clean offline install of all three public tarballs: **PASS**; imports and CLI help worked; isolated graph reported zero vulnerabilities.
- Extension ZIP integrity, release manifest, and all four SHA-256 checksums: **PASS**.
- PDF text extraction, deterministic hashes/metadata, and visual layout: **PASS**.
- Secret scan and `git diff --check`: **PASS**.
- Root dependency audit: **NOT CLEARED ONLINE**; the earlier install summary reported 7 moderate and 1 high advisory.
- Hosted Linux/macOS/Windows CI: **FIRST RUN AUDITED, REPLACEMENT PENDING**. The first run found missing Chromium provisioning, plugin build-order coupling, and a POSIX mode assertion on Windows; all three have focused regression fixes.

## 22. Known limitations

The remaining stable-v1 release gate is an observed green hosted OS matrix with its online high-severity dependency review. Generic ATS application execution remains deliberately fail-closed until each production connector is maintained. Live production submission is intentionally untested. See [known-limitations.md](known-limitations.md).

## 23. Manual setup steps

1. Install Node.js 24+ and run `npm ci`.
2. Run `npm run extension-jobs -- init`; do not share the generated `.env`.
3. Configure distinct OpenClaw, Composio, worker, pairing, and extension-origin values.
4. Start a user-controlled Chrome with a dedicated loopback CDP endpoint and sign into desired sites manually.
5. Run `npm run doctor`, `npm run build`, and `npm run openclaw:install`.
6. Load `apps/extension` unpacked (or use the verified ZIP), pair once, and grant only invoked connector origins.
7. Import, inspect, and approve a resume; begin with dry-run/fixture or non-submitting flows.
8. Configure Composio only if required, with its distinct least-privilege token.
9. Verify release files from inside their directory with `shasum -a 256 -c SHA256SUMS` (or platform equivalent).

## 24. Acceptance checklist

### Architecture

- **PASS** generic contracts exist; source/destination are separate; capability policy fails closed; daemon/SQLite/vault are the system of record; `JobApplicationService` owns application orchestration; Wuzzuf connector execution is behind it; compatibility routes/tools are thin, documented, and tested aliases.

### Resume

- **PASS** secure import; employment/education/projects/skills/certifications/links; provenance; immutable snapshots; tailoring plan; unsupported-claim failure; visible diff/approval; ATS-safe PDF; extractable text.

### Application

- **PASS** current-page analysis; destination resolution; canonical deterministic fields; sensitive review; multi-step fingerprints; persistent workflow.

### Reliability

- **PASS** production browser operations and renderer use the worker; leases recover; emergency stop/cancellation propagate; final submission is never automatically retried; duplicate tests prove one submission action.

### OpenClaw

- **PASS** generic tools; manifest/runtime match; bundled validated skill; agents cannot approve; clean packed install/import works.

### Composio

- **PASS** generic `JOBS` toolkit; same daemon; no resume bytes/browser credentials/approval decisions; uncertain writes are not retried.

### Extension

- **PASS** no `<all_urls>`; optional connector permissions; no bearer tokens in content scripts; tailoring diff/PDF review; trusted human approval; package validation/ZIP pass.

### Public release

- **PASS** license/security/privacy/contribution files; publishable intended packages; private root; generated checksummed artifacts; secret scan; required documentation.
- **FAIL** cross-platform CI is configured but has not been observed green for this worktree; the online high-severity dependency gate is not cleared.

Overall: **release candidate implemented and locally verified; stable public-v1 promotion remains blocked only by the hosted CI/audit FAIL above**.

## 25. Recommended next work

1. Require Linux/macOS/Windows CI plus the current online `npm audit --audit-level=high` gate to pass before release promotion.
2. Add sanitized multi-step production fixtures per ATS and enable each worker handler only after policy, challenge, and duplicate-submit review.
3. Add OS keychain/credential-store integration and consider Native Messaging as a hardened alternative transport.
4. Run a supervised, dry-run-first production canary and document manual verification for uncertain external outcomes.
