import { useState } from "react";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { actions } from "@/lib/store";
import type { Status } from "@/lib/iso-data";

export function DecisionActions({ table, id, label }: { table: string; id: string; label: string }) {
  const [pending, setPending] = useState<Status | null>(null);
  const [note, setNote] = useState("");

  const confirm = () => {
    if (!pending) return;
    if (pending === "Reddedildi" && !note.trim()) {
      toast.error("Red için açıklama zorunludur.");
      return;
    }
    actions.decide(table, id, pending, note.trim());
    toast.success(`${label} → ${pending}`);
    setPending(null);
    setNote("");
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => setPending("Onaylandı")}><Check className="h-3.5 w-3.5 mr-1" /> Onayla</Button>
        <Button size="sm" variant="destructive" onClick={() => setPending("Reddedildi")}><X className="h-3.5 w-3.5 mr-1" /> Reddet</Button>
      </div>
      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{pending === "Onaylandı" ? "Onayla" : "Reddet"}</DialogTitle></DialogHeader>
          <Textarea placeholder="Açıklama (opsiyonel)" value={note} onChange={(e) => setNote(e.target.value)} />
          <DialogFooter><Button onClick={confirm}>Kaydet</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
