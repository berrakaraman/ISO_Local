import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/iso/PageHeader";
import { MACHINES, DEFECTS, DECISIONS, UNITS } from "@/lib/iso-data";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Plus, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_panel/tanimlar")({
  component: TanimlarPage,
});

function ListEditor({ title, list }: { title: string; list: string[] }) {
  const [items, setItems] = useState<string[]>([...list]);
  const [newVal, setNewVal] = useState("");

  const handleAdd = () => {
    const val = newVal.trim();
    if (!val) return;
    if (list.includes(val)) {
      toast.error("Bu değer zaten listede mevcut!");
      return;
    }
    list.push(val);
    setItems([...list]);
    setNewVal("");
    toast.success("Başarıyla eklendi.");
  };

  const handleRemove = (idx: number) => {
    list.splice(idx, 1);
    setItems([...list]);
    toast.success("Başarıyla silindi.");
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col h-[420px]">
      <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center gap-2 rounded-t-xl">
        <Settings2 className="h-4 w-4 text-slate-400" />
        <h3 className="font-bold text-sm text-slate-700 tracking-wide uppercase">
          {title}
        </h3>
      </div>
      <div className="p-4 flex-1 overflow-y-auto">
        <ul className="space-y-1.5">
          {items.map((item, i) => (
            <li
              key={i}
              className="flex items-center justify-between group p-2 hover:bg-indigo-50/50 rounded-lg border border-transparent hover:border-indigo-100 transition-colors"
            >
              <span className="text-sm font-medium text-slate-600">{item}</span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-slate-300 opacity-0 group-hover:opacity-100 hover:text-red-500 hover:bg-red-50 transition-all"
                onClick={() => handleRemove(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
          {items.length === 0 && (
            <li className="text-xs text-slate-400 text-center py-4">
              Liste boş
            </li>
          )}
        </ul>
      </div>
      <div className="p-3 border-t border-slate-100 bg-slate-50/50 flex gap-2 rounded-b-xl">
        <Input
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          placeholder="Yeni değer..."
          className="h-9 text-sm bg-white border-slate-200 focus-visible:ring-indigo-500"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          size="sm"
          className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
          onClick={handleAdd}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TanimlarPage() {
  return (
    <div className="bg-slate-50 min-h-full">
      <PageHeader
        eyebrow="AYARLAR"
        title="Tanımlar & Kod Listeleri"
        description="Sistemdeki tüm seçim listelerini buradan yönetebilirsiniz. Yaptığınız eklemeler ve çıkarmalar formlara anında yansır."
      />
      <div className="p-6 md:p-8 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 max-w-screen-2xl">
        <ListEditor title="Makine Kodları" list={MACHINES} />
        <ListEditor title="Hata Kodları" list={DEFECTS} />
        <ListEditor title="Karar / Durum" list={DECISIONS} />
        <ListEditor title="Birimler" list={UNITS} />
      </div>
    </div>
  );
}
