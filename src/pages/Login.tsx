// pages/Login.tsx — Pantalla de login táctil (PIN pad grande)

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const { loginPin, loginPassword, cargando, error, limpiarError } = useAuthStore();
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [credentials, setCredentials] = useState({ usuario: '', password: '' });

  useEffect(() => {
    limpiarError();
    setPin('');
    setPinError(false);
  }, [showPassword]);

  // Keyboard support
  useEffect(() => {
    if (showPassword) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handlePinInput(e.key);
      else if (e.key === 'Backspace') { setPin(p => p.slice(0, -1)); setPinError(false); }
      else if (e.key === 'Escape') { setPin(''); setPinError(false); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [showPassword, pin]);

  const handlePinInput = useCallback((digit: string) => {
    setPinError(false);
    limpiarError();
    setPin(prev => {
      const next = prev + digit;
      if (next.length === 4) {
        setTimeout(() => attemptPin(next), 80);
        return next;
      }
      return next;
    });
  }, []);

  const attemptPin = async (val: string) => {
    const ok = await loginPin(val);
    if (!ok) {
      setPinError(true);
      setTimeout(() => { setPin(''); setPinError(false); }, 600);
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginPassword(credentials.usuario, credentials.password);
  };

  const digits = ['1','2','3','4','5','6','7','8','9','C','0','⌫'];

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--color-bg)',
    }}>
      <div className="animate-fade-in" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 32, width: 420,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 80, lineHeight: 1, marginBottom: 8 }}>🍊</div>
          <h1 style={{
            fontSize: 26, fontWeight: 800,
            color: 'var(--color-primary)', letterSpacing: '-0.5px',
          }}>
            Paulín Premium Fruits
          </h1>
          <p style={{ color: 'var(--color-text-dim)', fontSize: 14, marginTop: 4 }}>
            Punto de Venta
          </p>
        </div>

        {!showPassword ? (
          /* PIN Mode */
          <div className="card" style={{ width: '100%', padding: 32 }}>
            <p style={{
              textAlign: 'center', fontSize: 15, fontWeight: 600,
              color: 'var(--color-text-muted)', marginBottom: 20,
            }}>
              Ingresa tu PIN
            </p>

            {/* PIN dots */}
            <div className={pinError ? 'animate-pin-shake' : ''}
              style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 24 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 22, height: 22, borderRadius: '50%',
                  border: `2.5px solid ${pinError ? 'var(--color-danger)' : 'var(--color-border-2)'}`,
                  background: i < pin.length
                    ? (pinError ? 'var(--color-danger)' : 'var(--color-primary)')
                    : 'transparent',
                  transition: 'all 0.1s',
                }} />
              ))}
            </div>

            {/* Error */}
            {(error || pinError) && (
              <p style={{
                color: 'var(--color-danger)', fontSize: 14,
                textAlign: 'center', marginBottom: 12,
              }}>
                {error || 'PIN incorrecto'}
              </p>
            )}

            {/* Pin pad */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 10, justifyItems: 'center',
            }}>
              {digits.map(d => (
                <button
                  key={d}
                  className="pin-key"
                  onClick={() => {
                    if (d === '⌫') { setPin(p => p.slice(0, -1)); setPinError(false); }
                    else if (d === 'C') { setPin(''); setPinError(false); }
                    else if (pin.length < 4) handlePinInput(d);
                  }}
                  disabled={cargando}
                  style={{
                    color: d === 'C' ? 'var(--color-warning)' : d === '⌫' ? 'var(--color-text-dim)' : undefined,
                  }}
                >
                  {d}
                </button>
              ))}
            </div>

            {cargando && (
              <p className="animate-pulse-soft" style={{
                color: 'var(--color-text-dim)', fontSize: 14,
                textAlign: 'center', marginTop: 16,
              }}>
                Verificando...
              </p>
            )}
          </div>
        ) : (
          /* Password Mode */
          <div className="card" style={{ width: '100%', padding: 32 }}>
            <form onSubmit={handlePasswordLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                  USUARIO
                </label>
                <input
                  className="input input-lg"
                  placeholder="nombre de usuario"
                  value={credentials.usuario}
                  onChange={e => setCredentials(c => ({ ...c, usuario: e.target.value }))}
                  autoFocus
                  autoComplete="username"
                />
              </div>
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6, display: 'block' }}>
                  CONTRASEÑA
                </label>
                <input
                  className="input input-lg"
                  type="password"
                  placeholder="••••••••"
                  value={credentials.password}
                  onChange={e => setCredentials(c => ({ ...c, password: e.target.value }))}
                  autoComplete="current-password"
                />
              </div>
              {error && (
                <p style={{ color: 'var(--color-danger)', fontSize: 14, textAlign: 'center' }}>{error}</p>
              )}
              <button
                className="btn btn-primary btn-lg"
                type="submit"
                disabled={cargando || !credentials.usuario || !credentials.password}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {cargando ? 'Verificando...' : 'Entrar'}
              </button>
            </form>
          </div>
        )}

        {/* Toggle */}
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowPassword(!showPassword)}
          style={{ fontSize: 13 }}
        >
          {showPassword ? '← Volver a PIN' : 'Entrar con usuario y contraseña'}
        </button>

        <p style={{ color: 'var(--color-text-dim)', fontSize: 12 }}>v0.2.0</p>
      </div>
    </div>
  );
}
