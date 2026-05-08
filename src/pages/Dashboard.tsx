// pages/Dashboard.tsx — Layout principal con sidebar táctil (24")

import { useState, useEffect } from 'react';
import { useAuthStore, leerModoCaja, setModoCajaLocal } from '../store/authStore';
import { invoke, isTauri } from '../lib/invokeCompat';
import ModalModoCaja from '../components/ModalModoCaja';
import PuntoDeVenta from './PuntoDeVenta';
import Catalogo from './Catalogo';
import UsuariosPage from './Usuarios';
import CortesCaja, { ModalAperturaCaja } from './CortesCaja';
import HistorialVentas from './HistorialVentas';
import Reportes from './Reportes';
import Ajustes from './Ajustes';
import Merma from './Merma';
import Entradas from './Entradas';
import { useCortesStore } from '../store/cortesStore';
import {
  ShoppingCart, Package, BarChart3, LogOut,
  Users, DollarSign, History, Settings, TrendingUp,
  AlertTriangle, PackagePlus,
} from 'lucide-react';

type Modulo = 'venta' | 'catalogo' | 'dashboard' | 'usuarios' | 'cortes' | 'historial' | 'reportes' | 'ajustes' | 'merma' | 'entradas';

interface EstadisticasDia {
  total_ventas: number;
  num_transacciones: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  producto_top_nombre: string | null;
  producto_top_cantidad: number;
}

