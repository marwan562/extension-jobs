# Known platform limitations

- The current workspace was empty; the older sibling prototype was inspected read-only and not modified. Its useful mock-form and OpenClaw concepts were adapted, while unsafe wildcard CORS, direct page access, in-memory approval, and credential fallback were not reused.
- CV import currently accepts text/Markdown and extracts contact data, links, and a skills line deterministically. Imported facts are editable and edits record user verification; PDF/DOCX extraction and richer experience/education parsing remain next work. Imported CV variants begin unapproved.
- Friendly schedules support daily and weekdays, but there is not yet a background cron tick/next-run calculator, lock leasing, quiet-hours executor, or missed-run recovery.
- Composio discovery is implemented behind a CLI adapter but requires the connected account's confirmed LinkedIn read-tool slug/schema. Sandbox network access prevented tool discovery during this milestone.
- The Playwright development adapter targets only the local mock site. Greenhouse and Lever are next; Wuzzuf/Indeed/Workday require fixtures and policy review.
- The side panel exposes campaign, preview, audit, chat, dry-run, and stop controls. Full profile editing, provider management, notification configuration, cost charts, trace retention UI, and failure retry inbox remain incremental milestones.
- Native Messaging and OS credential-store integration are required for production hardening.
