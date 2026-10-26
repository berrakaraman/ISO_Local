import type { ReactNode } from "react";
export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b bg-card px-8 py-6 bg-white">
      <div>
        {eyebrow && <div className="font-mono text-xs font-medium uppercase tracking-widest text-blue-600">{eyebrow}</div>}
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {children}
    </header>
  );
}
