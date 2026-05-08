// pages/Catalogo.tsx — Catálogo de frutas (touch-first)
// Tarjetas grandes con emoji, precios, stock y edición rápida

import { useState, useEffect } from 'react';
import { useProductStore, type Producto } from '../store/productStore';
import { useAuthStore } from '../store/authStore';
import { Plus, Search, X, Edit2, Trash2, Package } from 'lucide-react';
import { invoke } from '../lib/invokeCompat';

interface FormData {
  nombre: string;
  codigo: string;
  emoji: string;
  color_boton: string;
  unidad: string;
  precio_costo: number;
  precio_venta: number;
  precio_mayoreo: number;
  precio_por_caja: number;
  kg_por_caja: number;
  stock_actual: number;
  stock_minimo: number;
  es_temporada: boolean;
  activo: boolean;
}

const emojiFrutas = ['🍎','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍑','🥭','🍍','🥝','🍐','🍒','🥑','🫒','🍈','🥥'];
const colores = ['#e63946','#f4a261','#e9c46a','#2a9d8f','#264653','#6a994e','#bc4749','#9b5de5','#f15bb5','#00bbf9'];

const defaultForm: FormData = {
  nombre: '', codigo: '', emoji: '🍎', color_boton: '#2a9d8f',
  unidad: 'kg', precio_costo: 0, precio_venta: 0,
  precio_mayoreo: 0, precio_por_caja: 0, kg_por_caja: 0,
  stock_actual: 0, stock_minimo: 0, es_temporada: false, activo: true,
};

