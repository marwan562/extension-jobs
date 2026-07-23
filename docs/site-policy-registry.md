# Site-policy registry

`packages/site-policy-registry` is the versioned, fail-closed capability authority. It covers Wuzzuf, Indeed, LinkedIn, Bayt, Glassdoor, ZipRecruiter, Greenhouse, Lever, Ashby, Workable, SmartRecruiters, Workday, employer/email handoff, local fixtures, and an unsupported fallback.

Policies define exact host suffixes, discovery and destination modes, supported capabilities, default enablement, and operator notes. Unknown connector IDs, hosts, or capabilities resolve to unsupported. Enabling a connector does not expand its declared capability set.
