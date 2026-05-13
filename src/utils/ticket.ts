// utils/ticket.ts — Impresión de ticket con diseño HTML completo
//
// Flujo: HTML → html2canvas (render invisible) → PNG base64 → Rust ESC/POS raster → impresora
// Resultado: ticket con logo, fuentes y diseño CSS impreso directo sin abrir navegador.

import html2canvas from 'html2canvas';
import { printHTMLDialogOverlay, escapeHTML } from './print';
import { invoke } from '../lib/invokeCompat';

export interface ConfigNegocio {
  nombre: string;
  direccion: string;
  telefono: string;
  rfc: string;
  mensaje_pie: string;
  /** Nombre de la impresora térmica ESC/POS en el sistema.
   *  Si está vacía → fallback a impresión HTML (navegador). */
  impresora_termica?: string;
}

export interface TicketItem {
  nombre: string;
  codigo: string;
  cantidad: number;
  precio_final: number;
  subtotal: number;
  descuento_porcentaje?: number;
}

export interface TicketData {
  folio: string;
  fecha: string;
  usuario: string;
  cliente?: string | null;
  items: TicketItem[];
  subtotal: number;
  descuento: number;
  /** Monto agregado por redondeo al peso siguiente (>= 0). Opcional. */
  redondeo?: number;
  total: number;
  metodo_pago: string;
  monto_recibido?: number;
  cambio?: number;
  reimpresion?: boolean;
  es_presupuesto?: boolean;
}

const fmt = (n: number) => `$${n.toFixed(2)}`;

let logoDataUrl: string | null = null;

async function getLogoDataUrl(): Promise<string> {
  if (logoDataUrl) return logoDataUrl;
  try {
    const resp = await fetch('/logo-ticket.png');
    const blob = await resp.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => { logoDataUrl = reader.result as string; resolve(logoDataUrl!); };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return '';
  }
}

// ─── HTML del ticket (diseño bonito para render) ─────────────

