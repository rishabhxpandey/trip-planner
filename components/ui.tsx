import { Lock } from 'lucide-react';
import { initialOf, personColor } from '@/lib/trip-derive';

export function LogoMark({ size = 22 }: { size?: number }) {
  const dot = Math.round(size * 0.36);
  return (
    <span
      className="flex flex-none items-center justify-center rounded-[6px] bg-ink"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span className="rounded-full bg-accent" style={{ width: dot, height: dot }} />
    </span>
  );
}

export function LockIcon({ size = 12, className = 'text-teal' }: { size?: number; className?: string }) {
  return <Lock size={size} strokeWidth={2.4} className={className} aria-label="Locked with Google" />;
}

/** Circle-slash veto mark (matches the prototype stroke). */
export function VetoIcon({ size = 15, strokeWidth = 2.4 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.7 5.7 12.6 12.6" />
    </svg>
  );
}

export function Avatar({
  name,
  hue,
  size = 34,
  className = '',
  style,
}: {
  name: string;
  hue: number;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  const c = personColor(hue);
  return (
    <span
      title={name}
      className={`flex flex-none items-center justify-center rounded-full font-bold ${className}`}
      style={{ width: size, height: size, background: c.bg, color: c.fg, fontSize: size >= 36 ? 14 : 13, ...style }}
    >
      {initialOf(name)}
    </span>
  );
}

export function PersonChip({ name, hue, className = 'h-[26px] px-[9px] text-xs' }: { name: string; hue: number; className?: string }) {
  const c = personColor(hue);
  return (
    <span className={`flex items-center rounded-full font-semibold ${className}`} style={{ background: c.bg, color: c.fg }}>
      {name}
    </span>
  );
}

export function GoogleButton({ label, onClick, className = '' }: { label: string; onClick: () => void; className?: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-[50px] items-center justify-center gap-2.5 rounded-xl border-[1.5px] border-ink bg-white text-[15px] font-bold text-ink ${className}`}
    >
      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-ink text-xs font-extrabold">G</span>
      <span>{label}</span>
    </button>
  );
}
