# Testing

The suite is split into unit, contract, integration, and Playwright/PDF E2E commands. Tests use local fixtures and temporary databases; no production account or live submission is permitted. Integration/E2E tests need loopback-listener permission.

Release checks also build every workspace, validate the OpenClaw manifest, pack/install public packages, render and inspect a resume PDF, scan tracked source for secret patterns, create the extension ZIP, and hash all artifacts. CI runs the core matrix on Linux, macOS, and Windows, with release safety on Linux.
