# Privacy

Extension Jobs is local-first. Resume sources, extracted facts, application history, screenshots, generated artifacts, approvals, and audit events stay under the configured local data directory unless the user explicitly sends a resume to an application destination.

The browser extension sends only allowlisted current-page fields and safe JSON-LD to the loopback daemon. It does not expose daemon bearer tokens to page scripts. The project does not collect telemetry and does not operate a hosted backend.

Deleting a resume through the CLI removes its exact private-vault artifact and metadata. Application/audit retention is controlled by the local database owner; backups must be deleted separately. Browser cookies and profiles are owned by Chrome and are never copied by this project.

Third-party job sites receive data only during user-directed browsing or an explicitly reviewed application. Their privacy terms apply independently.
