# Contributing

Use Node.js 24+, create a focused branch, and avoid real applicant data or production submissions in tests. Preserve generic contracts, Wuzzuf compatibility aliases, loopback-only defaults, review gates, and fail-closed policies.

Before opening a pull request run:

```sh
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:contract
npm run test:integration
npm run test:e2e
npm run build
npm run secret:scan
```

Connector changes need sanitized fixtures, capability/policy updates, exact-host tests, unknown-layout tests, and no CAPTCHA or anti-bot bypass. See [adapter development](docs/adapter-development.md).
