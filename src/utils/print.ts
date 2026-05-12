// utils/print.ts

import { invoke } from '../lib/invokeCompat';

export function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export async function printHTMLDialogOverlay(html: string): Promise<void> {
  try {
    await invoke('abrir_ticket_en_navegador', { html });
  } catch (e: any) {
    alert('No se pudo abrir el ticket para imprimir:\n' + (e?.message || e));
  }
}
