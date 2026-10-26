import type { Status } from "@/lib/iso-data";

export function StatusBadge({ status }: { status: Status }) {
  const isOk = status === "Onaylandı";
  const isWait = status === "Bekliyor";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${isOk ? 'bg-green-100 text-green-700' : isWait ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
      {status}
    </span>
  );
}
