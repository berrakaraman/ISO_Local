import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { USERS, type TableDef } from "@/lib/iso-data";
import { actions } from "@/lib/store";

const inputType = (t?: string) =>
  t === "number" || t === "percent" ? "number" : t === "date" ? "date" : t === "datetime" ? "datetime-local" : t === "time" ? "time" : "text";

export function AddRowDialog({ table }: { table: TableDef }) {
  const [open, setOpen] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [assignee, setAssignee] = useState("u1");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const data: Record<string, string | number> = {};
    for (const c of table.columns) {
      const v = vals[c.key] ?? "";
      data[c.key] = c.type === "number" ? Number(v || 0) : c.type === "percent" ? Number(v || 0) / 100 : v;
    }
    actions.add(table.slug, data, assignee);
    toast.success("Kayıt eklendi ve onaya gönderildi.");
    setVals({});
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="default">
          <Plus className="h-4 w-4 mr-2" /> Yeni Kayıt
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {table.code} · {table.title} — Yeni Kayıt
          </DialogTitle>
          <DialogDescription>Kayıt, seçilen sorumluya onay görevi olarak atanır.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          {table.columns.map((c) => (
            <div key={c.key} className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                {c.key}
                {c.type === "percent" && " (%)"}
              </Label>
              {c.type === "select" ? (
                <Select value={vals[c.key] ?? ""} onValueChange={(v) => setVals({ ...vals, [c.key]: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seçiniz" />
                  </SelectTrigger>
                  <SelectContent>
                    {c.options!.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={inputType(c.type)}
                  step="any"
                  value={vals[c.key] ?? ""}
                  onChange={(e) => setVals({ ...vals, [c.key]: e.target.value })}
                />
              )}
            </div>
          ))}
          <div className="space-y-1.5 sm:col-span-2 border-t pt-4">
            <Label className="text-xs text-muted-foreground">Onaylayacak Sorumlu</Label>
            <Select value={assignee} onValueChange={setAssignee}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {USERS.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name} — {u.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button type="submit">Kaydet</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
