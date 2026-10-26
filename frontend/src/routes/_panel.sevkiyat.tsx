import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/iso/PageHeader";
import { DataTable } from "@/components/iso/DataTable";
import { getTable } from "@/lib/iso-data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/_panel/sevkiyat")({ component: TablePage });

function TablePage() {
  const table = getTable("sevkiyat")!;
  const store = useStore();
  const rows = store.rows["sevkiyat"] ?? [];
  return (
    <div>
      <PageHeader eyebrow={table.code} title={table.title} description={table.description} />
      <div className="p-8"><DataTable table={table} rows={rows} /></div>
    </div>
  );
}
