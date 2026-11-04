// Onay dugmeleri: Onayla / Askiya al / Reddet. Yalnizca kayit size atanmissa gorunur.
// Askiya alma ve red icin aciklama zorunlu; karar, kimin verdigiyle birlikte kaydedilir.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, PauseCircle, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, hataMesaji } from "@/lib/api";
import { useOturum } from "@/lib/oturum";
import { KARAR_ACIKLAMASI, ONAY_ADI, type OnayDurum, type OnayOzet, type OnayTuru } from "@/lib/onay";
import { cn } from "@/lib/utils";

const ACIK: OnayDurum[] = ["BEKLIYOR", "ASKIDA"];

// Bu onayda karar verme sirasi bu kullanicida mi?
export function benimOnayim(onay: OnayOzet | null | undefined, kullaniciId?: string) {
  return !!onay && !!kullaniciId && onay.atananId === kullaniciId && ACIK.includes(onay.durum);
}

export function OnayIslemleri({
  onay,
  tur,
  kayitNo,
  kucuk = false,
}: {
  onay: OnayOzet;
  tur: OnayTuru;
  kayitNo: string;
  kucuk?: boolean;
}) {
  const oturum = useOturum();
  const qc = useQueryClient();
  const [secim, setSecim] = useState<OnayDurum | null>(null);
  const [not, setNot] = useState("");

  const karar = useMutation({
    mutationFn: () => api(`/onaylar/${onay.id}/karar`, { govde: { durum: secim, not: not.trim() || undefined } }),
    onSuccess: () => {
      toast.success(`${kayitNo} → ${ONAY_ADI[secim!]}`);
      setSecim(null);
      setNot("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "Karar kaydedilemedi.")),
  });

  if (!benimOnayim(onay, oturum?.kullanici.id)) return null;

  const notZorunlu = secim === "ASKIDA" || secim === "REDDEDILDI";
  const aciklama = secim ? KARAR_ACIKLAMASI[tur]?.[secim] : undefined;

  const dugme = (d: OnayDurum, etiket: string, Ikon: typeof Check, sinif: string) => (
    <Button
      size="sm"
      variant="outline"
      onClick={(e) => {
        e.stopPropagation();
        setSecim(d);
      }}
      title={KARAR_ACIKLAMASI[tur]?.[d] || etiket}
      className={cn("h-8 gap-1 px-2.5", sinif)}
    >
      <Ikon className="h-3.5 w-3.5" />
      {!kucuk && etiket}
    </Button>
  );

  return (
    <>
      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        {dugme("ONAYLANDI", "Onayla", Check, "border-uygun/40 bg-uygun text-white hover:bg-uygun/90 hover:text-white")}
        {onay.durum !== "ASKIDA" && dugme("ASKIDA", "Askıya al", PauseCircle, "border-dikkat/40 text-dikkat hover:bg-dikkat-acik hover:text-dikkat")}
        {dugme("REDDEDILDI", "Reddet", X, "border-unity/40 text-unity hover:bg-unity-acik hover:text-unity-koyu")}
      </div>

      <Dialog open={!!secim} onOpenChange={(o) => !o && !karar.isPending && setSecim(null)}>
        <DialogContent onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-bold italic">
              {kayitNo} · {secim ? ONAY_ADI[secim] : ""}
            </DialogTitle>
            <DialogDescription>
              {aciklama ? `${aciklama}. ` : ""}Kararınız adınız ve saatiyle kayda geçer, sonradan silinemez.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            autoFocus
            rows={3}
            placeholder={notZorunlu ? "Açıklama (zorunlu)" : "Açıklama (isteğe bağlı)"}
            value={not}
            onChange={(e) => setNot(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSecim(null)} disabled={karar.isPending}>
              Vazgeç
            </Button>
            <Button
              onClick={() => karar.mutate()}
              disabled={karar.isPending || (notZorunlu && !not.trim())}
              className={cn(
                secim === "ONAYLANDI" && "bg-uygun hover:bg-uygun/90",
                secim === "ASKIDA" && "bg-dikkat hover:bg-dikkat/90",
                secim === "REDDEDILDI" && "bg-unity hover:bg-unity-koyu",
              )}
            >
              {karar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Kararı kaydet
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
