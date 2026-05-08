// pages/PuntoDeVenta.tsx — Vista principal de ventas (Touch-first, grid directo)

import { useState, useEffect } from 'react';
import { useProductStore, type Producto } from '../store/productStore';
import { useVentaStore, useVentaActiva } from '../store/ventaStore';
import { useAuthStore } from '../store/authStore';
import { ShoppingCart, Minus, Plus, Trash2, CheckCircle2, Printer } from 'lucide-react';
import { invoke } from '../lib/invokeCompat';
import { imprimirTicket, type ConfigNegocio, type TicketData } from '../utils/ticket';
import { NumpadModal } from '../components/Numpad';

export default function PuntoDeVenta() {
  const { productos, cargarTodo } = useProductStore();
  const {
    agregarProducto, quitarProducto, cambiarCantidad,
    total, subtotal, descuentoTotal, redondeo, numItems,
    setMontoRecibido,
    procesarVenta, ventaExitosa, cerrarVentaExitosa, procesando,
    tabs, tabActivaId, nuevaTab, cerrarTab, activarTab,
    limpiarCarrito, toggleModoMayoreo,
  } = useVentaStore();
  const activa = useVentaActiva();
  const { items, montoRecibido, modoMayoreo } = activa;
  const { usuario } = useAuthStore();

  const [showCobro, setShowCobro] = useState(false);
  const [configNegocio, setConfigNegocio] = useState<ConfigNegocio | null>(null);
  const [ultimoTicket, setUltimoTicket] = useState<TicketData | null>(null);
  const [cantidadModal, setCantidadModal] = useState<Producto | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);

  useEffect(() => {
    cargarTodo();
    invoke<ConfigNegocio>('obtener_config_negocio').then(setConfigNegocio).catch(() => {});
  }, []);

  // Atajos de teclado
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (ventaExitosa) {
        if (e.key === 'Enter' || e.key === 'Escape') cerrarVentaExitosa();
        return;
      }
      if (e.key === 'F10' && items.length > 0) { e.preventDefault(); setShowCobro(true); setMontoRecibido(0); }
      if (e.key === 'Escape') setShowCobro(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [items, ventaExitosa]);

  // Add product with visual feedback
  const handleAddProduct = (p: Producto) => {
    const unidad = (p as any).unidad || 'kg';
    if (unidad === 'kg') {
      // Open numpad for weight
      setCantidadModal(p);
    } else {
      // Add 1 unit directly
      agregarProducto(p);
      setFlashId(p.id);
      setTimeout(() => setFlashId(null), 300);
    }
  };

  const handleAddWithQuantity = (cantidad: number) => {
    if (!cantidadModal) return;
    // Add product with specific quantity
    agregarProducto(cantidadModal);
    // Update quantity to match
    setTimeout(() => {
      const store = useVentaStore.getState();
      const newItems = store.tabs.find(t => t.id === activa.id)?.items;
      if (newItems && newItems.length > 0) {
        const lastIdx = newItems.length - 1;
        cambiarCantidad(lastIdx, cantidad);
      }
    }, 50);
    setCantidadModal(null);
    setFlashId(cantidadModal.id);
    setTimeout(() => setFlashId(null), 300);
  };

  const handleCobrar = async () => {
    if (!usuario) return;
    if (montoRecibido < total()) return;

    const itemsSnapshot = items.map(i => ({
      nombre: i.producto.nombre, codigo: i.producto.codigo,
      cantidad: i.cantidad, precio_final: i.precioFinal,
      subtotal: i.subtotal, descuento_porcentaje: i.descuentoPorcentaje,
    }));
    const subtotalSnap = subtotal();
    const descuentoSnap = descuentoTotal();
    const redondeoSnap = redondeo();
    const recibidoSnap = montoRecibido;

    try {
      const venta = await procesarVenta(usuario.id);
      setShowCobro(false);
      const ticket: TicketData = {
        folio: venta.folio, fecha: venta.fecha,
        usuario: usuario.nombre_completo, cliente: null,
        items: itemsSnapshot, subtotal: subtotalSnap,
        descuento: descuentoSnap, redondeo: redondeoSnap,
        total: venta.total, metodo_pago: 'efectivo',
        monto_recibido: recibidoSnap, cambio: venta.cambio,
      };
      setUltimoTicket(ticket);
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

  // Filter products
  const productosMostrados = productos.filter(p => p.activo);

  // ──── Venta Exitosa ────
  if (ventaExitosa) {
    return (
      <div className="animate-fade-in" style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', flexDirection: 'column', gap: 24, padding: 24,
      }}>
        <CheckCircle2 size={80} style={{ color: 'var(--color-success)' }} />
        <h2 style={{ fontSize: 32, fontWeight: 800 }}>¡Venta Completada!</h2>
        <p className="mono" style={{ fontSize: 18, color: 'var(--color-text-muted)' }}>
          Folio: {ventaExitosa.folio}
        </p>
        <div className="card animate-scale-in" style={{ padding: 32, width: 420, textAlign: 'center' }}>
          {ventaExitosa.cambio > 0 ? (
            <>
              <p style={{ fontSize: 16, color: 'var(--color-text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
                Cambio a entregar
              </p>
              <div className="mono" style={{ fontSize: 64, fontWeight: 800, color: 'var(--color-accent)', marginTop: 8 }}>
                {fmt(ventaExitosa.cambio)}
              </div>
            </>
          ) : (
            <div className="mono" style={{ fontSize: 42, fontWeight: 800, color: 'var(--color-success)' }}>
              Pago Exacto ✓
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {ultimoTicket && (
            <button className="btn btn-ghost btn-lg" onClick={reimprimirUltimo}>
              <Printer size={20} /> Imprimir
            </button>
          )}
          <button className="btn btn-primary btn-xl" onClick={cerrarVentaExitosa}>
            Nueva Venta
          </button>
        </div>
      </div>
    );
  }

  // ──── Vista principal ────
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 12, padding: 12, background: 'var(--color-bg)' }}>

      {/* ═══ MÓDULO IZQUIERDO: Grid de productos ═══ */}
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
        background: 'var(--color-surface)', borderRadius: 16,
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
        overflow: 'hidden',
      }}>
        {/* Product grid */}
        <div style={{
          flex: 1, overflow: 'auto', padding: 16,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 12, alignContent: 'start',
        }}>
          {productosMostrados.map(p => (
            <button
              key={p.id}
              className={`product-tile ${flashId === p.id ? 'animate-add-flash' : ''}`}
              onClick={() => handleAddProduct(p)}
              style={{
                background: (p as any).color_boton ? `${(p as any).color_boton}12` : 'var(--color-surface)',
                borderColor: (p as any).color_boton ? `${(p as any).color_boton}30` : 'var(--color-border)',
                borderRadius: 14, minHeight: 130,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <span className="product-tile-emoji" style={{ fontSize: 36 }}>{(p as any).emoji || '🍎'}</span>
              <span className="product-tile-name" style={{ fontSize: 13, fontWeight: 700 }}>{p.nombre}</span>
              <span className="product-tile-price" style={{ fontSize: 16, fontWeight: 800 }}>
                ${p.precio_venta.toFixed(0)}
                <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--color-text-dim)' }}>/{(p as any).unidad || 'kg'}</span>
              </span>
              {(p as any).precio_mayoreo > 0 && (
                <span style={{ fontSize: 10, color: 'var(--color-accent)', fontWeight: 700 }}>
                  May: ${((p as any).precio_mayoreo).toFixed(0)}/{(p as any).unidad || 'kg'}
                </span>
              )}
              {p.stock_actual <= 0 && (
                <span style={{
                  position: 'absolute', top: 6, right: 6,
                  fontSize: 9, padding: '2px 6px', borderRadius: 8,
                  background: 'var(--color-danger)', color: '#fff', fontWeight: 700,
                }}>Agotado</span>
              )}
            </button>
          ))}
          {productosMostrados.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: 60, color: 'var(--color-text-dim)' }}>
              No hay productos activos
            </div>
          )}
        </div>
      </div>

      {/* ═══ MÓDULO DERECHO: Carrito ═══ */}
      <div style={{
        width: 380, display: 'flex', flexDirection: 'row',
        minHeight: 0, flexShrink: 0, gap: 8,
      }}>
        {/* Cart module */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0,
          background: 'var(--color-surface)', borderRadius: 16,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          overflow: 'hidden',
        }}>
          {/* Cart header */}
          <div style={{
            padding: '12px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
            borderBottom: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}>
            <span style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 6 }}>
              🛒 Carrito
              <span className="mono" style={{
                color: 'var(--color-primary)', fontSize: 12,
                background: 'var(--color-primary-soft)', padding: '2px 8px', borderRadius: 10,
              }}>
                {numItems()}
              </span>
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => toggleModoMayoreo()}
                style={{
                  padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 11, fontWeight: 700, transition: 'all 0.15s',
                  background: modoMayoreo ? 'var(--color-accent)' : 'var(--color-surface-2)',
                  color: modoMayoreo ? '#fff' : 'var(--color-text-muted)',
                }}>
                {modoMayoreo ? '📦 Mayoreo' : '🏷️ Menudeo'}
              </button>
              {items.length > 0 && (
                <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-danger)', fontSize: 11 }}
                  onClick={() => limpiarCarrito()}>
                  Vaciar
                </button>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            {items.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '100%', color: 'var(--color-text-dim)', flexDirection: 'column', gap: 8,
              }}>
                <ShoppingCart size={36} strokeWidth={1.2} />
                <p style={{ fontSize: 13 }}>Toca un producto para agregar</p>
              </div>
            ) : (
              items.map((item, i) => (
                <div key={`${item.producto.id}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderBottom: '1px solid var(--color-border)',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {(item.producto as any).emoji || '🍎'} {item.producto.nombre}
                    </div>
                    <div className="mono" style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                      {fmt(item.precioFinal)} × {item.cantidad} {(item.producto as any).unidad || 'kg'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <button className="btn btn-ghost" style={{ padding: 4, minHeight: 36, minWidth: 36 }}
                      onClick={() => cambiarCantidad(i, item.cantidad - 1)}>
                      <Minus size={16} />
                    </button>
                    <span className="mono" style={{ fontWeight: 800, minWidth: 30, textAlign: 'center', fontSize: 15 }}>
                      {item.cantidad}
                    </span>
                    <button className="btn btn-ghost" style={{ padding: 4, minHeight: 36, minWidth: 36 }}
                      onClick={() => cambiarCantidad(i, item.cantidad + 1)}>
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="mono" style={{ fontWeight: 800, fontSize: 15, minWidth: 65, textAlign: 'right' }}>
                    {fmt(item.subtotal)}
                  </div>
                  <button style={{
                    border: 'none', background: 'transparent', cursor: 'pointer',
                    padding: 6, color: 'var(--color-danger)',
                  }} onClick={() => quitarProducto(i)}>
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Total + Cobrar module */}
          <div style={{
            padding: '14px 14px 16px', flexShrink: 0,
            borderTop: '2px solid var(--color-border)',
            background: 'var(--color-surface)',
          }}>
            <div style={{ textAlign: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-dim)', textTransform: 'uppercase', letterSpacing: 1 }}>
                TOTAL
              </span>
              <div className="mono" style={{ fontSize: 42, fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-2px' }}>
                {fmt(total())}
              </div>
            </div>
            <button
              className="btn btn-xl"
              style={{
                width: '100%', justifyContent: 'center',
                background: items.length > 0 ? 'var(--color-primary)' : 'var(--color-surface-2)',
                color: items.length > 0 ? '#fff' : 'var(--color-text-dim)',
                fontSize: 18, fontWeight: 800, minHeight: 56,
                borderRadius: 14, transition: 'all 0.15s',
                boxShadow: items.length > 0 ? '0 4px 12px rgba(63,163,77,0.3)' : 'none',
              }}
              disabled={items.length === 0 || procesando}
              onClick={() => {
                setShowCobro(true);
                setMontoRecibido(0);
              }}
            >
              {procesando ? 'Procesando...' : `💰 Cobrar ${fmt(total())}`}
            </button>
          </div>
        </div>

        {/* Tab sidebar — RIGHT */}
        <div style={{
          width: 56, display: 'flex', flexDirection: 'column',
          gap: 6, alignItems: 'center', paddingTop: 4,
          flexShrink: 0,
        }}>
          {tabs.map((tab, idx) => {
            const isActive = tab.id === tabActivaId;
            const count = tab.items.reduce((a, i) => a + i.cantidad, 0);
            return (
              <button key={tab.id}
                onClick={() => activarTab(tab.id)}
                style={{
                  width: 52, height: 52, border: 'none', cursor: 'pointer',
                  borderRadius: 14, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center', gap: 3,
                  background: isActive ? 'var(--color-primary)' : 'var(--color-surface)',
                  color: isActive ? '#fff' : 'var(--color-text-muted)',
                  transition: 'all 0.12s', position: 'relative',
                  boxShadow: isActive ? '0 3px 10px rgba(63,163,77,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                <span style={{ fontSize: 15, fontWeight: 800, lineHeight: 1 }}>{idx + 1}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: 9, fontWeight: 700, lineHeight: 1,
                    color: isActive ? 'rgba(255,255,255,0.85)' : 'var(--color-primary)',
                  }}>{count} 🛒</span>
                )}
                {tabs.length > 1 && (
                  <span onClick={(e) => { e.stopPropagation(); cerrarTab(tab.id); }}
                    style={{
                      position: 'absolute', top: -4, right: -4,
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'var(--color-danger)', color: '#fff',
                      fontSize: 11, fontWeight: 800, lineHeight: '20px',
                      textAlign: 'center', cursor: 'pointer',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                    }}>✕</span>
                )}
              </button>
            );
          })}
          <button onClick={() => nuevaTab()}
            style={{
              width: 52, height: 52, border: 'none',
              borderRadius: 14, cursor: 'pointer',
              background: 'var(--color-surface)',
              color: 'var(--color-primary)',
              fontSize: 20, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }} title="Nuevo carrito">
            +
          </button>
        </div>
      </div>

      {/* ═══ MODAL COBRO (efectivo) ═══ */}
      {showCobro && (
        <div className="modal-overlay" onClick={() => setShowCobro(false)}>
          <div className="card animate-scale-in" style={{ width: 440, padding: 28 }}
            onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, textAlign: 'center' }}>
              Cobro en Efectivo
            </h3>

            {/* Total to pay */}
            <div style={{ textAlign: 'center', marginBottom: 20, padding: 16, background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase' }}>Total a cobrar</span>
              <div className="mono" style={{ fontSize: 40, fontWeight: 800, color: 'var(--color-text)' }}>{fmt(total())}</div>
            </div>

            {/* Quick bill buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
              {[20, 50, 100, 200, 500].map(bill => (
                <button key={bill} className="bill-btn"
                  onClick={() => setMontoRecibido(bill)}>
                  <span className="bill-btn-label">${bill}</span>
                </button>
              ))}
            </div>

            {/* Exact amount */}
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginBottom: 12 }}
              onClick={() => setMontoRecibido(total())}>
              Pago exacto (${total().toFixed(0)})
            </button>

            {/* Manual input */}
            <div style={{ position: 'relative', marginBottom: 16 }}>
              <input
                className="input mono"
                type="number"
                step="1"
                min="0"
                placeholder="Monto recibido"
                value={montoRecibido || ''}
                onChange={e => setMontoRecibido(parseFloat(e.target.value) || 0)}
                onKeyDown={e => { if (e.key === 'Enter' && montoRecibido >= total()) handleCobrar(); }}
                style={{ textAlign: 'center', fontSize: 28, padding: '14px 20px', fontWeight: 800 }}
                autoFocus
              />
            </div>

            {/* Change display */}
            {montoRecibido > 0 && montoRecibido >= total() && (
              <div style={{
                textAlign: 'center', padding: 14,
                background: 'var(--color-success-soft)', borderRadius: 'var(--radius-md)',
                marginBottom: 16,
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)' }}>Cambio</span>
                <div className="mono" style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-success)' }}>
                  {fmt(montoRecibido - total())}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-lg" style={{ flex: 1, justifyContent: 'center' }}
                onClick={() => setShowCobro(false)}>
                Cancelar
              </button>
              <button
                className="btn btn-lg"
                style={{
                  flex: 2, justifyContent: 'center',
                  background: 'var(--color-primary)', color: '#fff',
                  fontWeight: 800,
                }}
                disabled={!montoRecibido || montoRecibido < total() || procesando}
                onClick={handleCobrar}
              >
                {procesando ? 'Procesando...' : '✓ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ MODAL CANTIDAD (kg) ═══ */}
      {cantidadModal && (
        <NumpadModal
          title={`${(cantidadModal as any).emoji || '🍎'} ${cantidadModal.nombre}`}
          prefix=""
          suffix={(cantidadModal as any).unidad || 'kg'}
          confirmLabel="Agregar"
          confirmColor="var(--color-primary)"
          onDone={handleAddWithQuantity}
          onClose={() => setCantidadModal(null)}
        />
      )}
    </div>
  );
}
