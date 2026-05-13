// pages/Login.tsx — Pantalla de login táctil (PIN circular moderno)

import { useState, useEffect, useCallback } from 'react';
import logoPaulin from '../assets/LOGO PAULIN.svg';
import { useAuthStore } from '../store/authStore';

export default function Login() {
  const { loginPin, cargando, error, limpiarError } = useAuthStore();
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    import('@tauri-apps/api/app').then(m => m.getVersion()).then(setAppVersion).catch(() => {});
  }, []);

  // Keyboard support
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handlePinInput(e.key);
      else if (e.key === 'Backspace') { setPin(p => p.slice(0, -1)); setPinError(false); }
      else if (e.key === 'Escape') { setPin(''); setPinError(false); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [pin]);

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

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', background: 'var(--color-bg)',
    }}>
      <div className="animate-fade-in" style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        gap: 40, width: 440,
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center' }}>
          <img src={logoPaulin} alt="Paulín Premium Fruits" style={{ width: 300, height: 'auto' }} />
          <p style={{
            color: 'var(--color-text-dim)', fontSize: 13, marginTop: 10,
            fontWeight: 500, letterSpacing: 2, textTransform: 'uppercase',
          }}>
            Punto de Venta
          </p>
        </div>

        {/* PIN section */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: 28, width: '100%',
        }}>
          {/* PIN dots + label */}
          <div style={{ textAlign: 'center' }}>
            <div className={pinError ? 'animate-pin-shake' : ''}
              style={{ display: 'flex', justifyContent: 'center', gap: 20, marginBottom: 12 }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: `2.5px solid ${pinError ? 'var(--color-danger)' : pin.length > i ? 'var(--color-primary)' : 'var(--color-border-2)'}`,
                  background: i < pin.length
                    ? (pinError ? 'var(--color-danger)' : 'var(--color-primary)')
                    : 'transparent',
                  transition: 'all 0.15s ease',
                  transform: i < pin.length ? 'scale(1.1)' : 'scale(1)',
                }} />
              ))}
            </div>
            <p style={{
              fontSize: 14, fontWeight: 600,
              color: pinError ? 'var(--color-danger)' : 'var(--color-text-dim)',
              transition: 'color 0.15s',
              minHeight: 21,
            }}>
              {cargando ? 'Verificando...' : (error || pinError) ? (error || 'PIN incorrecto') : 'Ingresa tu PIN'}
            </p>
          </div>

          {/* Pin pad — circular */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 88px)',
            gap: 14, justifyContent: 'center',
          }}>
            {['1','2','3','4','5','6','7','8','9'].map(d => (
              <button
                key={d}
                className="pin-key"
                onClick={() => pin.length < 4 && handlePinInput(d)}
                disabled={cargando}
              >
                {d}
              </button>
            ))}
            {/* Bottom row: Clear, 0, Backspace */}
            <button
              className="pin-key pin-key-clear"
              onClick={() => { setPin(''); setPinError(false); }}
              disabled={cargando}
            >
              C
            </button>
            <button
              className="pin-key"
              onClick={() => pin.length < 4 && handlePinInput('0')}
              disabled={cargando}
            >
              0
            </button>
            <button
              className="pin-key pin-key-back"
              onClick={() => { setPin(p => p.slice(0, -1)); setPinError(false); }}
              disabled={cargando}
            >
              ⌫
            </button>
          </div>
        </div>

        {/* Version */}
        <p style={{ color: 'var(--color-text-dim)', fontSize: 12, fontWeight: 500 }}>
          v{appVersion || '...'}
        </p>
      </div>
    </div>
  );
}
