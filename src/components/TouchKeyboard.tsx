// components/TouchKeyboard.tsx — Teclado virtual táctil global para POS
// Se activa automáticamente al enfocar cualquier <input> o <textarea>
// Excluye: Login (PIN pad), NumpadModal, inputs con data-no-vkb

import { useState, useEffect, useRef, useCallback, createContext, useContext, type ReactNode } from 'react';

// ─── Layouts ───

const QWERTY_LOWER = [
  ['q','w','e','r','t','y','u','i','o','p'],
  ['a','s','d','f','g','h','j','k','l','ñ'],
  ['⇧','z','x','c','v','b','n','m','⌫'],
  ['123','espacio','.','Cerrar'],
];

const QWERTY_UPPER = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L','Ñ'],
  ['⇧','Z','X','C','V','B','N','M','⌫'],
  ['123','espacio','.','Cerrar'],
];

const SYMBOLS = [
  ['1','2','3','4','5','6','7','8','9','0'],
  ['@','#','$','%','&','-','_','(',')','/',],
  ['!','?',',','.',':',';','"','\'','+','='],
  ['ABC','espacio','Cerrar'],
];

const NUMERIC = [
  ['1','2','3'],
  ['4','5','6'],
  ['7','8','9'],
  ['.','0','⌫'],
];

type LayoutMode = 'qwerty' | 'symbols' | 'numeric';

// ─── Context ───

interface VKBContextType {
  isVisible: boolean;
}

const VKBContext = createContext<VKBContextType>({ isVisible: false });

export function useVKB() {
  return useContext(VKBContext);
}

// ─── Helper: set native input value ───
// React overrides the setter, so we need to use the native one to trigger onChange

function setNativeValue(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const nativeSetter =
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value'
    )?.set;

  if (nativeSetter) {
    nativeSetter.call(input, value);
  } else {
    // Fallback
    (input as any).value = value;
  }

  // Dispatch input event so React picks it up
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

// ─── Types for excluded inputs ───
const EXCLUDED_INPUT_TYPES = new Set(['checkbox', 'radio', 'file', 'color', 'range', 'date', 'datetime-local', 'month', 'week', 'time']);

