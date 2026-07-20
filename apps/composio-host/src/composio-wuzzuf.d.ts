declare module '@extension-jobs/composio-wuzzuf' {
  export function createWuzzufToolkit(options?: { baseUrl?: string; pairingCode?: string; timeoutMs?: number }): any;
}
