# CLI

The `extension-jobs` CLI provides setup, diagnostics, lifecycle, resume-vault, connector, OpenClaw, and extension commands. It targets Node.js 24+ and operates on the current checkout or `EXTENSION_JOBS_HOME`.

`extension-jobs init` creates private local directories and writes new secret values only to `.env`; it preserves an existing file and never prints secrets. `resume add` copies a validated source into the vault, `inspect` shows facts, `approve` verifies reviewed facts, and `remove` deletes the exact local artifact. Connector state is local and requires a daemon restart.
