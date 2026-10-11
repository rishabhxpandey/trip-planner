'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type Toast = { id: number; msg: string; label?: string; action?: () => void };
type ShowToast = (msg: string, action?: () => void, label?: string) => void;

const Ctx = createContext<ShowToast>(() => {});

export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback<ShowToast>((msg, action, label) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), msg, action, label: action ? (label ?? 'Undo') : undefined });
    timer.current = setTimeout(() => setToast(null), 4500);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <Ctx.Provider value={show}>
      {children}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-30 flex min-h-[52px] w-[calc(100%-40px)] max-w-[440px] -translate-x-1/2 items-center justify-between gap-3 rounded-[14px] bg-ink py-1.5 pr-1.5 pl-4 text-[15px] text-surface shadow-toast"
        >
          <span className="py-2">{toast.msg}</span>
          {toast.action && (
            <button
              onClick={() => {
                const fn = toast.action;
                setToast(null);
                fn?.();
              }}
              className="h-10 flex-none rounded-[10px] bg-accent px-3.5 text-sm font-bold text-ink"
            >
              {toast.label}
            </button>
          )}
        </div>
      )}
    </Ctx.Provider>
  );
}
