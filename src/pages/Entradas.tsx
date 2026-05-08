// pages/Entradas.tsx — Registro de entradas de mercancía
// Interfaz táctil para dar entrada a fruta nueva

import { useState, useEffect } from 'react';
import { useProductStore, type Producto } from '../store/productStore';
import { useAuthStore } from '../store/authStore';
import { PackagePlus, Plus, X, Search } from 'lucide-react';
import { invoke } from '../lib/invokeCompat';

interface EntradaRegistro {
  id: number;
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  unidad: string;
  costo_unitario: number;
  proveedor: string;
  notas: string;
  fecha: string;
  usuario_nombre: string;
}

export default function Entradas() {
  const { productos, cargarTodo } = useProductStore();
  const { usuario } = useAuthStore();

  const [entradas, setEntradas] = useState<EntradaRegistro[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [productoSel, setProductoSel] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [costoUnitario, setCostoUnitario] = useState('');
  const [proveedor, setProveedor] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => { cargarTodo(); cargarEntradas(); }, []);

  const cargarEntradas = async () => {
    try {
      const data = await invoke<EntradaRegistro[]>('listar_entradas', { limite: 100 });
      setEntradas(data);
    } catch { setEntradas([]); }
  };

  const handleRegistrar = async () => {
    if (!productoSel || !usuario || !cantidad) return;
    const cant = parseFloat(cantidad);
    if (cant <= 0) return;
    setGuardando(true);
    try {
      await invoke('registrar_entrada', {
        entrada: {
          producto_id: productoSel.id,
          cantidad: cant,
          precio_costo: parseFloat(costoUnitario) || 0,
          proveedor: proveedor || null,
          notas: notas || null,
        },
        usuarioId: usuario.id,
      });
      await cargarTodo();
      await cargarEntradas();
      setShowForm(false);
      setProductoSel(null);
      setCantidad('');
      setCostoUnitario('');
      setProveedor('');
      setNotas('');
    } catch (err: any) {
      alert(err?.toString() || 'Error al registrar entrada');
    }
    setGuardando(false);
  };

  const productosActivos = productos.filter(p => p.activo);
  const productosFiltrados = busqueda
    ? productosActivos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : productosActivos;

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  return (
    <div className="page-module" style={{ gap: 8 }}>
      {/* Module 1: Header */}
      <div className="module-card" style={{ flex: 'none', borderRadius: 16 }}>
      <div style={{
        padding: '12px 20px',
        background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <PackagePlus size={20} style={{ color: 'var(--color-success)' }} />
        <h2 style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>Entradas de Mercancía</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Registrar Entrada
        </button>
      </div>
      </div>

      {/* Historial Flotante */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
        {entradas.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: 'var(--color-text-dim)' }}>
            <PackagePlus size={48} strokeWidth={1.2} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>Sin entradas registradas</p>
            <p style={{ fontSize: 13 }}>Registra la llegada de mercancía con el botón de arriba</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {entradas.map(e => (
              <div key={e.id} className="card" style={{
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: 'var(--color-success-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0,
                }}>📦</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{e.producto_nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    {e.proveedor && `${e.proveedor} · `}{e.notas || ''}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-success)' }}>
                    +{e.cantidad.toFixed(2)} {e.unidad || 'kg'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                    {e.costo_unitario > 0 && `${fmt(e.costo_unitario)}/u · `}
                    {e.fecha?.substring(0, 16)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de registro */}
      {showForm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }} onClick={() => setShowForm(false)}>
          <div className="card animate-fade-in" style={{ width: 480, maxHeight: '85vh', overflow: 'auto', padding: 24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>📦 Registrar Entrada</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>

            {!productoSel ? (
              <div>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
                  <input className="input" placeholder="Buscar fruta..." value={busqueda}
                    onChange={e => setBusqueda(e.target.value)} style={{ paddingLeft: 36, fontSize: 15 }} autoFocus />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxHeight: 400, overflow: 'auto' }}>
                  {productosFiltrados.map(p => (
                    <button key={p.id} onClick={() => { setProductoSel(p); setCostoUnitario(String(p.precio_costo || '')); }} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '12px 8px', borderRadius: 12,
                      border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                      cursor: 'pointer',
                    }}>
                      <span style={{ fontSize: 28 }}>{(p as any).emoji || '🍎'}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, textAlign: 'center' }}>{p.nombre}</span>
                      <span className="mono" style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                        {p.stock_actual} {(p as any).unidad || 'kg'}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: 'var(--color-surface-2)', borderRadius: 10,
                }}>
                  <span style={{ fontSize: 32 }}>{(productoSel as any).emoji || '🍎'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{productoSel.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Stock actual: {productoSel.stock_actual} {(productoSel as any).unidad || 'kg'}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setProductoSel(null)}>Cambiar</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>
                      CANTIDAD ({(productoSel as any).unidad || 'kg'})
                    </label>
                    <input className="input mono" type="number" step="0.1" value={cantidad}
                      onChange={e => setCantidad(e.target.value)} autoFocus
                      placeholder="0.0" style={{ fontSize: 20, textAlign: 'center' }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>
                      COSTO UNITARIO
                    </label>
                    <input className="input mono" type="number" step="0.01" value={costoUnitario}
                      onChange={e => setCostoUnitario(e.target.value)}
                      placeholder="$0.00" style={{ fontSize: 20, textAlign: 'center' }} />
                  </div>
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>
                    PROVEEDOR
                  </label>
                  <input className="input" value={proveedor} onChange={e => setProveedor(e.target.value)}
                    placeholder="Nombre del proveedor (opcional)" />
                </div>

                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>
                    NOTAS
                  </label>
                  <input className="input" value={notas} onChange={e => setNotas(e.target.value)}
                    placeholder="Notas opcionales..." />
                </div>

                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancelar</button>
                  <button className="btn btn-success" style={{ flex: 1 }} disabled={guardando || !cantidad || parseFloat(cantidad) <= 0}
                    onClick={handleRegistrar}>
                    {guardando ? 'Registrando...' : '📦 Registrar Entrada'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
