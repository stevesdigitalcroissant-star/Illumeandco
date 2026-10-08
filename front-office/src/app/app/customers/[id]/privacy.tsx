"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { eraseCustomerAction } from "./privacy-actions";

export function PrivacyCard({ customerId, label }: { customerId: string; label: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3 px-5 pb-5 text-[13px]">
      <Button size="sm" variant="outline" asChild>
        <a href={`/app/customers/${customerId}/export`} download><Download /> Export their data (JSON)</a>
      </Button>
      {!open ? (
        <div><Button size="sm" variant="ghost" className="text-danger" onClick={() => setOpen(true)}><Trash2 /> Delete all their data</Button></div>
      ) : (
        <div className="space-y-2 rounded-md border border-danger/30 p-3">
          <p>This permanently deletes {label}&apos;s conversations, appointments, leads and history, and removes their details from logs. It can&apos;t be undone. Type <b>DELETE</b> to confirm.</p>
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Type DELETE to confirm" />
          {error ? <p className="text-danger" role="alert">{error}</p> : null}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="bg-danger text-white hover:bg-danger/90"
              disabled={pending || confirm !== "DELETE"}
              onClick={() =>
                start(async () => {
                  const r = await eraseCustomerAction(customerId);
                  if (!r.ok) setError(r.error);
                  else router.push("/app/customers");
                })
              }
            >
              {pending ? "Deleting…" : "Delete permanently"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setOpen(false); setConfirm(""); setError(null); }}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  );
}
