# Assumptions and unresolved questions

## Assumptions

- Node.js 24 is the supported local runtime, allowing the built-in SQLite module.
- OpenClaw exposes its existing OpenAI-compatible endpoint only on loopback.
- The first source may use deterministic fixtures until the connected Composio LinkedIn action is confirmed.
- Automatic submission remains disabled; prepare-and-review satisfies the first safe milestone.
- Cairo (`Africa/Cairo`) is the default user timezone, but every campaign stores its own IANA timezone.

## Unresolved

- Exact Composio LinkedIn search action and response schema for the user's connection.
- Preferred OS credential-store library and data-retention durations.
- Which CV facts the user wishes to mark verified after import, and which CV variant should be the default.
- Whether Greenhouse or Lever should be the first production Playwright adapter after the mock slice.