export function buildTicketHTML(negocio: ConfigNegocio, t: TicketData, logoSrc?: string): string {
  const metodo = t.metodo_pago.charAt(0).toUpperCase() + t.metodo_pago.slice(1);
  const mostrarEfectivo = t.metodo_pago === 'efectivo' && t.monto_recibido !== undefined;

  const itemsHTML = t.items.map(i => `
    <div class="item">
      <div class="item-nom">${escapeHTML(i.nombre)}</div>
      <div class="item-row">
        <span class="item-qty">${i.cantidad} x ${fmt(i.precio_final)}${i.descuento_porcentaje ? ` (-${i.descuento_porcentaje}%)` : ''}</span>
        <span class="item-sub">${fmt(i.subtotal)}</span>
      </div>
    </div>
  `).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${t.es_presupuesto ? 'Presupuesto' : 'Ticket'} ${escapeHTML(t.folio)}</title>
<style>
  @page { size: 80mm auto; margin: 0; }
  html, body { margin: 0; padding: 0; font-family: 'Courier New', monospace; color: #000; }
  body { width: 72mm; padding: 3mm; font-size: 11pt; line-height: 1.35; font-weight: 600; }
  .center { text-align: center; }
  .right { text-align: right; }
  .bold { font-weight: 900; }
  .big { font-size: 14pt; }
  .xl { font-size: 16pt; }
  .muted { font-size: 9pt; color: #333; font-weight: 600; }
  .sep { border-top: 1px dashed #000; margin: 6px 0; }
  .sep-thick { border-top: 2px solid #000; margin: 7px 0; }
  .row { display: flex; justify-content: space-between; gap: 4px; font-weight: 700; }
  .item { margin-bottom: 4px; }
  .item-nom { font-size: 11pt; font-weight: 700; }
  .item-row { display: flex; justify-content: space-between; font-size: 11pt; font-weight: 600; }
  .item-sub { font-weight: 900; }
  .total-row { font-size: 16pt; font-weight: 900; color: #000; }
  .reprint { border: 1px solid #000; padding: 2px 6px; display: inline-block; font-size: 9pt; margin-bottom: 3px; font-weight: 900; }
  .logo { width: 55mm; max-width: 80%; height: auto; margin: 4px auto; display: block; }
  .brand-name { font-size: 14pt; font-weight: 900; letter-spacing: 0.5px; margin: 3px 0; color: #000; }
  .brand-sub { font-size: 10pt; color: #000; font-weight: 800; letter-spacing: 1px; margin-bottom: 3px; }
  .footer-msg { font-size: 11pt; font-weight: 800; margin: 6px 0 3px; }
  .footer-brand { font-size: 9pt; color: #000; font-weight: 800; letter-spacing: 0.5px; margin-top: 5px; }
</style></head><body>
  ${t.es_presupuesto ? '<div class="center"><span class="reprint">*** PRESUPUESTO ***</span><br><span style="font-size: 7pt; font-weight: bold; padding-top: 2px; display: inline-block;">Esta cotización puede variar sin previo aviso.</span></div>' : (t.reimpresion ? '<div class="center"><span class="reprint">*** REIMPRESIÓN ***</span></div>' : '')}
  <div class="center">
    ${logoSrc ? `<img class="logo" src="${logoSrc}" alt="Paulín Premium Fruits" />` : ''}
    <div class="brand-name">${escapeHTML(negocio.nombre || 'PAULÍN PREMIUM FRUITS')}</div>
    <div class="brand-sub">LA VENTA ANDÉN D 7-8</div>
  </div>
  ${negocio.direccion ? `<div class="center muted">${escapeHTML(negocio.direccion)}</div>` : ''}
  ${negocio.telefono ? `<div class="center muted">Tel: ${escapeHTML(negocio.telefono)}</div>` : ''}
  ${negocio.rfc ? `<div class="center muted">RFC: ${escapeHTML(negocio.rfc)}</div>` : ''}
  <div class="sep-thick"></div>
  <div class="row"><span>Folio:</span><span class="bold">${escapeHTML(t.folio)}</span></div>
  <div class="row"><span>Fecha:</span><span>${escapeHTML(t.fecha)}</span></div>
  <div class="row"><span>Cajero:</span><span>${escapeHTML(t.usuario.split(' ')[0])}</span></div>
  ${t.cliente ? `<div class="row"><span>Cliente:</span><span>${escapeHTML(t.cliente)}</span></div>` : ''}
  <div class="sep"></div>
  ${itemsHTML}
  <div class="sep"></div>
  ${(t.descuento > 0 || (t.redondeo ?? 0) > 0) ? `
    <div class="row"><span>Subtotal:</span><span>${fmt(t.subtotal)}</span></div>
    ${t.descuento > 0 ? `<div class="row"><span>Descuento:</span><span>-${fmt(t.descuento)}</span></div>` : ''}
    ${(t.redondeo ?? 0) > 0 ? `<div class="row"><span>Redondeo:</span><span>+${fmt(t.redondeo!)}</span></div>` : ''}
  ` : ''}
  <div class="row total-row"><span>TOTAL:</span><span>${fmt(t.total)}</span></div>
  <div class="sep"></div>
  ${!t.es_presupuesto ? `
    <div class="row"><span>Pago:</span><span class="bold">${escapeHTML(metodo)}</span></div>
    ${mostrarEfectivo ? `
      <div class="row"><span>Recibido:</span><span>${fmt(t.monto_recibido!)}</span></div>
      <div class="row bold"><span>Cambio:</span><span>${fmt(t.cambio!)}</span></div>
    ` : ''}
    <div class="sep"></div>
  ` : ''}
  <div class="center footer-msg">${escapeHTML(negocio.mensaje_pie || '¡Gracias por su compra!')}</div>
  <div class="center muted">Conserve este ticket</div>
  <div class="center footer-brand">PAULÍN PREMIUM FRUITS</div>
</body></html>`;
}

// ─── Renderizar HTML a imagen PNG (base64) ───────────────────

/**
 * Crea un div oculto en el DOM, inyecta el HTML del ticket,
 * usa html2canvas para capturarlo como imagen, y devuelve el PNG en base64.
 */
async function renderTicketToBase64(html: string): Promise<string> {
  // Crear contenedor oculto que simula el ancho del papel térmico
  const container = document.createElement('div');
  container.style.cssText = `
    position: fixed;
    top: -9999px;
    left: -9999px;
    width: 576px;
    background: white;
    z-index: -1;
    font-family: 'Courier New', monospace;
  `;

  // Extraer el <body> content del HTML completo
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  // Extraer estilos del <style> tag
  const styleMatch = html.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
  const styles = styleMatch ? styleMatch[1] : '';

  // Inyectar estilos dentro del contenedor
  const styleEl = document.createElement('style');
  styleEl.textContent = `
    ${styles}
    /* Overrides para render térmico — tamaños grandes para 576px canvas */
    body, .ticket-render {
      width: 576px !important;
      padding: 20px !important;
      margin: 0 !important;
      font-size: 20px !important;
      line-height: 1.5 !important;
      font-weight: 700 !important;
      color: #000 !important;
      background: #fff !important;
    }
    .logo { width: 440px !important; max-width: 82% !important; margin: 8px auto !important; }
    .brand-name { font-size: 28px !important; font-weight: 900 !important; margin: 6px 0 !important; }
    .brand-sub { font-size: 18px !important; font-weight: 800 !important; }
    .total-row { font-size: 32px !important; font-weight: 900 !important; }
    .muted { font-size: 16px !important; color: #333 !important; }
    .item { margin-bottom: 6px !important; }
    .item-nom { font-size: 20px !important; font-weight: 800 !important; }
    .item-row { font-size: 20px !important; font-weight: 700 !important; }
    .item-sub { font-weight: 900 !important; }
    .row { font-size: 20px !important; font-weight: 700 !important; }
    .bold { font-weight: 900 !important; }
    .sep { border-top: 2px dashed #000 !important; margin: 12px 0 !important; }
    .sep-thick { border-top: 3px solid #000 !important; margin: 14px 0 !important; }
    .footer-msg { font-size: 20px !important; font-weight: 800 !important; margin: 10px 0 !important; }
    .footer-brand { font-size: 16px !important; font-weight: 800 !important; }
    .reprint { font-size: 16px !important; font-weight: 900 !important; padding: 4px 10px !important; }
  `;

  // Crear el wrapper con clase para los estilos
  const wrapper = document.createElement('div');
  wrapper.className = 'ticket-render';
  wrapper.innerHTML = bodyContent;

  container.appendChild(styleEl);
  container.appendChild(wrapper);
  document.body.appendChild(container);

  // Esperar a que las imágenes carguen
  const images = container.querySelectorAll('img');
  await Promise.all(Array.from(images).map(img =>
    img.complete ? Promise.resolve() : new Promise<void>((resolve) => {
      img.onload = () => resolve();
      img.onerror = () => resolve();
    })
  ));

  // Pequeño delay para asegurar que el layout está listo
  await new Promise(r => setTimeout(r, 50));

  try {
    // Renderizar con html2canvas
    const canvas = await html2canvas(wrapper, {
      backgroundColor: '#ffffff',
      scale: 2, // 2x para buena calidad
      width: 576,
      useCORS: true,
      logging: false,
    });

    // Convertir a PNG base64 (sin el prefijo data:image/png;base64,)
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1];
    return base64;
  } finally {
    // Limpiar el contenedor del DOM
    document.body.removeChild(container);
  }
}

// ─── Impresión automática (al completar venta) ──────────────

/** Impresión automática al completar venta — ESC/POS texto directo (instantáneo).
 *  Devuelve `null` si se imprimió bien, o un string con el error para que la UI lo muestre. */
export async function imprimirTicketAuto(negocio: ConfigNegocio, data: TicketData): Promise<string | null> {
  const impresora = (negocio.impresora_termica || '').trim();
  if (!impresora) {
    return 'no_printer';
  }
  try {
    // Enviar datos directo a Rust — genera ESC/POS texto en <1ms y lo manda al spooler
    await invoke('imprimir_ticket_termico', {
      datos: {
        negocio_nombre: negocio.nombre,
        negocio_direccion: negocio.direccion,
        negocio_telefono: negocio.telefono,
        negocio_rfc: negocio.rfc,
        mensaje_pie: negocio.mensaje_pie,
        folio: data.folio,
        fecha: data.fecha,
        usuario: data.usuario.split(' ')[0],
        cliente: data.cliente ?? null,
        items: data.items.map(i => ({
          cantidad: i.cantidad,
          nombre: i.nombre,
          precio_unitario: i.precio_final,
          subtotal: i.subtotal,
        })),
        subtotal: data.subtotal,
        descuento: data.descuento,
        redondeo: data.redondeo ?? 0,
        total: data.total,
        metodo_pago: data.metodo_pago,
      },
      impresora,
    });
    return null; // éxito
  } catch (e: any) {
    const msg = typeof e === 'string' ? e : e?.message || 'Error desconocido';
    console.error('Auto-impresión falló:', msg);
    return msg;
  }
}

// ─── Impresión manual (reimprimir) ──────────────────────────

/** Impresión manual (reimprimir) — usa imagen si hay impresora, o fallback a navegador. */
export async function imprimirTicket(negocio: ConfigNegocio, data: TicketData): Promise<void> {
  const impresora = (negocio.impresora_termica || '').trim();

  if (impresora) {
    // Intentar impresión por imagen
    try {
      const logo = await getLogoDataUrl();
      const html = buildTicketHTML(negocio, data, logo);
      const imagenBase64 = await renderTicketToBase64(html);

      await invoke('imprimir_ticket_imagen', {
        imagenBase64,
        impresora,
      });
      return; // Éxito
    } catch (e) {
      console.warn('Impresión por imagen falló, usando fallback HTML:', e);
      // Continúa al fallback
    }
  }

  // Fallback: abrir ticket en navegador
  const logo = await getLogoDataUrl();
  await printHTMLDialogOverlay(buildTicketHTML(negocio, data, logo));
}
