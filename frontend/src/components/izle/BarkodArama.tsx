// Barkod arama kutusu: el okuyucu ile okutulabilir (okuyucu yazip Enter'a basar) ya da elle yazilir.
// QR'dan gelen tam adres (http://.../b/FG-2610-0001-01) yapistirilirsa da numarayi ayiklar.
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils";

export function barkodAyikla(ham: string) {
  let s = ham.trim();
  const i = s.lastIndexOf("/b/");
  if (i >= 0) s = s.slice(i + 3);
  return s.split(/[?#]/)[0].trim().toLocaleUpperCase("en");
}

export function BarkodArama({ buyuk = false, otomatikOdak = false, className }: { buyuk?: boolean; otomatikOdak?: boolean; className?: string }) {
  const nav = useNavigate();
  const [deger, setDeger] = useState("");

  const git = (e: React.FormEvent) => {
    e.preventDefault();
    const b = barkodAyikla(deger);
    if (!b) return;
    setDeger("");
    nav({ to: "/izle/$barkod", params: { barkod: b } });
  };

  return (
    <form onSubmit={git} className={cn("relative", className)}>
      <ScanBarcode
        className={cn("pointer-events-none absolute top-1/2 -translate-y-1/2 text-tas-400", buyuk ? "left-5 h-6 w-6" : "left-3.5 h-[18px] w-[18px]")}
      />
      <input
        value={deger}
        onChange={(e) => setDeger(e.target.value)}
        autoFocus={otomatikOdak}
        spellCheck={false}
        autoComplete="off"
        placeholder={buyuk ? "Barkodu okutun ya da numarayı yazın…" : "Barkod okut / ara"}
        aria-label="Barkod"
        className={cn(
          "w-full rounded-xl border border-tas-200 bg-white font-mono text-murekkep outline-none transition placeholder:font-sans placeholder:text-tas-300 focus:border-unity focus:ring-4 focus:ring-unity/10",
          buyuk ? "h-16 pl-14 pr-36 text-lg" : "h-10 pl-10 pr-10 text-sm",
        )}
      />
      {buyuk ? (
        <button
          type="submit"
          className="absolute right-2 top-1/2 flex h-12 -translate-y-1/2 items-center gap-2 rounded-lg bg-unity px-5 font-display text-base font-bold uppercase italic tracking-wide text-white transition hover:bg-unity-koyu"
        >
          Göster <ArrowRight className="h-4 w-4" />
        </button>
      ) : (
        <button type="submit" className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-tas-400 hover:bg-tas-100 hover:text-unity" aria-label="Ara">
          <ArrowRight className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}
