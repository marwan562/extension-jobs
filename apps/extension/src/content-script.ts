interface ApprovedAnswer { fieldId: string; label: string; value: string; confirmationRequired: boolean; approved?: boolean }
chrome.runtime.onMessage.addListener((message: { type: string; answers?: ApprovedAnswer[]; dryRun?: boolean }, _sender: unknown, respond: (value: unknown) => void) => {
  if (message.type !== 'fill-approved') return;
  const filled: string[] = []; const skipped: string[] = [];
  for (const answer of message.answers ?? []) {
    if (answer.confirmationRequired && !answer.approved) { skipped.push(answer.label); continue; }
    const controls = [...document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select')];
    const control = controls.find((item) => accessibleName(item).toLowerCase().includes(answer.label.toLowerCase()) || answer.label.toLowerCase().includes(accessibleName(item).toLowerCase()));
    if (!control) { skipped.push(answer.label); continue; }
    if (!message.dryRun) { control.value = answer.value; control.dispatchEvent(new Event('input', { bubbles: true })); control.dispatchEvent(new Event('change', { bubbles: true })); }
    filled.push(answer.label);
  }
  respond({ ok: true, filled, skipped, dryRun: message.dryRun !== false });
});
function accessibleName(control: HTMLElement): string { const id = control.id; const label = id ? document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(id)}"]`)?.textContent : ''; return (label || control.getAttribute('aria-label') || control.getAttribute('name') || '').trim(); }
