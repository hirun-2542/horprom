import { DerivedStatus, STATUS_TH } from "@/lib/billing";

const COLORS: Record<DerivedStatus, string> = {
  draft: "bg-cream-dark text-teak-800",
  void: "bg-cream-dark text-stone-400 line-through",
  paid: "bg-lime-100 text-lime-800",
  partial: "bg-sky-100 text-sky-800",
  overdue: "bg-red-100 text-red-700",
  unpaid: "bg-marigold-100 text-marigold-700",
};

export function StatusBadge({ status }: { status: DerivedStatus }) {
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${COLORS[status]}`}>
      {STATUS_TH[status]}
    </span>
  );
}
