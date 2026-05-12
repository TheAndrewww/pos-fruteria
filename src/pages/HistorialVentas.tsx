// pages/HistorialVentas.tsx — Historial de ventas + anulación + devoluciones parciales

import React, { useState, useEffect } from 'react';
import { invoke } from '../lib/invokeCompat';
import { useAuthStore } from '../store/authStore';
import {
  useHistorialStore,
  VentaDetalleCompleto,
  VentaDetalleItem,
  DevolucionResumen,
} from '../store/historialStore';
import {
  ScrollText, Search, RefreshCw, X, Ban, CheckCircle2, Printer, Pencil,
} from 'lucide-react';
import { imprimirTicket, type ConfigNegocio } from '../utils/ticket';

type Tab = 'ventas' | 'devoluciones';

function fmt(n: number): string {
  return `$${n.toFixed(2)}`;
}

function formatFecha(fecha: string): string {
  try {
    const d = new Date(fecha.includes('T') ? fecha : fecha.replace(' ', 'T'));
    return d.toLocaleString('es-MX', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
  } catch { return fecha; }
}

function hoyISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

export default function HistorialVentas() {
  const { usuario } = useAuthStore();
  const { buscarVentas, listarDevoluciones, ventas, devoluciones, cargando } = useHistorialStore();
  const [tab, setTab] = useState<Tab>('ventas');

  // Filtros
  const [fechaInicio, setFechaInicio] = useState(hoyISO());
  const [fechaFin, setFechaFin] = useState(hoyISO());
  const [articuloTexto, setArticuloTexto] = useState('');
  const [articuloBuscado, setArticuloBuscado] = useState(''); // Texto activo usado para highlight
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Modal de detalle (para acciones, se usarán desde el detalle en línea)
  const [ventaSeleccionada, setVentaSeleccionada] = useState<VentaDetalleCompleto | null>(null);
  const [modalAnular, setModalAnular] = useState(false);
  const [modalEditar, setModalEditar] = useState(false);

  const cargar = async () => {
    try {
      setExpandedRows(new Set());
      const termino = articuloTexto.trim();
      setArticuloBuscado(termino);
      const r = await buscarVentas({
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        articulo_texto: termino,
      });
      // Si se buscó por artículo y devolvió resultados, abrirlos todos automáticamente
      if (termino !== '' && r && r.length > 0) {
        setExpandedRows(new Set(r.map(v => v.id)));
      }
    } catch (e) {
      alert('Error al buscar: ' + e);
    }
  };

  const cargarDevoluciones = async () => {
    try {
      await listarDevoluciones(100);
    } catch (e) {
      alert('Error al cargar devoluciones: ' + e);
    }
  };

  useEffect(() => {
    if (tab === 'ventas') cargar();
    else cargarDevoluciones();
  }, [tab]);

  const toggleRow = (id: number) => {
    const newEst = new Set(expandedRows);
    if (newEst.has(id)) newEst.delete(id);
    else newEst.add(id);
    setExpandedRows(newEst);
  };

  return (
    <div className="page-module" style={{ gap: 8 }}>
      {/* Module 1: Header */}
      <div className="module-card" style={{ flex: 'none', borderRadius: 16 }}>
      <div style={{
        padding: '12px 20px', 
        background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <ScrollText size={18} style={{ color: 'var(--color-primary)' }} />
        <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, flex: 1 }}>
          Historial de ventas
        </h2>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className={`btn btn-sm ${tab === 'ventas' ? '' : 'btn-ghost'}`}
            onClick={() => setTab('ventas')}
          >
            Ventas
          </button>
          <button
            className={`btn btn-sm ${tab === 'devoluciones' ? '' : 'btn-ghost'}`}
            onClick={() => setTab('devoluciones')}
          >
            Devoluciones
          </button>
        </div>
        </div>
      </div>

      {tab === 'ventas' && (
        <>
          {/* Module 2: Filtros */}
          <div className="module-card" style={{ flex: 'none', borderRadius: 16 }}>
          <div className="pos-hist-filtros" style={{
            padding: '12px 20px',
            background: 'var(--color-surface)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 2, minWidth: 220 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>🔍 Buscar artículo</label>
              <input
                value={articuloTexto}
                onChange={(e) => setArticuloTexto(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') cargar(); }}
                placeholder="Código, nombre o descripción del producto"
                className="input input-sm"
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>Desde</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="input input-sm"
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <label style={{ fontSize: 11, color: 'var(--color-text-muted)', fontWeight: 600 }}>Hasta</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="input input-sm"
              />
            </div>
            <button className="btn btn-sm" onClick={cargar} disabled={cargando}>
              <Search size={14} /> Buscar
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setFechaInicio(hoyISO()); setFechaFin(hoyISO()); setArticuloTexto(''); setArticuloBuscado(''); cargar(); }}
            >
              <RefreshCw size={14} /> Limpiar
            </button>
          </div>
          </div>

          {/* Module 3: Tabla ventas */}
          <div className="module-card" style={{ flex: 1, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflow: 'auto', background: 'var(--color-surface)' }}>
            <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <th style={thStyle}>Folio</th>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Cajero</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
                  <th style={{ ...thStyle, textAlign: 'center' }}>Items</th>
                  <th style={thStyle}>Estado</th>
                  <th style={thStyle}></th>
                </tr>
              </thead>
              <tbody>
                {ventas.length === 0 && !cargando && (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-dim)' }}>
                      No se encontraron ventas con esos filtros.
                    </td>
                  </tr>
                )}
                {ventas.map((v) => (
                  <React.Fragment key={v.id}>
                    <tr
                      style={{
                        borderBottom: '1px solid var(--color-border)',
                        opacity: v.anulada ? 0.5 : 1,
                        cursor: 'pointer',
                        background: expandedRows.has(v.id) ? 'var(--color-surface-2)' : 'transparent',
                      }}
                      onClick={() => toggleRow(v.id)}
                    >
                      <td data-label="Folio" style={tdStyle}><code style={{ fontSize: 12 }}>{v.folio}</code></td>
                      <td data-label="Fecha" style={tdStyle}>{formatFecha(v.fecha)}</td>
                      <td data-label="Cajero" style={tdStyle}>{v.usuario_nombre}</td>
                      <td data-label="Cliente" style={tdStyle}>{v.cliente_nombre || '—'}</td>
                      <td data-label="Total" style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmt(v.total)}</td>
                      <td data-label="Items" style={{ ...tdStyle, textAlign: 'center' }}>{v.num_productos}</td>
                      <td data-label="Estado" style={tdStyle}>
                        {v.anulada ? (
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 10,
                            background: 'rgba(216,56,77,0.12)', color: 'var(--color-primary)', fontWeight: 600,
                          }}>ANULADA</span>
                        ) : (
                          <span style={{
                            fontSize: 11, padding: '2px 8px', borderRadius: 10,
                            background: 'rgba(34,179,120,0.12)', color: '#22b378', fontWeight: 600,
                          }}>OK</span>
                        )}
                      </td>
                      <td style={tdStyle}>
                        <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); toggleRow(v.id); }}>
                          {expandedRows.has(v.id) ? 'Ocultar' : 'Detalles'}
                        </button>
                      </td>
                    </tr>
                    {expandedRows.has(v.id) && (
                      <tr style={{ background: 'var(--color-surface-2)' }}>
                        <td colSpan={8} style={{ padding: 0 }}>
                          <DetalleVentaInline
                            ventaId={v.id}
                            highlightTerm={articuloBuscado}
                            onAnular={(detalle) => { setVentaSeleccionada(detalle); setModalAnular(true); }}
                            onEditar={(detalle) => { setVentaSeleccionada(detalle); setModalEditar(true); }}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          </div>
        </>
      )}

      {tab === 'devoluciones' && (
        <div className="module-card" style={{ flex: 1, borderRadius: 16, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--color-surface)' }}>
          <table className="responsive-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, background: 'var(--color-surface)', zIndex: 1 }}>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={thStyle}>Folio</th>
                <th style={thStyle}>Venta</th>
                <th style={thStyle}>Fecha</th>
                <th style={thStyle}>Usuario</th>
                <th style={thStyle}>Autorizó</th>
                <th style={thStyle}>Motivo</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Monto</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Items</th>
              </tr>
            </thead>
            <tbody>
              {devoluciones.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'var(--color-text-dim)' }}>
                    No hay devoluciones registradas.
                  </td>
                </tr>
              )}
              {devoluciones.map((d: DevolucionResumen) => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td data-label="Folio" style={tdStyle}><code style={{ fontSize: 12 }}>{d.folio}</code></td>
                  <td data-label="Venta" style={tdStyle}><code style={{ fontSize: 12 }}>{d.venta_folio}</code></td>
                  <td data-label="Fecha" style={tdStyle}>{formatFecha(d.fecha)}</td>
                  <td data-label="Usuario" style={tdStyle}>{d.usuario_nombre}</td>
                  <td data-label="Autorizó" style={tdStyle}>{d.autorizado_por_nombre || '—'}</td>
                  <td data-label="Motivo" style={tdStyle}>{d.motivo}</td>
                  <td data-label="Monto" style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: 'var(--color-primary)' }}>
                    -{fmt(d.total_devuelto)}
                  </td>
                  <td data-label="Items" style={{ ...tdStyle, textAlign: 'center' }}>{d.num_items}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      )}

      {/* Modal anular */}
      {ventaSeleccionada && modalAnular && (
        <ModalAnularVenta
          venta={ventaSeleccionada}
          usuarioId={usuario!.id}
          esAdmin={usuario?.es_admin ?? false}
          onClose={() => setModalAnular(false)}
          onSuccess={() => {
            setModalAnular(false);
            setVentaSeleccionada(null);
            cargar();
          }}
        />
      )}

      {/* Modal editar venta */}
      {ventaSeleccionada && modalEditar && (
        <ModalEditarVenta
          venta={ventaSeleccionada}
          usuarioId={usuario!.id}
          esAdmin={usuario?.es_admin ?? false}
          onClose={() => setModalEditar(false)}
          onSuccess={() => {
            setModalEditar(false);
            setVentaSeleccionada(null);
            cargar();
          }}
        />
      )}
    </div>
  );
}

