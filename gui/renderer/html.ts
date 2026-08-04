// Tiny DOM-based HTML-escaping helper shared by every renderer module that
// builds markup via innerHTML (app.ts, error-panel.ts).
export function escapeHtml(value: string): string {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}
