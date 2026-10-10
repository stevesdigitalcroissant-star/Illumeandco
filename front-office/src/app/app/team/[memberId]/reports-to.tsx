"use client";
import { useState, useTransition } from "react";
import { NativeSelect } from "@/components/ui/input";
import { setReportsToAction } from "../actions";

export function ReportsTo({ memberId, value, managers }: { memberId: string; value: string | null; managers: { memberId: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="reports-to" className="text-[13px] text-muted-foreground">Reports to</label>
      <NativeSelect
        id="reports-to"
        defaultValue={value ?? ""}
        disabled={pending}
        className="h-8 w-48"
        onChange={(e) =>
          start(async () => {
            const r = await setReportsToAction(memberId, e.target.value || null);
            setMsg(r.ok ? { ok: true, text: "Saved" } : { ok: false, text: r.error });
          })
        }
      >
        <option value="">No manager (all managers see them)</option>
        {managers.map((m) => (
          <option key={m.memberId} value={m.memberId}>{m.name}</option>
        ))}
      </NativeSelect>
      {msg ? <span className={msg.ok ? "text-xs text-success" : "text-xs text-danger"} role="status">{msg.text}</span> : null}
    </div>
  );
}
