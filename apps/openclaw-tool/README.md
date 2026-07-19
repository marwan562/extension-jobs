# OpenClaw Job Automation Tool

Start the orchestrator with the same random `OPENCLAW_JOB_TOOL_TOKEN` available to the OpenClaw gateway, then install this local plugin:

```sh
openclaw plugins install ./apps/openclaw-tool
openclaw plugins enable job-automation
openclaw plugins validate --entry ./apps/openclaw-tool/index.js
```

Restart the OpenClaw gateway. OpenClaw receives the typed `job_automation` tool for profile context, professional answer preparation, status, existing campaign runs, and emergency stop. It does not receive arbitrary command, file, selector, or submission capability.