export default function Dashboard() {
  const { usuario, logout, tienePermiso } = useAuthStore();
  const [modulo, setModulo] = useState<Modulo>('venta');
  const [stats, setStats] = useState<EstadisticasDia | null>(null);
  const [cortePendiente, setCortePendiente] = useState<string | null>(null);
  const [necesitaApertura, setNecesitaApertura] = useState<boolean>(false);
  const [verificandoApertura, setVerificandoApertura] = useState<boolean>(true);
  const [stockBajoCount, setStockBajoCount] = useState<number>(0);
  const [stockAlertDismiss, setStockAlertDismiss] = useState<boolean>(false);
  const [reloj, setReloj] = useState('');

  const [modoCaja, setModoCajaState] = useState<'espejo' | 'individual'>(() => leerModoCaja().modo);
  const [modoConfigurado, setModoConfigurado] = useState<boolean>(() => leerModoCaja().configurado);
  const [forzarModalModo, setForzarModalModo] = useState<boolean>(false);
  const debeMostrarModalModo = !isTauri() && (!modoConfigurado || forzarModalModo);
  const { obtenerAperturaHoy } = useCortesStore();

  const [triggerMovimiento, setTriggerMovimiento] = useState(0);
  const [triggerParcial, setTriggerParcial] = useState(0);
  const [triggerDia, setTriggerDia] = useState(0);

  const esAdmin = usuario?.es_admin ?? false;

  // Reloj en vivo
  useEffect(() => {
    const update = () => {
      const now = new Date();
      setReloj(now.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }));
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    invoke<string | null>('verificar_corte_dia_pendiente')
      .then(fecha => setCortePendiente(fecha))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (isTauri()) return;
    invoke<{ modo: 'espejo' | 'individual'; configurado: boolean } | null>('obtener_modo_caja')
      .then((r) => {
        if (!r) return;
        setModoCajaState(r.modo);
        setModoConfigurado(r.configurado);
        setModoCajaLocal(r.modo, r.configurado);
      })
      .catch(() => {});
  }, []);

  useEffect(() => { invoke('respaldo_auto_si_necesario').catch(() => {}); }, []);

  useEffect(() => {
    invoke<any[]>('listar_productos_stock_bajo')
      .then(lista => setStockBajoCount(lista.length))
      .catch(() => {});
  }, [modulo]);

  useEffect(() => {
    obtenerAperturaHoy()
      .then(apertura => setNecesitaApertura(apertura === null))
      .catch(() => setNecesitaApertura(true))
      .finally(() => setVerificandoApertura(false));
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setModulo('venta'); }
      if (e.key === 'F4') { e.preventDefault(); setModulo('catalogo'); }
      if (e.key === 'F8') { e.preventDefault(); setModulo('dashboard'); }
      if (e.key === 'F6') { e.preventDefault(); setModulo('cortes'); setTriggerMovimiento(n => n + 1); }
      if (e.key === 'F7') { e.preventDefault(); setModulo('historial'); }
      if (e.key === 'F11' && !e.shiftKey) { e.preventDefault(); setModulo('cortes'); setTriggerParcial(n => n + 1); }
      if (e.key === 'F11' && e.shiftKey) { e.preventDefault(); setModulo('cortes'); setTriggerDia(n => n + 1); }
      if (e.key === 'F10') { e.preventDefault(); setModulo('reportes'); }
      if (e.key === 'F12') { e.preventDefault(); logout(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (modulo === 'dashboard') {
      invoke<EstadisticasDia>('obtener_estadisticas_dia')
        .then(setStats)
        .catch(() => {});
    }
  }, [modulo]);

  const fmt = (n: number) => `$${n.toFixed(2)}`;

  // ── Menu items con grupos ──
  type MenuGroup = { label: string; items: { id: Modulo; label: string; icon: React.ReactNode; badge?: number; visible: boolean }[] };
  const menuGroups: MenuGroup[] = [
    {
      label: 'OPERACIÓN',
      items: [
        { id: 'venta', label: 'Vender', icon: <ShoppingCart size={22} />, visible: tienePermiso('ventas', 'crear') },
        { id: 'historial', label: 'Historial', icon: <History size={22} />, visible: tienePermiso('ventas', 'ver') },
        { id: 'cortes', label: 'Cortes', icon: <DollarSign size={22} />, visible: true },
      ],
    },
    {
      label: 'INVENTARIO',
      items: [
        { id: 'catalogo', label: 'Productos', icon: <Package size={22} />, visible: tienePermiso('inventario', 'ver') },
        { id: 'entradas', label: 'Entradas', icon: <PackagePlus size={22} />, visible: tienePermiso('inventario', 'ver') },
        { id: 'merma', label: 'Merma', icon: <AlertTriangle size={22} />, badge: stockBajoCount > 0 ? stockBajoCount : undefined, visible: tienePermiso('inventario', 'ver') },
      ],
    },
    {
      label: 'ADMIN',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: <BarChart3 size={22} />, visible: true },
        { id: 'reportes', label: 'Reportes', icon: <TrendingUp size={22} />, visible: esAdmin },
        { id: 'usuarios', label: 'Usuarios', icon: <Users size={22} />, visible: esAdmin },
        { id: 'ajustes', label: 'Ajustes', icon: <Settings size={22} />, visible: esAdmin },
      ],
    },
  ];

  return (
    <>
      {debeMostrarModalModo && (
        <ModalModoCaja
          bloqueante={!modoConfigurado}
          modoActual={modoCaja}
          onSeleccion={(m) => { setModoCajaState(m); setModoConfigurado(true); setForzarModalModo(false); }}
          onCerrar={() => setForzarModalModo(false)}
        />
      )}
      {!verificandoApertura && necesitaApertura && !debeMostrarModalModo && (
        <ModalAperturaCaja bloqueante onSuccess={() => setNecesitaApertura(false)} />
      )}

      <div className="pos-dashboard">
        {/* ─── Sidebar ─── */}
        <div style={{
          display: 'flex', flexDirection: 'column',
          background: 'var(--color-surface)',
          borderRight: '1.5px solid var(--color-border)',
          overflow: 'auto',
        }}>
          {/* Brand header */}
          <div style={{
            padding: '16px 16px 12px',
            display: 'flex', alignItems: 'center', gap: 10,
            borderBottom: '1px solid var(--color-border)',
          }}>
            <span style={{ fontSize: 28 }}>🍊</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-primary)', lineHeight: 1.1 }}>PAULÍN</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-text-dim)', letterSpacing: '1px' }}>PREMIUM FRUITS</div>
            </div>
          </div>

          {/* Menu groups */}
          <div style={{ flex: 1, padding: '8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {menuGroups.map((group) => {
              const visible = group.items.filter(i => i.visible);
              if (visible.length === 0) return null;
              return (
                <div key={group.label}>
                  <div style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--color-text-dim)',
                    padding: '12px 12px 4px', letterSpacing: '1px',
                  }}>
                    {group.label}
                  </div>
                  {visible.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setModulo(item.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '12px 14px', borderRadius: 'var(--radius-md)',
                        border: 'none', cursor: 'pointer',
                        fontSize: 14, fontWeight: 600,
                        width: '100%', textAlign: 'left',
                        minHeight: 48,
                        transition: 'all 0.08s',
                        background: modulo === item.id ? 'var(--color-primary)' : 'transparent',
                        color: modulo === item.id ? '#fff' : 'var(--color-text-muted)',
                      }}
                    >
                      {item.icon}
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {item.badge && (
                        <span style={{
                          background: modulo === item.id ? 'rgba(255,255,255,0.3)' : 'var(--color-danger)',
                          color: '#fff', fontSize: 11, fontWeight: 700,
                          padding: '2px 8px', borderRadius: 12, minWidth: 22, textAlign: 'center',
                        }}>
                          {item.badge}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Footer: user + clock + logout */}
          <div style={{
            padding: '12px', borderTop: '1px solid var(--color-border)',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            {/* Clock */}
            <div style={{ textAlign: 'center' }}>
              <span className="mono" style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text)' }}>
                {reloj}
              </span>
            </div>

            {/* User info */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 10px', background: 'var(--color-surface-2)',
              borderRadius: 'var(--radius-md)',
            }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'var(--color-primary)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: 700, flexShrink: 0,
              }}>
                {usuario?.nombre_completo.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {usuario?.nombre_completo}
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>{usuario?.rol_nombre}</div>
              </div>
            </div>

            {/* Logout */}
            <button
              className="btn btn-danger"
              onClick={logout}
              style={{ width: '100%', justifyContent: 'center', gap: 8 }}
            >
              <LogOut size={18} />
              Cerrar Sesión
            </button>
          </div>
        </div>

        {/* ─── Contenido ─── */}
        <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
          {/* Alertas */}
          {cortePendiente && (
            <div style={{
              padding: '10px 20px', background: 'var(--color-warning-soft)',
              borderBottom: '2px solid var(--color-warning)',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, color: '#8b6508' }}>
                Cierre de caja pendiente del {cortePendiente}
              </span>
              <button className="btn btn-sm"
                style={{ background: 'var(--color-warning)', color: '#fff', border: 'none' }}
                onClick={() => { setModulo('cortes'); setTriggerDia(n => n + 1); }}>
                Hacer corte
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setCortePendiente(null)}>
                ✕
              </button>
            </div>
          )}

          {stockBajoCount > 0 && !stockAlertDismiss && tienePermiso('inventario', 'ver') && (
            <div style={{
              padding: '10px 20px', background: 'var(--color-danger-soft)',
              borderBottom: '2px solid var(--color-danger)',
              display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
            }}>
              <span style={{ fontSize: 18 }}>📉</span>
              <span style={{ fontSize: 14, fontWeight: 700, flex: 1, color: 'var(--color-danger)' }}>
                {stockBajoCount} producto{stockBajoCount !== 1 ? 's' : ''} con stock bajo
              </span>
              <button className="btn btn-sm"
                style={{ background: 'var(--color-danger)', color: '#fff', border: 'none' }}
                onClick={() => setModulo('catalogo')}>
                Ver inventario
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setStockAlertDismiss(true)}>
                ✕
              </button>
            </div>
          )}

          {/* Módulos */}
          <div style={{ display: modulo === 'venta' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <PuntoDeVenta />
          </div>
          <div style={{ display: modulo === 'catalogo' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <Catalogo />
          </div>
          {modulo === 'usuarios' && <UsuariosPage />}
          {modulo === 'dashboard' && (
            <DashboardHome stats={stats} fmt={fmt} stockBajo={stockBajoCount} onVerInventario={() => setModulo('catalogo')} />
          )}
          {modulo === 'historial' && <HistorialVentas />}
          {modulo === 'reportes' && <Reportes />}
          {modulo === 'merma' && <Merma />}
          {modulo === 'entradas' && <Entradas />}
          <div style={{ display: modulo === 'cortes' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <CortesCaja
              triggerMovimiento={triggerMovimiento}
              triggerParcial={triggerParcial}
              triggerDia={triggerDia}
              fechaObjetivoDia={cortePendiente}
              onCorteDiaHecho={() => setCortePendiente(null)}
            />
          </div>
          {modulo === 'ajustes' && <Ajustes />}
        </div>
      </div>
    </>
  );
}

// ─── Dashboard Home ───────────────────────────────────────
function DashboardHome({ stats, fmt, stockBajo, onVerInventario }: {
  stats: EstadisticasDia | null; fmt: (n: number) => string;
  stockBajo: number; onVerInventario: () => void;
}) {
  if (!stats) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-dim)' }}>
        <span className="animate-pulse-soft">Cargando estadísticas...</span>
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ padding: 28, overflow: 'auto' }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>📊 Resumen del Día</h2>

      {stockBajo > 0 && (
        <div className="card" style={{
          padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--color-danger-soft)', borderColor: 'var(--color-danger)',
        }}>
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-danger)' }}>
              {stockBajo} producto{stockBajo !== 1 ? 's' : ''} con stock bajo
            </p>
          </div>
          <button className="btn btn-sm" style={{ background: 'var(--color-danger)', color: '#fff', border: 'none' }}
            onClick={onVerInventario}>Ver inventario</button>
        </div>
      )}

      <div className="dashboard-stats-grid" style={{ marginBottom: 24 }}>
        <StatCard label="Total Ventas" value={fmt(stats.total_ventas)} color="var(--color-success)" />
        <StatCard label="Transacciones" value={String(stats.num_transacciones)} color="var(--color-primary)" />
        <StatCard label="Producto Top" value={stats.producto_top_nombre || '—'} sub={stats.producto_top_cantidad > 0 ? `${stats.producto_top_cantidad} unidades` : ''} color="var(--color-secondary-h)" isText />
        <StatCard label="Promedio / Venta" value={stats.num_transacciones > 0 ? fmt(stats.total_ventas / stats.num_transacciones) : '$0.00'} color="var(--color-text-muted)" />
      </div>

      <div className="card" style={{ padding: 24 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 20, color: 'var(--color-text-muted)' }}>
          DESGLOSE POR MÉTODO DE PAGO
        </h3>
        <div className="dashboard-payment-grid">
          <PaymentBar label="Efectivo" value={stats.efectivo} total={stats.total_ventas} color="var(--color-success)" fmt={fmt} />
          <PaymentBar label="Tarjeta" value={stats.tarjeta} total={stats.total_ventas} color="var(--color-primary)" fmt={fmt} />
          <PaymentBar label="Transferencia" value={stats.transferencia} total={stats.total_ventas} color="var(--color-secondary-h)" fmt={fmt} />
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, sub, color, isText }: { label: string; value: string; sub?: string; color: string; isText?: boolean }) {
  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-dim)', textTransform: 'uppercase', marginBottom: 8 }}>{label}</p>
      <p className={isText ? '' : 'mono'} style={{
        fontSize: isText ? 15 : 28, fontWeight: 800, color,
        ...(isText ? { lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } : {}),
      }}>{value}</p>
      <div style={{ flex: 1 }} />
      {sub && <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 8 }}>{sub}</p>}
    </div>
  );
}

function PaymentBar({ label, value, total, color, fmt }: {
  label: string; value: number; total: number; color: string; fmt: (n: number) => string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{label}</span>
        <span className="mono" style={{ fontSize: 14, fontWeight: 700, color }}>{fmt(value)}</span>
      </div>
      <div style={{ height: 10, background: 'var(--color-surface-2)', borderRadius: 5, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 5, background: color, width: `${pct}%`, transition: 'width 0.5s ease' }} />
      </div>
      <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 4 }}>{pct.toFixed(0)}%</p>
    </div>
  );
}
