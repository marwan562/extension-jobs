# OpenClaw Job Automation Tool

Start the orchestrator with `OPENCLAW_JOB_TOOL_TOKEN` in the git-ignored root `.env`. A linked development install reads that token locally; packaged production installs should inject it through OpenClaw's secret environment. Then install this local plugin:

```sh
openclaw plugins install --link ./apps/openclaw-tool
openclaw plugins enable job-automation
openclaw plugins validate --entry ./apps/openclaw-tool/index.js
```

Restart the OpenClaw gateway. OpenClaw receives the typed `job_automation` tool for profile context, professional answer preparation, status, existing campaign runs, and emergency stop. It does not receive arbitrary command, file, selector, or submission capability.
