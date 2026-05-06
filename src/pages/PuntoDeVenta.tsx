// pages/PuntoDeVenta.tsx — Pantalla principal de ventas (touch-first)
// Carrito + escaneo + búsqueda + cobro

import { useState, useEffect, useRef } from 'react';
import { useProductStore } from '../store/productStore';
import { useVentaStore, useVentaActiva, type MetodoPago } from '../store/ventaStore';
import { useAuthStore } from '../store/authStore';
import { Search, X, Minus, Plus, Trash2, CreditCard, Banknote, ArrowRightLeft, CheckCircle2, Percent, Lock, Printer, ShoppingCart } from 'lucide-react';
import { invoke } from '../lib/invokeCompat';
import { imprimirTicket, type ConfigNegocio, type TicketData } from '../utils/ticket';

export default function PuntoDeVenta() {
  const { productos, cargarTodo, busqueda, setBusqueda, productosFiltrados } = useProductStore();
  const {
    agregarProducto, quitarProducto, cambiarCantidad,
    total, numItems,
    setMetodoPago, setMontoRecibido,
    procesarVenta, ventaExitosa, cerrarVentaExitosa, procesando,
    tabs, cerrarTab,
  } = useVentaStore();
  const activa = useVentaActiva();
  const { items, metodoPago, montoRecibido } = activa;
  const { usuario } = useAuthStore();

  const [showCobro, setShowCobro] = useState(false);
  const [showBusqueda, setShowBusqueda] = useState(false);
  const [showDescuento, setShowDescuento] = useState<number | null>(null);
  const [descPorcentaje, setDescPorcentaje] = useState('');
  const [showPinAuth, setShowPinAuth] = useState(false);
  const [pinAuth, setPinAuth] = useState('');
  const [pinError, setPinError] = useState(false);
  const [confirmCerrarTab, setConfirmCerrarTab] = useState<string | null>(null);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [maxDescVendedor, setMaxDescVendedor] = useState(15);
  const [configNegocio, setConfigNegocio] = useState<ConfigNegocio | null>(null);
  const [ultimoTicket, setUltimoTicket] = useState<TicketData | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);
  const [localSearch, setLocalSearch] = useState('');

  // Cargar datos al montar
  useEffect(() => {
    cargarTodo();
    // Cargar config de descuentos
    invoke<{ descuento_max_vendedor_pct: number }>('obtener_config_descuentos')
      .then(c => setMaxDescVendedor(c.descuento_max_vendedor_pct))
      .catch(() => {});
    invoke<ConfigNegocio>('obtener_config_negocio')
      .then(c => setConfigNegocio(c))
      .catch(() => {});
  }, []);

  // Focus automático en el campo de escaneo
  useEffect(() => {
    if (!showCobro && !showBusqueda && !ventaExitosa && scanRef.current) {
      // Limpiar el campo y el estado de búsqueda para evitar que se reabra el dropdown
      scanRef.current.value = '';
      setLocalSearch('');
      setBusqueda('');
      scanRef.current.focus();
    }
  }, [showCobro, showBusqueda, ventaExitosa, items]);




  // Atajos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (ventaExitosa) {
        if (e.key === 'Enter' || e.key === 'Escape') cerrarVentaExitosa();
        return;
      }
      // F10 = cobrar
      if (e.key === 'F10' && items.length > 0) { e.preventDefault(); setShowCobro(true); setMontoRecibido(0); }
      // Escape = cerrar overlay
      if (e.key === 'Escape') { setShowCobro(false); setShowBusqueda(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, ventaExitosa]);

  const handleCobrar = async () => {
    if (!usuario) return;
    const montoFinal = metodoPago === 'efectivo' ? montoRecibido : total();
    if (metodoPago === 'efectivo' && montoFinal < total()) return;
    if (metodoPago !== 'efectivo') setMontoRecibido(total());

    // Snapshot para ticket antes de que se limpie el carrito
    const itemsSnapshot = items.map(i => ({
      nombre: i.producto.nombre,
      codigo: i.producto.codigo,
      cantidad: i.cantidad,
      precio_final: i.precioFinal,
      subtotal: i.subtotal,
      descuento_porcentaje: i.descuentoPorcentaje,
    }));
    const { subtotal, descuentoTotal, redondeo } = useVentaStore.getState();
    const subtotalSnap = subtotal();
    const descuentoSnap = descuentoTotal();
    const redondeoSnap = redondeo();
    const totalSnap = total();
    const clienteSnap = null;
    const metodoSnap = metodoPago;
    const recibidoSnap = metodoPago === 'efectivo' ? montoRecibido : totalSnap;

    try {
      const venta = await procesarVenta(usuario.id);
      setShowCobro(false);
      setMobileCartOpen(false);

      const ticket: TicketData = {
        folio: venta.folio,
        fecha: venta.fecha,
        usuario: usuario.nombre_completo,
        cliente: clienteSnap,
        items: itemsSnapshot,
        subtotal: subtotalSnap,
        descuento: descuentoSnap,
        redondeo: redondeoSnap,
        total: venta.total,
        metodo_pago: metodoSnap,
        monto_recibido: recibidoSnap,
        cambio: venta.cambio,
      };
      setUltimoTicket(ticket);
      // Auto-impresión deshabilitada por petición del usuario
    } catch (err: any) {
      alert(err.message);
    }
  };


  const reimprimirUltimo = () => {
    if (ultimoTicket && configNegocio) {
      imprimirTicket(configNegocio, { ...ultimoTicket, reimpresion: true });
    }
  };

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const esAdmin = usuario?.es_admin ?? false;

  // Descuento: aplicar
  const handleAplicarDescuento = async () => {
    if (showDescuento === null) return;
    const pct = parseFloat(descPorcentaje) || 0;
    if (pct <= 0 || pct > 100) return;

    // Si excede el límite del vendedor y no es admin, pedir PIN
    if (!esAdmin && pct > maxDescVendedor && !showPinAuth) {
      setShowPinAuth(true);
      setPinAuth('');
      setPinError(false);
      return;
    }

    const { aplicarDescuento } = useVentaStore.getState();
    aplicarDescuento(showDescuento, pct, showPinAuth ? usuario?.id ?? null : null);
    setShowDescuento(null);
    setDescPorcentaje('');
    setShowPinAuth(false);
    setPinAuth('');
  };

  const handlePinAuth = async () => {
    if (pinAuth.length !== 4) return;
    try {
      const ok = await invoke<boolean>('verificar_pin_dueno', { pin: pinAuth });
      if (ok) {
        // PIN válido — aplicar descuento
        const pct = parseFloat(descPorcentaje) || 0;
        if (showDescuento !== null) {
          const { aplicarDescuento } = useVentaStore.getState();
          aplicarDescuento(showDescuento, pct, usuario?.id ?? null);
        }
        setShowDescuento(null);
        setDescPorcentaje('');
        setShowPinAuth(false);
        setPinAuth('');
      } else {
        setPinError(true);
        setPinAuth('');
        setTimeout(() => setPinError(false), 600);
      }
    } catch {
      setPinError(true);
      setPinAuth('');
      setTimeout(() => setPinError(false), 600);
    }
  };

  // ──── Render ────

  // Overlay de venta exitosa
  if (ventaExitosa) {
    return (
      <div className="animate-fade-in" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', flexDirection: 'column', gap: 20, padding: 20
      }}>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <CheckCircle2 size={64} style={{ color: 'var(--color-success)', marginBottom: 12 }} />
          <h2 style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text)' }}>¡Venta Completada!</h2>
          <p className="mono" style={{ fontSize: 18, color: 'var(--color-text-muted)', marginTop: 4 }}>
            Folio: {ventaExitosa.folio}
          </p>
        </div>
        <div className="card pos-modal-content pos-modal-fluid" style={{ padding: 24, width: '100%', maxWidth: 400, textAlign: 'center' }}>
          {ventaExitosa.cambio > 0 ? (
            <>
              <p style={{ fontSize: 18, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Cambio a entregar
              </p>
              <div className="price-display" style={{ color: 'var(--color-danger)', fontSize: 56, marginTop: 8, lineHeight: 1 }}>
                {fmt(ventaExitosa.cambio)}
              </div>
            </>
          ) : (
            <div className="price-display" style={{ color: 'var(--color-success)', fontSize: 40, lineHeight: 1.2 }}>
              Pago Exacto
            </div>
          )}
        </div>
        <div className="pos-page-header" style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          {ultimoTicket && (
            <button className="btn btn-ghost btn-lg" onClick={reimprimirUltimo} title="Imprimir ticket de venta">
              <Printer size={18} /> Imprimir Ticket
            </button>
          )}
          <button className="btn btn-primary btn-lg" onClick={cerrarVentaExitosa}>
            Nueva Venta (Enter)
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      {/* ─── Header simple (sin pestañas ni presupuestos) ─── */}

    <div className="pos-pdv-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gridTemplateRows: 'minmax(0, 1fr)', flex: 1, minHeight: 0, gap: 0 }}>
      {/* ─── Panel Izquierdo: Cuadrícula de productos táctil ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--color-border)', minHeight: 0, minWidth: 0 }}>
        {/* Barra de búsqueda rápida */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--color-border)', display: 'flex', gap: 8 }}>
          <div style={{ flex: 1, position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
            <input
              ref={scanRef}
              className="input pos-input-icon"
              placeholder="Buscar fruta..."
              style={{ paddingLeft: 36, width: '100%', fontSize: 16 }}
              value={localSearch || ''}
              onChange={(e) => {
                setLocalSearch(e.target.value);
                setBusqueda(e.target.value);
              }}
            />
          </div>
          {localSearch && (
            <button className="btn btn-ghost" onClick={() => { setLocalSearch(''); setBusqueda(''); }}>
              <X size={16} />
            </button>
          )}
        </div>

        {/* Cuadrícula de productos */}
        <div style={{
          flex: 1, overflow: 'auto', padding: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10, alignContent: 'start',
        }}>
          {(busqueda ? productosFiltrados() : productos.filter(p => p.activo)).map(p => (
            <button
              key={p.id}
              onClick={() => {
                agregarProducto(p);
                setLocalSearch('');
                setBusqueda('');
              }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                padding: '14px 8px', borderRadius: 14,
                border: '2px solid var(--color-border)',
                background: (p as any).color_boton ? `${(p as any).color_boton}18` : 'var(--color-surface)',
                cursor: 'pointer', transition: 'all 0.1s', minHeight: 120,
                gap: 6, position: 'relative',
              }}
              onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.95)'; }}
              onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            >
              <span style={{ fontSize: 36 }}>{(p as any).emoji || '🍎'}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text)', textAlign: 'center', lineHeight: 1.2 }}>
                {p.nombre}
              </span>
              <span className="mono" style={{ fontSize: 15, fontWeight: 800, color: 'var(--color-primary)' }}>
                ${p.precio_venta.toFixed(2)}
              </span>
              <span style={{ fontSize: 10, color: 'var(--color-text-dim)' }}>
                /{(p as any).unidad || 'kg'}
              </span>
              {p.stock_actual <= 0 && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  fontSize: 9, padding: '1px 6px', borderRadius: 8,
                  background: 'var(--color-danger-soft)', color: 'var(--color-danger)', fontWeight: 700,
                }}>Sin stock</span>
              )}
            </button>
          ))}
          {(busqueda ? productosFiltrados() : productos.filter(p => p.activo)).length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 40, color: 'var(--color-text-dim)' }}>
              {busqueda ? `No se encontró "${busqueda}"` : 'No hay productos activos'}
            </div>
          )}
        </div>
      </div>

      {/* ─── Panel Derecho: Carrito + Total + Cobrar ─── */}
      <div className={`pos-pdv-cart${mobileCartOpen ? ' open' : ''}`} style={{ display: 'flex', flexDirection: 'column', background: 'var(--color-surface)', minHeight: 0, minWidth: 0 }}>
        {/* Header carrito */}
        <div style={{
          padding: '10px 16px', borderBottom: '1px solid var(--color-border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14 }}>
            🛒 Carrito ({numItems()})
          </span>
          {items.length > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)', fontSize: 11 }}
              onClick={() => items.forEach(() => quitarProducto(0))}>
              Vaciar
            </button>
          )}
        </div>

        {/* Items del carrito */}
        <div style={{ flex: 1, overflow: 'auto', padding: '4px 0' }}>
          {items.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-dim)', flexDirection: 'column', gap: 8 }}>
              <ShoppingCart size={32} strokeWidth={1.5} />
              <p style={{ fontSize: 13 }}>Toca un producto para agregarlo</p>
            </div>
          ) : (
            items.map((item, i) => (
              <div key={`${item.producto.id}-${i}`} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderBottom: '1px solid var(--color-border)',
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {(item.producto as any).emoji || '🍎'} {item.producto.nombre}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                    {fmt(item.precioFinal)} × {item.cantidad} {(item.producto as any).unidad || 'kg'}
                    {item.descuentoPorcentaje > 0 && <span style={{ color: 'var(--color-accent)' }}> (-{item.descuentoPorcentaje}%)</span>}
                  </div>
                </div>
                {/* Controles de cantidad */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', minHeight: 32 }}
                    onClick={() => cambiarCantidad(i, item.cantidad - 1)}>
                    <Minus size={14} />
                  </button>
                  <span className="mono" style={{ fontWeight: 700, minWidth: 28, textAlign: 'center', fontSize: 14 }}>
                    {item.cantidad}
                  </span>
                  <button className="btn btn-ghost btn-sm" style={{ padding: '4px 6px', minHeight: 32 }}
                    onClick={() => cambiarCantidad(i, item.cantidad + 1)}>
                    <Plus size={14} />
                  </button>
                </div>
                {/* Subtotal + quitar */}
                <div style={{ textAlign: 'right', minWidth: 65 }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 14 }}>{fmt(item.subtotal)}</div>
                </div>
                <button style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 4, color: 'var(--color-danger)' }}
                  onClick={() => quitarProducto(i)}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Método de pago */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['efectivo', 'tarjeta', 'transferencia'] as MetodoPago[]).map((m) => (
              <button key={m} className={`btn ${metodoPago === m ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                style={{ flex: 1, justifyContent: 'center', minHeight: 40 }}
                onClick={() => setMetodoPago(m)}>
                {m === 'efectivo' && <Banknote size={14} />}
                {m === 'tarjeta' && <CreditCard size={14} />}
                {m === 'transferencia' && <ArrowRightLeft size={14} />}
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Monto recibido (solo efectivo) */}
        {metodoPago === 'efectivo' && items.length > 0 && (
          <div style={{ padding: '8px 16px', flexShrink: 0 }}>
            <input className="input input-lg mono" type="number" step="0.01" placeholder="Monto recibido"
              value={montoRecibido || ''} onChange={(e) => setMontoRecibido(parseFloat(e.target.value) || 0)}
              onKeyDown={(e) => { if (e.key === 'Enter' && montoRecibido >= total()) handleCobrar(); }}
              style={{ textAlign: 'center', fontSize: 22, width: '100%' }} />
            {montoRecibido > 0 && montoRecibido >= total() && (
              <div style={{ textAlign: 'center', color: 'var(--color-success)', fontWeight: 700, fontSize: 16, marginTop: 4 }}>
                Cambio: {fmt(montoRecibido - total())}
              </div>
            )}
          </div>
        )}

        {/* Total + Cobrar */}
        <div style={{ padding: 16, flexShrink: 0, borderTop: '1px solid var(--color-border)' }}>
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>TOTAL</span>
            <div className="price-display" style={{ fontSize: 42 }}>{fmt(total())}</div>
          </div>
          <button className="btn btn-success btn-xl" style={{ width: '100%', justifyContent: 'center', minHeight: 56 }}
            disabled={items.length === 0 || procesando || (metodoPago === 'efectivo' && montoRecibido < total())}
            onClick={handleCobrar}>
            {procesando ? 'Procesando...' : `💰 Cobrar ${fmt(total())}`}
          </button>
        </div>
      </div>

      {/* ─── Modal de Descuento ─── */}
      {showDescuento !== null && (
        <div className="pos-modal-overlay" style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => { setShowDescuento(null); setShowPinAuth(false); }}>
          <div className="card pos-modal-content pos-modal-fluid animate-fade-in" style={{ width: 340, maxWidth: '100%', padding: 24 }}
            onClick={e => e.stopPropagation()}>
            {!showPinAuth ? (
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
                  <Percent size={16} style={{ marginRight: 6 }} />
                  Aplicar Descuento
                </h3>
                <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 16 }}>
                  {items[showDescuento]?.producto.nombre}
                  {!esAdmin && <span> · Máx sin autorización: {maxDescVendedor}%</span>}
                </p>
                <div className="pos-filter-row" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    className="input mono"
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={descPorcentaje}
                    onChange={e => setDescPorcentaje(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAplicarDescuento(); }}
                    autoFocus
                    style={{ flex: 1, textAlign: 'center', fontSize: 24 }}
                  />
                  <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--color-text-muted)' }}>%</span>
                </div>
                {/* Quick buttons */}
                <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                  {[5, 10, 15, 20, 25].map(p => (
                    <button key={p} className="btn btn-ghost btn-sm" style={{ flex: 1 }}
                      onClick={() => setDescPorcentaje(String(p))}>
                      {p}%
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost" onClick={() => {
                    // Quitar descuento
                    const { aplicarDescuento } = useVentaStore.getState();
                    aplicarDescuento(showDescuento, 0, null);
                    setShowDescuento(null);
                  }}>Quitar</button>
                  <button className="btn btn-primary" onClick={handleAplicarDescuento}
                    disabled={!descPorcentaje || Number(descPorcentaje) <= 0}>
                    Aplicar
                  </button>
                </div>
              </>
            ) : (
              /* PIN del dueño para autorizar descuento alto */
              <>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Lock size={16} style={{ color: 'var(--color-warning)' }} />
                  Autorización Requerida
                </h3>
                <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 16 }}>
                  Descuento de {descPorcentaje}% excede el límite ({maxDescVendedor}%).
                  Ingresa el PIN del dueño.
                </p>
                <input
                  className={`input mono ${pinError ? 'animate-shake' : ''}`}
                  type="password"
                  maxLength={4}
                  inputMode="numeric"
                  value={pinAuth}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '');
                    setPinAuth(v);
                    if (v.length === 4) {
                      setTimeout(() => handlePinAuth(), 50);
                    }
                  }}
                  autoFocus
                  placeholder="••••"
                  style={{ textAlign: 'center', fontSize: 28, letterSpacing: 8, width: '100%' }}
                />
                {pinError && (
                  <p style={{ color: 'var(--color-danger)', fontSize: 12, textAlign: 'center', marginTop: 6 }}>
                    PIN incorrecto
                  </p>
                )}
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, width: '100%' }}
                  onClick={() => { setShowPinAuth(false); setPinAuth(''); }}>
                  Cancelar
                </button>
              </>
            )}
          </div>
        </div>
      )}



      {/* ─── Modal Confirmar Cerrar Pestaña ─── */}
      {confirmCerrarTab && (() => {
        const t = tabs.find(x => x.id === confirmCerrarTab);
        if (!t) return null;
        const count = t.items.reduce((a, i) => a + i.cantidad, 0);
        return (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
          }} onClick={() => setConfirmCerrarTab(null)}>
            <div className="card animate-fade-in" style={{ width: 360, padding: 24 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
                ¿Cerrar "{t.nombre}"?
              </h3>
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
                Se perderán <strong>{count}</strong> artículo{count !== 1 ? 's' : ''} del carrito.
              </p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setConfirmCerrarTab(null)} autoFocus>
                  Cancelar
                </button>
                <button className="btn btn-danger" onClick={() => {
                  cerrarTab(confirmCerrarTab);
                  setConfirmCerrarTab(null);
                }}>
                  Cerrar pestaña
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
    </div>
  );
}
