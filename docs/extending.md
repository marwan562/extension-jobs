# Adding providers and site adapters

## LLM provider

Implement `LlmProvider` in `packages/provider-sdk`: connection test, model discovery, and `AsyncIterable` streaming chat. Validate structured outputs at the consuming boundary, enforce timeouts/budgets, redact errors, and keep secrets in the backend. OpenAI, Anthropic, Gemini, Ollama, LM Studio, and custom OpenAI-compatible endpoints can share this interface; provider-specific retry/cost metadata belongs in the adapter.

## Site adapter

Implement `JobSiteAdapter` in `packages/site-adapters`, then add contract and fixture HTML tests. Prefer roles, labels, accessible names, and stable attributes. Return `handoff_required` for CAPTCHA/MFA/auth and never bypass controls. Do not implement `submit` until site policy, idempotency reservation, campaign opt-in, and final approval tests all pass.

LinkedIn remains a Composio `JobSource`; do not add Playwright scraping when supported Composio actions cover the workflow.
