# Canonical contracts

`packages/shared-contracts` is the public contract source for normalized jobs, discovery sources, application destinations, connector capabilities, canonical form fields, resume facts/snapshots, artifacts, workflow states, queue jobs, tool envelopes, and stable error codes. Runtime boundaries return `{ ok, data?, error?, meta? }`; errors include a stable `code`, safe `message`, and optional bounded `details`.

Legacy Wuzzuf states, routes, queue names, and tools remain aliases for the migration release. New code must consume canonical types and translate only at an explicit compatibility boundary. See [tool contracts](tool-contracts.md).
