# Browser session management

The Wuzzuf adapter connects only to a loopback Chrome CDP endpoint and reuses an existing user-controlled context. It opens application-managed tabs and never closes the user browser. Navigation is restricted to `https://wuzzuf.net` and `https://www.wuzzuf.net`. Security checks, logout, browser closure, and unsupported forms become normalized domain errors. External tools cannot supply selectors, JavaScript, CDP commands, arbitrary URLs, or file paths.
