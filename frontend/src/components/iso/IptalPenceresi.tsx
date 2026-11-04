// Iptal penceresi: sistemde hicbir kayit silinmez. Iptal edilen kayit listede kalir,
// ustu cizili gorunur; kim, ne zaman, hangi gerekceyle iptal ettigi saklanir.
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api, hataMesaji } from "@/lib/api";

export function IptalPenceresi({
  kayitNo,
  yol,
  acik,
  kapat,
}: {
  kayitNo: string;
  yol: string; // ornek: /hammadde/lotlar/RM-2610-0001/iptal
  acik: boolean;
  kapat: () => void;
}) {
  const qc = useQueryClient();
  const [gerekce, setGerekce] = useState("");
  const iptal = useMutation({
    mutationFn: () => api(yol, { govde: { gerekce: gerekce.trim() } }),
    onSuccess: () => {
      toast.success(`${kayitNo} iptal edildi. Kayıt silinmedi, listede iptal olarak duruyor.`);
      setGerekce("");
      kapat();
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(hataMesaji(e, "İptal edilemedi.")),
  });
  const yeterli = gerekce.trim().length >= 5;

  return (
    <Dialog open={acik} onOpenChange={(o) => !o && !iptal.isPending && kapat()}>
      <DialogContent onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display text-2xl font-bold italic">
            <Ban className="h-5 w-5 text-unity" /> {kayitNo} iptal edilsin mi?
          </DialogTitle>
          <DialogDescription>
            Kayıt silinmez. Listede “iptal edildi” olarak kalır; adınız, saat ve gerekçe kayda geçer. Bu işlem geri alınamaz.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={3}
          placeholder="İptal gerekçesi (zorunlu, en az 5 karakter)"
          value={gerekce}
          onChange={(e) => setGerekce(e.target.value)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={kapat} disabled={iptal.isPending}>
            Vazgeç
          </Button>
          <Button onClick={() => iptal.mutate()} disabled={!yeterli || iptal.isPending} className="bg-unity hover:bg-unity-koyu">
            {iptal.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
            İptal et
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
