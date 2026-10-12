'use client';

import { useEffect } from 'react';

/** Bottom sheet shell matching the name sheet: scrim, cream panel, grab handle. */
export function Sheet({
  title,
  kicker,
  onClose,
  children,
}: {
  title: string;
  kicker?: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center bg-[rgba(29,35,38,0.45)]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[88vh] w-full max-w-[480px] flex-col gap-[18px] overflow-auto rounded-t-[24px] bg-surface px-5 pt-2.5 pb-7">
        <span className="h-[5px] w-10 self-center rounded-full bg-field" />
        <div className="flex flex-col gap-1.5">
          {kicker && <span className="text-[13px] font-semibold text-subtle">{kicker}</span>}
          <h2 className="display m-0 text-[28px] leading-[1.05] font-extrabold tracking-[-0.025em]">{title}</h2>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Choice({
  on,
  onClick,
  label,
  sub,
  right,
}: {
  on: boolean;
  onClick: () => void;
  label: React.ReactNode;
  sub?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <button
      role="radio"
      aria-checked={on}
      onClick={onClick}
      className={`flex min-h-[52px] items-center gap-3 rounded-[14px] border-[1.5px] bg-white px-3.5 py-2 text-left text-ink ${on ? 'border-ink' : 'border-line hover:border-field'}`}
    >
      <span className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border-[1.5px] ${on ? 'border-ink' : 'border-field'}`}>
        {on && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className="text-[15px] font-semibold">{label}</span>
        {sub && <span className="text-[13px] text-muted">{sub}</span>}
      </span>
      {right}
    </button>
  );
}
