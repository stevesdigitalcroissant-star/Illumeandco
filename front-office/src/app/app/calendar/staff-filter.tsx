"use client";
import { useRouter } from "next/navigation";
import { NativeSelect } from "@/components/ui/input";

export function StaffFilter({ staff, value, week }: { staff: { id: string; name: string }[]; value: string; week: string }) {
  const router = useRouter();
  if (staff.length < 2) return null;
  return (
    <NativeSelect
      aria-label="Filter by staff"
      value={value}
      className="w-44"
      onChange={(e) => {
        const p = new URLSearchParams();
        if (week) p.set("week", week);
        if (e.target.value) p.set("staff", e.target.value);
        const s = p.toString();
        router.push(s ? `/app/calendar?${s}` : "/app/calendar");
      }}
    >
      <option value="">All staff</option>
      {staff.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name}
        </option>
      ))}
    </NativeSelect>
  );
}