function shouldShowKeyboard(el: HTMLElement): boolean {
  // Must be an input or textarea
  if (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA') return false;

  // Check data-no-vkb attribute
  if (el.hasAttribute('data-no-vkb')) return false;

  // Check if inside a numpad modal (already has its own keyboard)
  if (el.closest('.numpad-modal-content')) return false;

  // Check excluded input types
  if (el.tagName === 'INPUT') {
    const type = (el as HTMLInputElement).type.toLowerCase();
    if (EXCLUDED_INPUT_TYPES.has(type)) return false;
  }

  return true;
}

function isNumericInput(el: HTMLElement): boolean {
  if (el.tagName !== 'INPUT') return false;
  const input = el as HTMLInputElement;
  return input.type === 'number' || input.inputMode === 'numeric';
}

// ─── Provider Component ───

export function TouchKeyboardProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('qwerty');
  const [shifted, setShifted] = useState(false);
  const activeInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const keyboardRef = useRef<HTMLDivElement>(null);
  const isClosingRef = useRef(false);

  // Listen for focus events globally
  useEffect(() => {
    const handleFocusIn = (e: FocusEvent) => {
      if (isClosingRef.current) return;
      const target = e.target as HTMLElement;
      if (!target) return;

      if (shouldShowKeyboard(target)) {
        activeInputRef.current = target as HTMLInputElement | HTMLTextAreaElement;
        const isNum = isNumericInput(target);
        setLayoutMode(isNum ? 'numeric' : 'qwerty');
        setShifted(false);
        setVisible(true);

        // Scroll input into view after keyboard appears
        setTimeout(() => {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 200);
      }
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => document.removeEventListener('focusin', handleFocusIn);
  }, []);

  // Close keyboard when clicking outside of input and keyboard
  useEffect(() => {
    if (!visible) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      // If clicking inside keyboard, don't close
      if (keyboardRef.current?.contains(target)) return;
      // If clicking another input, let focusin handle it
      if (shouldShowKeyboard(target)) return;
      // Close keyboard
      closeKeyboard();
    };

    // Small delay to avoid catching the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDown);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [visible]);

  const closeKeyboard = useCallback(() => {
    isClosingRef.current = true;
    setVisible(false);
    if (activeInputRef.current) {
      activeInputRef.current.blur();
    }
    activeInputRef.current = null;
    // Reset closing flag after a brief delay
    setTimeout(() => { isClosingRef.current = false; }, 300);
  }, []);

  // For type="number" inputs, selectionStart/End are not supported
  // so we need a different strategy (append/remove from end)
  const isNumberType = useCallback((el: HTMLInputElement | HTMLTextAreaElement) => {
    return el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'number';
  }, []);

  const handleKey = useCallback((key: string) => {
    const input = activeInputRef.current;
    if (!input) return;

    // Prevent input from losing focus
    input.focus();

    const numberMode = isNumberType(input);

    switch (key) {
      case '⌫': {
        if (numberMode) {
          // For number inputs: just remove last character
          const newVal = input.value.slice(0, -1);
          setNativeValue(input, newVal);
        } else {
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          if (start !== end) {
            const newVal = input.value.slice(0, start) + input.value.slice(end);
            setNativeValue(input, newVal);
            setTimeout(() => input.setSelectionRange(start, start), 0);
          } else if (start > 0) {
            const newVal = input.value.slice(0, start - 1) + input.value.slice(start);
            setNativeValue(input, newVal);
            setTimeout(() => input.setSelectionRange(start - 1, start - 1), 0);
          }
        }
        break;
      }

      case '⇧':
        setShifted(s => !s);
        return; // Don't reset shift

      case 'espacio': {
        if (numberMode) break; // No spaces in number inputs
        const start = input.selectionStart ?? input.value.length;
        const end = input.selectionEnd ?? input.value.length;
        const newVal = input.value.slice(0, start) + ' ' + input.value.slice(end);
        setNativeValue(input, newVal);
        setTimeout(() => input.setSelectionRange(start + 1, start + 1), 0);
        break;
      }

      case 'Cerrar':
        closeKeyboard();
        return;

      case '123':
        setLayoutMode('symbols');
        return;

      case 'ABC':
        setLayoutMode('qwerty');
        return;

      default: {
        if (numberMode) {
          // For number inputs: only allow digits and one dot
          if (key === '.' && input.value.includes('.')) break;
          if (!'0123456789.'.includes(key)) break;
          const newVal = input.value + key;
          setNativeValue(input, newVal);
        } else {
          // Insert character at cursor position
          const start = input.selectionStart ?? input.value.length;
          const end = input.selectionEnd ?? input.value.length;
          const newVal = input.value.slice(0, start) + key + input.value.slice(end);
          setNativeValue(input, newVal);
          setTimeout(() => input.setSelectionRange(start + 1, start + 1), 0);
        }
        // Reset shift after typing a letter
        if (shifted && layoutMode === 'qwerty') setShifted(false);
        break;
      }
    }
  }, [shifted, layoutMode, closeKeyboard, isNumberType]);

  // Determine which layout to render
  let rows: string[][];
  if (layoutMode === 'numeric') {
    rows = NUMERIC;
  } else if (layoutMode === 'symbols') {
    rows = SYMBOLS;
  } else {
    rows = shifted ? QWERTY_UPPER : QWERTY_LOWER;
  }

  return (
    <VKBContext.Provider value={{ isVisible: visible }}>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
        {/* Main content — shrinks when keyboard is visible */}
        <div style={{
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          transition: 'flex 0.25s ease',
        }}>
          {children}
        </div>

        {/* Virtual Keyboard */}
        <div
          ref={keyboardRef}
          className={`vkb-container ${visible ? 'vkb-visible' : ''}`}
          onPointerDown={(e) => {
            // Prevent keyboard clicks from stealing focus from input
            e.preventDefault();
          }}
        >
          {visible && (
            <div className={`vkb-keyboard ${layoutMode === 'numeric' ? 'vkb-numeric' : 'vkb-full'}`}>
              {/* Drag handle / indicator */}
              <div className="vkb-handle">
                <div className="vkb-handle-bar" />
              </div>

              {rows.map((row, ri) => (
                <div key={ri} className="vkb-row">
                  {row.map((key) => {
                    let className = 'vkb-key';

                    if (key === 'espacio') {
                      className += ' vkb-key-space';
                    } else if (key === '⌫') {
                      className += ' vkb-key-action vkb-key-backspace';
                    } else if (key === '⇧') {
                      className += ' vkb-key-action';
                      if (shifted) className += ' vkb-key-active';
                    } else if (key === 'Cerrar') {
                      className += ' vkb-key-close';
                    } else if (key === '123' || key === 'ABC') {
                      className += ' vkb-key-mode';
                    }

                    return (
                      <button
                        key={`${ri}-${key}`}
                        className={className}
                        onClick={() => handleKey(key)}
                        type="button"
                      >
                        {key === 'espacio' ? '␣' : key}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </VKBContext.Provider>
  );
}