// ─── Componente In-line: Detalle de venta ───────────────────

function DetalleVentaInline({
  ventaId, highlightTerm, onAnular, onEditar,
}: {
  ventaId: number;
  highlightTerm?: string;
  onAnular: (v: VentaDetalleCompleto) => void;
  onEditar: (v: VentaDetalleCompleto) => void;
}) {
  const { obtenerDetalleCached } = useHistorialStore();
  const [venta, setVenta] = useState<VentaDetalleCompleto | null>(null);

  useEffect(() => {
    let mounted = true;
    obtenerDetalleCached(ventaId).then(v => {
      if (mounted) setVenta(v);
    }).catch(e => console.error(e));
    return () => { mounted = false; };
  }, [ventaId, obtenerDetalleCached]);

  if (!venta) return <div style={{ padding: 20, textAlign: 'center', color: 'var(--color-text-muted)' }}>Cargando detalles...</div>;

  const puedeEditar = !venta.anulada;
  const puedeAnular = !venta.anulada;

  // Función para verificar si un item coincide con el término de búsqueda
  const itemCoincide = (it: VentaDetalleItem): boolean => {
    if (!highlightTerm) return false;
    const term = highlightTerm.toLowerCase();
    return it.codigo.toLowerCase().includes(term) || it.nombre.toLowerCase().includes(term);
  };

  const handleReimprimir = async () => {
    try {
      const negocio = await invoke<ConfigNegocio>('obtener_config_negocio');
      imprimirTicket(negocio, {
        folio: venta.folio,
        fecha: venta.fecha,
        usuario: venta.usuario_nombre,
        cliente: venta.cliente_nombre,
        items: venta.items.map(i => ({
          nombre: i.nombre,
          codigo: i.codigo,
          cantidad: i.cantidad,
          precio_final: i.precio_final,
          subtotal: i.subtotal,
          descuento_porcentaje: i.descuento_porcentaje,
        })),
        subtotal: venta.subtotal,
        descuento: venta.descuento,
        redondeo: Math.max(0, +(venta.total - (venta.subtotal - venta.descuento)).toFixed(2)),
        total: venta.total,
        metodo_pago: venta.metodo_pago,
        reimpresion: true,
      });
    } catch (e) {
      alert('No se pudo imprimir el ticket');
    }
  };

  return (
    <div style={{ padding: '16px 24px', borderTop: '1px dashed var(--color-border)' }}>
      {venta.anulada && (
        <div style={{
          marginBottom: 12, padding: 10, borderRadius: 6,
          background: 'rgba(216,56,77,0.1)', border: '1px solid rgba(216,56,77,0.3)',
          fontSize: 12, color: 'var(--color-primary)',
        }}>
          <strong>Venta anulada</strong>
          {venta.anulada_por_nombre && ` por ${venta.anulada_por_nombre}`}
          {venta.motivo_anulacion && ` — Motivo: ${venta.motivo_anulacion}`}
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: 'var(--color-surface)', borderRadius: 6, overflow: 'hidden' }}>
        <thead style={{ background: 'var(--color-surface-2)' }}>
          <tr style={{ borderBottom: '1px solid var(--color-border)', textAlign: 'left' }}>
            <th style={{ padding: '8px 12px' }}>Código</th>
            <th style={{ padding: '8px 12px' }}>Producto</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Cant.</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Devuelto</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>P. unit.</th>
            <th style={{ padding: '8px 12px', textAlign: 'right' }}>Subtotal</th>
          </tr>
        </thead>
        <tbody>
          {venta.items.map(it => {
            const match = itemCoincide(it);
            return (
              <tr key={it.id} style={{
                borderBottom: '1px solid var(--color-border)',
                background: match ? 'rgba(245,158,11,0.15)' : 'transparent',
                borderLeft: match ? '3px solid var(--color-warning)' : '3px solid transparent',
              }}>
                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: match ? 'var(--color-warning)' : 'var(--color-text-muted)', fontWeight: match ? 700 : 400 }}>{it.codigo}</td>
                <td style={{ padding: '8px 12px', fontWeight: match ? 700 : 500 }}>{it.nombre}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{it.cantidad}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', color: it.cantidad_devuelta > 0 ? 'var(--color-primary)' : 'inherit' }}>
                  {it.cantidad_devuelta > 0 ? it.cantidad_devuelta : '—'}
                </td>
                <td style={{ padding: '8px 12px', textAlign: 'right' }}>{fmt(it.precio_final)}</td>
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600 }}>{fmt(it.subtotal)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginTop: 16 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-outline btn-sm" onClick={handleReimprimir} title="Reimprimir ticket">
            <Printer size={14} /> Reimprimir
          </button>
          {puedeEditar && (
            <button className="btn btn-sm" style={{ background: 'var(--color-warning)', color: '#fff', border: 'none' }} onClick={() => onEditar(venta)}>
              <Pencil size={14} /> Modificar venta
            </button>
          )}
          {puedeAnular && (
            <button className="btn btn-danger btn-sm" onClick={() => onAnular(venta)}>
              <Ban size={14} /> Cancelar venta
            </button>
          )}
        </div>

        <div style={{
          padding: '12px 16px', background: 'var(--color-surface)', border: '1px solid var(--color-border)',
          borderRadius: 6, fontSize: 13, minWidth: 200,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: 'var(--color-text-muted)' }}>Subtotal:</span>
            <span>{fmt(venta.subtotal)}</span>
          </div>
          {venta.descuento > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, color: 'var(--color-text-muted)' }}>
              <span>Descuento:</span>
              <span>-{fmt(venta.descuento)}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 800, fontSize: 16, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
            <span>Total:</span>
            <span>{fmt(venta.total)}</span>
          </div>
          {venta.total_devuelto > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-primary)', fontWeight: 600, marginTop: 4 }}>
              <span>Devuelto:</span>
              <span>-{fmt(venta.total_devuelto)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modal: Anular venta ──────────────────────────────────

function ModalAnularVenta({
  venta, usuarioId, esAdmin, onClose, onSuccess,
}: {
  venta: VentaDetalleCompleto;
  usuarioId: number;
  esAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [motivo, setMotivo] = useState('');
  const [pin, setPin] = useState('');
  const [procesando, setProcesando] = useState(false);

  const confirmar = async () => {
    if (!motivo.trim()) {
      alert('El motivo es obligatorio');
      return;
    }
    setProcesando(true);
    try {
      // Si no es admin, validar PIN
      if (!esAdmin) {
        const ok = await invoke<boolean>('verificar_pin_dueno', { pin });
        if (!ok) {
          alert('PIN del dueño incorrecto');
          setProcesando(false);
          return;
        }
      }
      await invoke('anular_venta', { ventaId: venta.id, usuarioId, motivo });
      onSuccess();
    } catch (e: any) {
      alert('Error al anular: ' + e);
      setProcesando(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose} maxWidth={440}>
      <div style={modalHeaderStyle}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-primary)' }}>
          <Ban size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Anular venta {venta.folio}
        </h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
      </div>

      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{
          padding: 10, borderRadius: 6, background: 'rgba(216,56,77,0.08)',
          border: '1px solid rgba(216,56,77,0.25)', fontSize: 12,
        }}>
          Se restaurará el stock de {venta.items.length} producto(s) y se marcará la venta como anulada.
          El total <strong>{fmt(venta.total)}</strong> se descontará del ingreso del día en el corte.
        </div>

        <div>
          <label style={labelStyle}>Motivo de la anulación *</label>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Ej: Cliente se arrepintió, error al cobrar, producto equivocado..."
            className="input"
            rows={3}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>

        {!esAdmin && (
          <div>
            <label style={labelStyle}>PIN del dueño *</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="input"
              style={{ width: 120, letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
              autoFocus
            />
          </div>
        )}
      </div>

      <div style={{
        padding: '12px 20px', borderTop: '1px solid var(--color-border)',
        display: 'flex', gap: 8, justifyContent: 'flex-end',
      }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={procesando}>Cancelar</button>
        <button
          className="btn btn-danger"
          onClick={confirmar}
          disabled={procesando || !motivo.trim() || (!esAdmin && pin.length !== 4)}
        >
          {procesando ? 'Anulando...' : 'Confirmar anulación'}
        </button>
      </div>
    </ModalWrapper>
  );
}

// ─── Modal: Editar venta ─────────────────────────────────

function ModalEditarVenta({
  venta, usuarioId, esAdmin, onClose, onSuccess,
}: {
  venta: VentaDetalleCompleto;
  usuarioId: number;
  esAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [precios, setPrecios] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    venta.items.forEach(it => { init[it.id] = it.precio_final.toFixed(2); });
    return init;
  });
  const [cantidades, setCantidades] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    venta.items.forEach(it => { init[it.id] = it.cantidad.toString(); });
    return init;
  });
  const [pin, setPin] = useState('');
  const [procesando, setProcesando] = useState(false);

  const nuevoTotal = venta.items.reduce((s, it) => {
    const precio = parseFloat(precios[it.id] || '0') || 0;
    const cantidad = parseFloat(cantidades[it.id] || '0') || 0;
    return s + precio * cantidad;
  }, 0);

  const hayCambios = venta.items.some(it => {
    const precioNuevo = parseFloat(precios[it.id] || '0');
    const cantidadNueva = parseFloat(cantidades[it.id] || '0');
    return Math.abs(precioNuevo - it.precio_final) > 0.001 || Math.abs(cantidadNueva - it.cantidad) > 0.001;
  });

  const confirmar = async () => {
    setProcesando(true);
    try {
      if (!esAdmin) {
        const ok = await invoke<boolean>('verificar_pin_dueno', { pin });
        if (!ok) {
          alert('PIN del dueño incorrecto');
          setProcesando(false);
          return;
        }
      }
      const items = venta.items.map(it => ({
        venta_detalle_id: it.id,
        precio_final: parseFloat(precios[it.id] || '0'),
        cantidad: parseFloat(cantidades[it.id] || '0'),
      }));
      await invoke('modificar_venta', {
        ventaId: venta.id,
        usuarioId,
        items,
      });
      // Invalidar cache del historial
      useHistorialStore.getState().invalidarCache(venta.id);
      alert('Venta modificada exitosamente');
      onSuccess();
    } catch (e: any) {
      alert('Error al modificar: ' + e);
      setProcesando(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose} maxWidth={680}>
      <div style={modalHeaderStyle}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'var(--color-warning)' }}>
          <Pencil size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Modificar venta — {venta.folio}
        </h3>
        <button className="btn btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
      </div>

      <div style={{ padding: '12px 20px 0' }}>
        <div style={{
          padding: 10, borderRadius: 6, background: 'rgba(245,158,11,0.08)',
          border: '1px solid rgba(245,158,11,0.25)', fontSize: 12, marginBottom: 12,
        }}>
          Modifica el precio o la cantidad de cada producto. El total de la venta se recalculará automáticamente.
        </div>

        <div style={{ maxHeight: 350, overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ padding: '6px 4px', textAlign: 'left' }}>Producto</th>
                <th style={{ padding: '6px 4px', textAlign: 'center' }}>Cantidad</th>
                <th style={{ padding: '6px 4px', textAlign: 'center' }}>Precio unit.</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {venta.items.map(it => {
                const precio = parseFloat(precios[it.id] || '0') || 0;
                const cantidad = parseFloat(cantidades[it.id] || '0') || 0;
                const sub = precio * cantidad;
                const precioModificado = Math.abs(precio - it.precio_final) > 0.001;
                const cantModificada = Math.abs(cantidad - it.cantidad) > 0.001;
                return (
                  <tr key={it.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td style={{ padding: '6px 4px' }}>
                      <div style={{ fontWeight: 600 }}>{it.nombre}</div>
                      <div style={{ fontSize: 10, color: 'var(--color-text-muted)', fontFamily: 'monospace' }}>{it.codigo}</div>
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0.001}
                        step="any"
                        value={cantidades[it.id] || ''}
                        onChange={(e) => setCantidades(prev => ({ ...prev, [it.id]: e.target.value }))}
                        className="input input-sm"
                        style={{
                          width: 80, textAlign: 'center',
                          borderColor: cantModificada ? 'var(--color-warning)' : undefined,
                          fontWeight: cantModificada ? 700 : 400,
                        }}
                      />
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={precios[it.id] || ''}
                        onChange={(e) => setPrecios(prev => ({ ...prev, [it.id]: e.target.value }))}
                        className="input input-sm"
                        style={{
                          width: 90, textAlign: 'center',
                          borderColor: precioModificado ? 'var(--color-warning)' : undefined,
                          fontWeight: precioModificado ? 700 : 400,
                        }}
                      />
                    </td>
                    <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 600 }}>
                      {fmt(sub)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!esAdmin && (
          <div>
            <label style={labelStyle}>PIN del dueño *</label>
            <input
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="••••"
              className="input"
              style={{ width: 120, letterSpacing: 4, textAlign: 'center', fontSize: 18 }}
            />
          </div>
        )}

        <div style={{
          padding: 10, borderRadius: 6, background: 'var(--color-surface-2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Total original: {fmt(venta.total)}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: nuevoTotal !== venta.total ? 'var(--color-warning)' : 'var(--color-text)' }}>
              Nuevo total: {fmt(Math.ceil(nuevoTotal))}
            </div>
          </div>
          {nuevoTotal !== venta.total && (
            <span style={{
              fontSize: 14, fontWeight: 700,
              color: nuevoTotal < venta.total ? 'var(--color-success)' : 'var(--color-danger)',
            }}>
              {nuevoTotal < venta.total ? '-' : '+'}{fmt(Math.abs(Math.ceil(nuevoTotal) - venta.total))}
            </span>
          )}
        </div>
      </div>

      <div style={{
        padding: '12px 20px', borderTop: '1px solid var(--color-border)',
        display: 'flex', gap: 8, justifyContent: 'flex-end',
      }}>
        <button className="btn btn-ghost" onClick={onClose} disabled={procesando}>Cancelar</button>
        <button
          className="btn"
          style={{ background: 'var(--color-warning)', color: '#fff' }}
          onClick={confirmar}
          disabled={procesando || !hayCambios || (!esAdmin && pin.length !== 4)}
        >
          <CheckCircle2 size={14} />
          {procesando ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </ModalWrapper>
  );
}

// ─── Utilidades UI ────────────────────────────────────────

function ModalWrapper({
  children, onClose, maxWidth = 600,
}: {
  children: React.ReactNode;
  onClose: () => void;
  maxWidth?: number;
}) {
  return (
    <div
      onClick={onClose}
      className="pos-modal-overlay"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="pos-modal-content pos-modal-fluid"
        style={{
          background: 'var(--color-surface)', borderRadius: 10,
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          width: '100%', maxWidth, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {children}
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', textAlign: 'left', fontSize: 11,
  fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase',
};
const tdStyle: React.CSSProperties = { padding: '8px 10px' };
const modalHeaderStyle: React.CSSProperties = {
  padding: '14px 20px', borderBottom: '1px solid var(--color-border)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
};
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 11, fontWeight: 600,
  color: 'var(--color-text-muted)', marginBottom: 4,
};
