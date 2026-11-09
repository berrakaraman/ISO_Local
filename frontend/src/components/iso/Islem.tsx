// Yeni sayfalarin ortak parcalari: islem formu (gonder + bildirim + listeleri yenile), basit tablo, sekme.
import { useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { hataMesaji } from "@/lib/api";
import { cn } from "@/lib/utils";

// Bir islemi calistirir; basarida bildirim gosterir ve tum listeleri yeniler.
export function useIslem<T = any>(fn: () => Promise<T>, { basari, sonra }: { basari?: string | ((c: T) => string); sonra?: (c: T) => void } = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (c) => {
      if (basari) toast.success(typeof basari === "function" ? basari(c) : basari);
      qc.invalidateQueries();
      sonra?.(c);
    },
    onError: (e) => toast.error(hataMesaji(e, "İşlem yapılamadı.")),
  });
}

// Cerceveli islem formu: baslik, aciklama, alanlar, gonder dugmesi
export function IslemFormu({
  baslik, aciklama, children, dugme, devreDisi, bekliyor, onGonder, className,
}: {
  baslik: ReactNode; aciklama?: ReactNode; children: ReactNode; dugme: string; devreDisi?: boolean; bekliyor?: boolean; onGonder: () => void; className?: string;
}) {
  const gonder = (e: FormEvent) => {
    e.preventDefault();
    if (!devreDisi && !bekliyor) onGonder();
  };
  return (
    <form onSubmit={gonder} className={cn("space-y-3 rounded-xl border border-tas-200 bg-white p-4", className)}>
      <div>
        <div className="font-display text-lg font-bold text-murekkep">{baslik}</div>
        {aciklama && <p className="mt-0.5 text-sm text-tas-500">{aciklama}</p>}
      </div>
      {children}
      <Button type="submit" disabled={devreDisi || bekliyor} className="bg-unity font-semibold hover:bg-unity-koyu">
        {bekliyor && <Loader2 className="h-4 w-4 animate-spin" />}
        {dugme}
      </Button>
    </form>
  );
}

export type Sutun<T> = { baslik: string; hucre: (r: T) => ReactNode; sag?: boolean; className?: string };

export function Tablo<T>({ satirlar, sutunlar, anahtar, bos = "Kayıt yok.", yukleniyor, satirSinifi }: {
  satirlar?: T[]; sutunlar: Sutun<T>[]; anahtar: (r: T) => string; bos?: string; yukleniyor?: boolean; satirSinifi?: (r: T) => string | undefined;
}) {
  if (yukleniyor) return <Loader2 className="mx-auto my-6 h-5 w-5 animate-spin text-tas-400" />;
  if (!satirlar?.length) return <p className="py-4 text-sm text-tas-400">{bos}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-tas-200 text-left text-[11px] uppercase tracking-wider text-tas-400">
            {sutunlar.map((s) => (
              <th key={s.baslik} className={cn("whitespace-nowrap px-2 py-2 font-semibold", s.sag && "text-right")}>
                {s.baslik}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-tas-100">
          {satirlar.map((r) => (
            <tr key={anahtar(r)} className={cn("align-top", satirSinifi?.(r))}>
              {sutunlar.map((s) => (
                <td key={s.baslik} className={cn("px-2 py-2", s.sag && "sayi text-right", s.className)}>
                  {s.hucre(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Basit sekmeler (URL'ye yazilmaz)
export function Sekmeler<K extends string>({ sekmeler, children }: { sekmeler: { k: K; ad: string; sayi?: number }[]; children: (k: K) => ReactNode }) {
  const [aktif, setAktif] = useState<K>(sekmeler[0].k);
  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-1 border-b border-tas-200">
        {sekmeler.map((s) => (
          <button
            key={s.k}
            type="button"
            onClick={() => setAktif(s.k)}
            className={cn(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold transition",
              aktif === s.k ? "border-unity text-murekkep" : "border-transparent text-tas-500 hover:text-murekkep",
            )}
          >
            {s.ad}
            {!!s.sayi && <span className="rounded-full bg-unity px-1.5 text-[10px] font-bold text-white">{s.sayi}</span>}
          </button>
        ))}
      </div>
      {children(aktif)}
    </div>
  );
}

// Ondalik virgulu noktaya cevirir (backend iki bicimi de kabul eder ama bos degeri ayirmak icin)
export const nokta = (s?: string) => (s ?? "").replace(",", ".").trim();
export const sayiMi = (s?: string) => nokta(s) !== "" && Number.isFinite(Number(nokta(s)));
