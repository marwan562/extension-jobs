# Adapter development

1. Add canonical fixtures containing no real applicant data.
2. Register a versioned exact-host policy with the smallest capability set.
3. Implement the source and destination interfaces independently.
4. Use semantic inspection and canonical fields; avoid brittle global selectors.
5. Reject unknown layouts, host changes, challenges, stale fingerprints, and unsupported questions.
6. Add unit, contract, fixture E2E, cancellation, and uncertain-submit tests.

Never bypass CAPTCHA, MFA, anti-bot, site policy, or a human approval gate. Submission must be one-attempt and idempotency-protected.
