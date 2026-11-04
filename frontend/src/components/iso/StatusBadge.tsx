// Onay durumu rozeti: Bekliyor / Askida / Onaylandi / Reddedildi
import { Check, Clock, PauseCircle, X } from "lucide-react";
import type { Status } from "@/lib/iso-data";
import { ONAY_ADI, type OnayDurum } from "@/lib/onay";
import { cn } from "@/lib/utils";

const ETIKETTEN: Record<Status, OnayDurum> = {
  Bekliyor: "BEKLIYOR",
  "Askıda": "ASKIDA",
  "Onaylandı": "ONAYLANDI",
  Reddedildi: "REDDEDILDI",
};

const GORUNUM: Record<OnayDurum, { sinif: string; Ikon: typeof Check }> = {
  BEKLIYOR: { sinif: "bg-tas-100 text-tas-600", Ikon: Clock },
  ASKIDA: { sinif: "bg-dikkat-acik text-dikkat", Ikon: PauseCircle },
  ONAYLANDI: { sinif: "bg-uygun-acik text-uygun", Ikon: Check },
  REDDEDILDI: { sinif: "bg-sorun-acik text-unity-koyu", Ikon: X },
};

export function OnayRozeti({ durum, className }: { durum: OnayDurum; className?: string }) {
  const { sinif, Ikon } = GORUNUM[durum];
  return (
    <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", sinif, className)}>
      <Ikon className="h-3 w-3" />
      {ONAY_ADI[durum]}
    </span>
  );
}

// Eski formlarin kullandigi (Turkce etiketli) surum
export function StatusBadge({ status }: { status: Status }) {
  return <OnayRozeti durum={ETIKETTEN[status] || "BEKLIYOR"} />;
}
