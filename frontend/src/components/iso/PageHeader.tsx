// Form sayfalarinin ust basligi (Unity tasarimi): kirmizi form kodu, italik buyuk baslik, egik seritler.
import type { ReactNode } from "react";
import { Seritler } from "@/components/marka/Marka";

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="relative overflow-hidden border-b border-tas-200 bg-white px-8 pb-6 pt-8">
      <Seritler className="absolute -right-6 top-7 w-48" kalinliklar={[9, 4]} bosluk={4} />
      <div className="relative flex flex-wrap items-end justify-between gap-4 pr-40">
        <div>
          {eyebrow && (
            <div className="font-display text-sm font-semibold uppercase tracking-[0.18em] text-unity">{eyebrow}</div>
          )}
          <h1 className="mt-0.5 font-display text-4xl font-bold italic tracking-tight text-murekkep">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-tas-500">{description}</p>}
        </div>
        {children}
      </div>
    </header>
  );
}
