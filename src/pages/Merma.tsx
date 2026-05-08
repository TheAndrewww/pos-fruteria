// pages/Merma.tsx — Registro y consulta de mermas (pérdidas)
// Interfaz táctil para registrar fruta dañada/podrida

import { useState, useEffect } from 'react';
import { useProductStore, type Producto } from '../store/productStore';
import { useAuthStore } from '../store/authStore';
import { AlertTriangle, Plus, X, Search } from 'lucide-react';
import { invoke } from '../lib/invokeCompat';

interface MermaRegistro {
  id: number;
  producto_id: number;
  producto_nombre: string;
  cantidad: number;
  unidad: string;
  motivo: string;
  fecha: string;
  usuario_nombre: string;
}

const motivos = [
  'Fruta podrida',
  'Golpeada / dañada',
  'Pasada de maduración',
  'Plagas / hongos',
  'Caída / accidente',
  'Otro',
];

export default function Merma() {
  const { productos, cargarTodo } = useProductStore();
  const { usuario } = useAuthStore();

  const [mermas, setMermas] = useState<MermaRegistro[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [productoSel, setProductoSel] = useState<Producto | null>(null);
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState(motivos[0]);
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState('');

  useEffect(() => { cargarTodo(); cargarMermas(); }, []);

  const cargarMermas = async () => {
    try {
      const data = await invoke<MermaRegistro[]>('listar_mermas', { limite: 100 });
      setMermas(data);
    } catch { setMermas([]); }
  };

  const handleRegistrar = async () => {
    if (!productoSel || !usuario || !cantidad) return;
    const cant = parseFloat(cantidad);
    if (cant <= 0) return;
    setGuardando(true);
    try {
      await invoke('registrar_merma', {
        merma: {
          producto_id: productoSel.id,
          cantidad: cant,
          motivo,
        },
        usuarioId: usuario.id,
      });
      await cargarTodo();
      await cargarMermas();
      setShowForm(false);
      setProductoSel(null);
      setCantidad('');
      setMotivo(motivos[0]);
    } catch (err: any) {
      alert(err?.toString() || 'Error al registrar merma');
    }
    setGuardando(false);
  };

  const productosActivos = productos.filter(p => p.activo);
  const productosFiltrados = busqueda
    ? productosActivos.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : productosActivos;

  const fmt = (n: number) => n.toFixed(2);

  return (
    <div className="page-module" style={{ gap: 8 }}>
      {/* Module 1: Header */}
      <div className="module-card" style={{ flex: 'none', borderRadius: 16 }}>
      <div style={{
        padding: '12px 20px',
        background: 'var(--color-surface)', display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <AlertTriangle size={20} style={{ color: 'var(--color-accent)' }} />
        <h2 style={{ fontSize: 17, fontWeight: 800, flex: 1 }}>Registro de Merma</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}>
          <Plus size={16} /> Registrar Merma
        </button>
      </div>
      </div>

      {/* Historial Flotante */}
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
        {mermas.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', gap: 12, color: 'var(--color-text-dim)' }}>
            <AlertTriangle size={48} strokeWidth={1.2} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>Sin mermas registradas</p>
            <p style={{ fontSize: 13 }}>Registra las pérdidas con el botón de arriba</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {mermas.map(m => (
              <div key={m.id} className="card" style={{
                padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10,
                  background: 'var(--color-danger-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0,
                }}>🗑️</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{m.producto_nombre}</div>
                  <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{m.motivo}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="mono" style={{ fontWeight: 700, fontSize: 16, color: 'var(--color-danger)' }}>
                    -{fmt(m.cantidad)} {m.unidad || 'kg'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>
                    {m.fecha?.substring(0, 16)} · {m.usuario_nombre}
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
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>🗑️ Registrar Merma</h2>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowForm(false)}><X size={18} /></button>
            </div>

            {/* Seleccionar producto */}
            {!productoSel ? (
              <div>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                  <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-dim)' }} />
                  <input className="input" placeholder="Buscar fruta..." value={busqueda}
                    onChange={e => setBusqueda(e.target.value)} style={{ paddingLeft: 36, fontSize: 15 }} autoFocus />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, maxHeight: 400, overflow: 'auto' }}>
                  {productosFiltrados.map(p => (
                    <button key={p.id} onClick={() => setProductoSel(p)} style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '12px 8px', borderRadius: 12,
                      border: '1px solid var(--color-border)', background: 'var(--color-surface)',
                      cursor: 'pointer', transition: 'all 0.1s',
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
                {/* Producto seleccionado */}
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
                  background: 'var(--color-surface-2)', borderRadius: 10,
                }}>
                  <span style={{ fontSize: 32 }}>{(productoSel as any).emoji || '🍎'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{productoSel.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                      Stock: {productoSel.stock_actual} {(productoSel as any).unidad || 'kg'}
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setProductoSel(null)}>Cambiar</button>
                </div>

                {/* Cantidad */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>
                    CANTIDAD PERDIDA ({(productoSel as any).unidad || 'kg'})
                  </label>
                  <input className="input mono" type="number" step="0.1" value={cantidad}
                    onChange={e => setCantidad(e.target.value)} autoFocus
                    placeholder="0.0" style={{ fontSize: 24, textAlign: 'center' }} />
                </div>

                {/* Motivo */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase' as const, display: 'block', marginBottom: 4 }}>
                    MOTIVO
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {motivos.map(m => (
                      <button key={m} type="button"
                        className={`btn ${motivo === m ? 'btn-primary' : 'btn-ghost'} btn-sm`}
                        onClick={() => setMotivo(m)} style={{ justifyContent: 'center' }}>
                        {m}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Botones */}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setShowForm(false)}>Cancelar</button>
                  <button className="btn btn-danger" style={{ flex: 1 }} disabled={guardando || !cantidad || parseFloat(cantidad) <= 0}
                    onClick={handleRegistrar}>
                    {guardando ? 'Registrando...' : '🗑️ Registrar Merma'}
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
