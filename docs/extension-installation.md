# Extension installation

1. Run `npm run build`.
2. Open `chrome://extensions`, enable Developer mode, and choose **Load unpacked**.
3. Select `apps/extension`.
4. Copy the generated extension ID and restart the orchestrator with `EXTENSION_ID=<id>` and a random `PAIRING_CODE`.
5. Open the extension side panel, enter the pairing code, and verify **Connected**.

The content script is limited to the local mock site in milestone one. Add production site origins only with a reviewed site adapter and explicit allowlist setting.
