import Link from 'next/link';
import { LogoMark } from './ui';

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-6 px-5 pt-5 pb-12">
      <Link href="/" className="display flex items-center gap-2 text-xl font-extrabold tracking-[-0.02em] text-ink no-underline hover:text-ink">
        <LogoMark />
        <span>Outward</span>
      </Link>
      <div className="flex flex-col gap-1.5">
        <h1 className="display m-0 text-[34px] leading-[1.02] font-extrabold tracking-[-0.03em]">{title}</h1>
        <span className="text-sm text-subtle">Last updated {updated}</span>
      </div>
      <div className="flex flex-col gap-4 text-base leading-normal text-pretty [&_h2]:display [&_h2]:m-0 [&_h2]:pt-2 [&_h2]:text-[19px] [&_h2]:font-bold [&_li]:ml-5 [&_li]:list-disc [&_p]:m-0 [&_ul]:m-0 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5 [&_ul]:p-0">
        {children}
      </div>
    </div>
  );
}