export default function Catalogo() {
  const { productos, cargarTodo, setBusqueda, productosFiltrados } = useProductStore();
  useProductStore(s => s.productos.length);
  const { usuario } = useAuthStore();
  const esAdmin = usuario?.es_admin ?? false;

  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Producto | null>(null);
  const [localBusqueda, setLocalBusqueda] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState<Producto | null>(null);

  useEffect(() => { cargarTodo(); }, []);

  const fmt = (n: number) => `$${n.toFixed(2)}`;
  const lista = localBusqueda ? productosFiltrados() : productos;

  // ──── Form Modal ────

  const FormProducto = () => {
    const [form, setForm] = useState<FormData>(() => {
      if (editando) {
        return {
          nombre: editando.nombre,
          codigo: editando.codigo,
          emoji: (editando as any).emoji || '🍎',
          color_boton: (editando as any).color_boton || '#2a9d8f',
          unidad: (editando as any).unidad || 'kg',
          precio_costo: editando.precio_costo,
          precio_venta: editando.precio_venta,
          precio_mayoreo: (editando as any).precio_mayoreo || 0,
          precio_por_caja: (editando as any).precio_por_caja || 0,
          kg_por_caja: (editando as any).kg_por_caja || 0,
          stock_actual: editando.stock_actual,
          stock_minimo: editando.stock_minimo,
          es_temporada: (editando as any).es_temporada || false,
          activo: editando.activo,
        };
      }
      return { ...defaultForm };
    });
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!form.nombre.trim()) return setError('El nombre es obligatorio');
      if (!usuario) return;
      setGuardando(true);
      setError('');

      try {
        if (editando) {
          await invoke('actualizar_producto', {
            producto: {
              id: editando.id,
              codigo: form.codigo,
              nombre: form.nombre,
              emoji: form.emoji,
              color_boton: form.color_boton,
              unidad: form.unidad,
              precio_costo: form.precio_costo,
              precio_venta: form.precio_venta,
              precio_mayoreo: form.precio_mayoreo,
              precio_por_caja: form.precio_por_caja,
              kg_por_caja: form.kg_por_caja,
              stock_minimo: form.stock_minimo,
              es_temporada: form.es_temporada,
              activo: form.activo,
            },
            usuarioId: usuario.id,
          });
        } else {
          await invoke('crear_producto', {
            producto: {
              nombre: form.nombre,
              codigo: form.codigo || undefined,
              emoji: form.emoji,
              color_boton: form.color_boton,
              unidad: form.unidad,
              precio_costo: form.precio_costo,
              precio_venta: form.precio_venta,
              precio_mayoreo: form.precio_mayoreo,
              precio_por_caja: form.precio_por_caja,
              kg_por_caja: form.kg_por_caja,
              stock_actual: form.stock_actual,
              stock_minimo: form.stock_minimo,
              es_temporada: form.es_temporada,
            },
            usuarioId: usuario.id,
          });
        }
        await cargarTodo();
        setShowForm(false);
        setEditando(null);
      } catch (err: any) {
        setError(err?.toString() || 'Error al guardar');
      }
      setGuardando(false);
    };

    const labelStyle: React.CSSProperties = {
      fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4, display: 'block',
    };

    return (
      <div style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
      }} onClick={() => { setShowForm(false); setEditando(null); }}>
        <div className="card animate-fade-in" style={{
          width: 520, maxHeight: '90vh', overflow: 'auto', padding: 24,
        }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>
              {editando ? '✏️ Editar Producto' : '➕ Nueva Fruta'}
            </h2>
            <button className="btn btn-ghost btn-sm" onClick={() => { setShowForm(false); setEditando(null); }}>
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Nombre */}
            <div>
              <label style={labelStyle}>NOMBRE *</label>
              <input className="input" value={form.nombre} autoFocus
                onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej: Mango Manila" style={{ fontSize: 16 }} />
            </div>

            {/* Emoji + Color */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>EMOJI</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {emojiFrutas.map(e => (
                    <button key={e} type="button" onClick={() => setForm(f => ({ ...f, emoji: e }))}
                      style={{
                        width: 36, height: 36, fontSize: 20, border: form.emoji === e ? '2px solid var(--color-primary)' : '1px solid var(--color-border)',
                        borderRadius: 8, background: form.emoji === e ? 'var(--color-primary-soft)' : 'var(--color-surface)',
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>{e}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={labelStyle}>COLOR BOTÓN</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {colores.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color_boton: c }))}
                      style={{
                        width: 32, height: 32, borderRadius: 8, background: c, border: form.color_boton === c ? '3px solid var(--color-text)' : '1px solid transparent',
                        cursor: 'pointer',
                      }} />
                  ))}
                </div>
              </div>
            </div>

            {/* Unidad + Código */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>UNIDAD DE VENTA</label>
                <select className="input" value={form.unidad}
                  onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}
                  style={{ fontSize: 14 }}>
                  <option value="kg">Kilogramo (kg)</option>
                  <option value="pieza">Pieza</option>
                  <option value="caja">Caja</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>CÓDIGO (auto si vacío)</label>
                <input className="input mono" value={form.codigo}
                  onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))}
                  placeholder="PF-XXXXX" />
              </div>
            </div>

            {/* Precios */}
            <div style={{ background: 'var(--color-surface-2)', padding: 14, borderRadius: 10 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 10 }}>💰 PRECIOS</p>
              <div style={{ display: 'grid', gridTemplateColumns: esAdmin ? '1fr 1fr 1fr' : '1fr 1fr', gap: 10 }}>
                {esAdmin && (
                  <div>
                    <label style={labelStyle}>COSTO</label>
                    <input className="input mono" type="number" step="0.01" value={form.precio_costo}
                      onChange={e => setForm(f => ({ ...f, precio_costo: parseFloat(e.target.value) || 0 }))} />
                  </div>
                )}
                <div>
                  <label style={{ ...labelStyle, color: 'var(--color-primary)' }}>MENUDEO *</label>
                  <input className="input mono" type="number" step="0.50" value={form.precio_venta}
                    onChange={e => setForm(f => ({ ...f, precio_venta: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div>
                  <label style={labelStyle}>MAYOREO</label>
                  <input className="input mono" type="number" step="0.50" value={form.precio_mayoreo}
                    onChange={e => setForm(f => ({ ...f, precio_mayoreo: parseFloat(e.target.value) || 0 }))} />
                </div>
              </div>
            </div>

            {/* Stock */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div>
                <label style={labelStyle}>{editando ? 'STOCK ACTUAL' : 'STOCK INICIAL'} (kg)</label>
                <input className="input mono" type="number" step="0.1" value={form.stock_actual}
                  onChange={e => setForm(f => ({ ...f, stock_actual: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div>
                <label style={labelStyle}>STOCK MÍNIMO</label>
                <input className="input mono" type="number" step="0.1" value={form.stock_minimo}
                  onChange={e => setForm(f => ({ ...f, stock_minimo: parseFloat(e.target.value) || 0 }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.es_temporada}
                    onChange={e => setForm(f => ({ ...f, es_temporada: e.target.checked }))} />
                  🌿 Temporada
                </label>
                {editando && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.activo}
                      onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                    ✅ Activo
                  </label>
                )}
              </div>
            </div>

            {error && <p style={{ color: 'var(--color-danger)', fontSize: 13 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {editando && (
                <button type="button" className="btn btn-ghost" style={{ color: 'var(--color-danger)' }}
                  onClick={() => setConfirmarEliminar(editando)}>
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button type="button" className="btn btn-ghost" onClick={() => { setShowForm(false); setEditando(null); }}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={guardando}>
                {guardando ? 'Guardando...' : editando ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  // ──── Render ────

  return (
    <div className="page-module" style={{ gap: 8 }}>
      {/* Module 1: Header + Search */}
      <div className="module-card" style={{ flex: 'none', borderRadius: 16 }}>
      {/* Header */}
      <div style={{
        padding: '12px 20px', borderBottom: '1px solid var(--color-border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Package size={20} style={{ color: 'var(--color-primary)' }} />
        <h2 style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>Catálogo de Frutas</h2>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {lista.length} productos
        </span>
        <button className="btn btn-primary" onClick={() => { setEditando(null); setShowForm(true); }}>
          <Plus size={16} /> Nueva Fruta
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--color-border)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
          <input className="input" placeholder="Buscar fruta..."
            value={localBusqueda} style={{ paddingLeft: 36, width: '100%', fontSize: 15 }}
            onChange={e => { setLocalBusqueda(e.target.value); setBusqueda(e.target.value); }} />
        </div>
      </div>
      </div>

      {/* Grid Flotante */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {lista.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: 'var(--color-text-dim)' }}>
            <Package size={48} strokeWidth={1.2} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>No hay productos</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14 }}>
            {lista.map(p => {
              const sinStock = p.stock_actual <= 0;
              const stockBajo = p.stock_actual <= p.stock_minimo && p.stock_actual > 0;
              return (
                <div key={p.id} className="card" style={{
                  padding: 0, overflow: 'hidden', cursor: 'pointer',
                  border: sinStock ? '2px solid var(--color-danger)' : stockBajo ? '2px solid var(--color-warning)' : '1px solid var(--color-border)',
                  opacity: p.activo ? 1 : 0.5, transition: 'transform 0.1s',
                }}
                  onClick={() => { setEditando(p); setShowForm(true); }}
                  onMouseDown={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'; }}
                  onMouseUp={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                >
                  {/* Header con color */}
                  <div style={{
                    padding: '14px 16px', textAlign: 'center',
                    background: `${(p as any).color_boton || '#2a9d8f'}15`,
                    borderBottom: '1px solid var(--color-border)',
                  }}>
                    <span style={{ fontSize: 40 }}>{(p as any).emoji || '🍎'}</span>
                    <div style={{ fontSize: 15, fontWeight: 700, marginTop: 4 }}>{p.nombre}</div>
                    {(p as any).es_temporada && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--color-accent-soft)', color: 'var(--color-accent)', fontWeight: 600 }}>
                        🌿 Temporada
                      </span>
                    )}
                    {!p.activo && (
                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'var(--color-danger-soft)', color: 'var(--color-danger)', fontWeight: 600, marginLeft: 4 }}>
                        Inactivo
                      </span>
                    )}
                  </div>

                  {/* Body */}
                  <div style={{ padding: '10px 16px' }}>
                    {/* Precios lado a lado */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontWeight: 600 }}>MENUDEO</div>
                        <span className="mono" style={{ fontSize: 22, fontWeight: 800, color: 'var(--color-primary)' }}>
                          {fmt(p.precio_venta)}
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>/{(p as any).unidad || 'kg'}</span>
                      </div>
                      {(p as any).precio_mayoreo > 0 && (
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 10, color: 'var(--color-text-dim)', fontWeight: 600 }}>MAYOREO</div>
                          <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--color-accent)' }}>
                            {fmt((p as any).precio_mayoreo)}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>/{(p as any).unidad || 'kg'}</span>
                        </div>
                      )}
                    </div>

                    {/* Stock */}
                    <div style={{
                      marginTop: 10, padding: '6px 10px', borderRadius: 8,
                      background: sinStock ? 'var(--color-danger-soft)' : stockBajo ? 'var(--color-warning-soft)' : 'var(--color-success-soft)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: sinStock ? 'var(--color-danger)' : stockBajo ? '#b8860b' : 'var(--color-success)' }}>
                        {sinStock ? '🔴 Sin stock' : stockBajo ? '⚠️ Stock bajo' : '✅ En stock'}
                      </span>
                      <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>
                        {p.stock_actual} {(p as any).unidad || 'kg'}
                      </span>
                    </div>

                    {/* Edit hint */}
                    <div style={{ textAlign: 'center', marginTop: 8 }}>
                      <span style={{ fontSize: 11, color: 'var(--color-text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Edit2 size={10} /> Toca para editar
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modals */}
      {showForm && <FormProducto />}

      {confirmarEliminar && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}
          onClick={() => setConfirmarEliminar(null)}>
          <div className="card animate-fade-in" style={{ width: 360, padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              ¿Eliminar "{confirmarEliminar.nombre}"?
            </h3>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 20 }}>
              Esta acción no se puede deshacer.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={() => setConfirmarEliminar(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={async () => {
                if (!usuario) return;
                try {
                  await invoke('eliminar_producto', { productoId: confirmarEliminar.id, usuarioId: usuario.id });
                  await cargarTodo();
                  setConfirmarEliminar(null);
                  setShowForm(false);
                  setEditando(null);
                } catch (err: any) {
                  alert(err?.toString() || 'Error');
                }
              }}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
