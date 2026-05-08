// components/Numpad.tsx — Teclado numérico táctil reutilizable
// Usado en: cobro, ajuste de stock, cantidad de merma/entradas, peso

import { useState, useCallback } from 'react';

interface NumpadProps {
  value: string;
  onChange: (value: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  prefix?: string;       // "$" o ""
  suffix?: string;       // "kg" o "pz"
  allowDecimal?: boolean;
  maxLength?: number;
  confirmLabel?: string;
  confirmColor?: string; // CSS color for confirm button
}

export default function Numpad({
  value,
  onChange,
  onConfirm,
  onCancel,
  prefix = '$',
  suffix,
  allowDecimal = true,
  maxLength = 10,
  confirmLabel = 'Confirmar',
  confirmColor,
}: NumpadProps) {

  const handleDigit = useCallback((digit: string) => {
    if (value.length >= maxLength) return;
    // Prevent leading zeros (except "0.")
    if (value === '0' && digit !== '.') {
      onChange(digit);
      return;
    }
    onChange(value + digit);
  }, [value, maxLength, onChange]);

  const handleDot = useCallback(() => {
    if (!allowDecimal) return;
    if (value.includes('.')) return;
    onChange(value === '' ? '0.' : value + '.');
  }, [value, allowDecimal, onChange]);

  const handleBackspace = useCallback(() => {
    onChange(value.slice(0, -1));
  }, [value, onChange]);

  const handleClear = useCallback(() => {
    onChange('');
  }, [onChange]);

  const displayValue = value || '0';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      {/* Display */}
      <div style={{
        width: '100%', padding: '16px 20px',
        background: 'var(--color-surface-2)', borderRadius: 'var(--radius-lg)',
        textAlign: 'center',
      }}>
        <div className="mono" style={{
          fontSize: 42, fontWeight: 800, color: 'var(--color-text)',
          letterSpacing: '-1px',
        }}>
          {prefix && <span style={{ color: 'var(--color-text-dim)', fontSize: 28 }}>{prefix}</span>}
          {displayValue}
          {suffix && <span style={{ color: 'var(--color-text-dim)', fontSize: 18, marginLeft: 4 }}>{suffix}</span>}
        </div>
      </div>

      {/* Keys */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {['1','2','3','4','5','6','7','8','9'].map(d => (
          <button key={d} className="numpad-key" onClick={() => handleDigit(d)}>
            {d}
          </button>
        ))}
        <button
          className={`numpad-key ${allowDecimal ? '' : 'numpad-key-danger'}`}
          onClick={allowDecimal ? handleDot : handleClear}
          style={!allowDecimal ? { fontSize: 16 } : undefined}
        >
          {allowDecimal ? '.' : 'C'}
        </button>
        <button className="numpad-key" onClick={() => handleDigit('0')}>
          0
        </button>
        <button className="numpad-key numpad-key-danger" onClick={handleBackspace}
          style={{ fontSize: 20 }}>
          ⌫
        </button>
      </div>

      {/* Actions */}
      {allowDecimal && (
        <button
          className="btn btn-ghost btn-sm"
          onClick={handleClear}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          Borrar todo
        </button>
      )}

      <div style={{ display: 'flex', gap: 8, width: '100%' }}>
        {onCancel && (
          <button className="btn btn-ghost btn-lg" style={{ flex: 1 }} onClick={onCancel}>
            Cancelar
          </button>
        )}
        {onConfirm && (
          <button
            className="btn btn-lg"
            style={{
              flex: 2,
              background: confirmColor || 'var(--color-primary)',
              color: '#fff',
              fontWeight: 700,
            }}
            onClick={onConfirm}
            disabled={!value || value === '0' || value === '0.'}
          >
            {confirmLabel}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Quick Numpad Modal ───
// Wrapper modal que abre el numpad con overlay
interface NumpadModalProps extends Omit<NumpadProps, 'value' | 'onChange'> {
  title?: string;
  initialValue?: string;
  onDone: (value: number) => void;
  onClose: () => void;
}

export function NumpadModal({
  title,
  initialValue = '',
  onDone,
  onClose,
  ...numpadProps
}: NumpadModalProps) {
  const [val, setVal] = useState(initialValue);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card animate-scale-in" style={{
        width: 320, padding: 24, maxHeight: '90vh', overflow: 'auto',
      }} onClick={e => e.stopPropagation()}>
        {title && (
          <h3 style={{ fontSize: 16, fontWeight: 700, textAlign: 'center', marginBottom: 12 }}>
            {title}
          </h3>
        )}
        <Numpad
          value={val}
          onChange={setVal}
          onConfirm={() => {
            const n = parseFloat(val);
            if (!isNaN(n) && n > 0) onDone(n);
          }}
          onCancel={onClose}
          {...numpadProps}
        />
      </div>
    </div>
  );
}
