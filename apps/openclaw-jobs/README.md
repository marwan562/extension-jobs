# @extension-jobs/openclaw-jobs

The public OpenClaw plugin for a locally running Extension Jobs daemon. It exposes focused generic tools, keeps deprecated `wuzzuf_*` aliases for one migration release, bundles the Extension Jobs skill, and never grants human approval.

Configure a distinct least-privilege daemon token. `enableSubmissionTool` defaults to `false`; enabling it does not remove the trusted extension approval requirement.
