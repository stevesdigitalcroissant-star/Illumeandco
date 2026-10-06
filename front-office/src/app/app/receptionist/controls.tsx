"use client";
import { Check, Copy } from "lucide-react";
import { useOptimistic, useState, useTransition } from "react";
import { Switch } from "@/components/ui/switch";
import type { ActionResult } from "@/lib/action";
import type { AiPermissions } from "@/db/schema";
import { bookingRulesAction, permissionAction, setActiveAction } from "./actions";

export function ActiveSwitch({ active }: { active: boolean }) {
  const [optimistic, set] = useOptimistic(active);
  const [, start] = useTransition();
  return (
    <Switch
      checked={optimistic}
      aria-label="AI receptionist on/off"
      onCheckedChange={(v) =>
        start(async () => {
          set(v);
          await setActiveAction(v);
        })
      }
    />
  );
}

export function PermissionRow({ k, label, description, value, locked }: { k: keyof AiPermissions; label: string; description: string; value: boolean; locked: boolean }) {
  const [optimistic, set] = useOptimistic(value);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  return (
    <li className="flex items-start gap-4 border-t px-5 py-3.5 first:border-t-0">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">{description}</p>
        {error ? <p className="mt-1 text-xs text-danger">{error}</p> : null}
      </div>
      <Switch
        checked={locked ? false : optimistic}
        disabled={locked}
        aria-label={label}
        onCheckedChange={(v) =>
          start(async () => {
            set(v);
            const r: ActionResult = await permissionAction(k, v);
            setError(r.ok ? null : r.error);
          })
        }
      />
    </li>
  );
}

export function BookingRules({ requireName, requireContact }: { requireName: boolean; requireContact: boolean }) {
  const [state, set] = useOptimistic({ requireName, requireContact });
  const [, start] = useTransition();
  const update = (patch: Partial<typeof state>) =>
    start(async () => {
      const next = { ...state, ...patch };
      set(next);
      await bookingRulesAction(next.requireName, next.requireContact);
    });
  return (
    <ul>
      <li className="flex items-center gap-4 px-5 py-3.5">
        <div className="flex-1">
          <p className="text-sm font-medium">Require the customer&apos;s name</p>
          <p className="text-[13px] text-muted-foreground">The AI asks for a name before it books.</p>
        </div>
        <Switch checked={state.requireName} onCheckedChange={(v) => update({ requireName: v })} aria-label="Require name" />
      </li>
      <li className="flex items-center gap-4 border-t px-5 py-3.5">
        <div className="flex-1">
          <p className="text-sm font-medium">Require a phone number or email</p>
          <p className="text-[13px] text-muted-foreground">Needed to send confirmations and reminders outside the website chat.</p>
        </div>
        <Switch checked={state.requireContact} onCheckedChange={(v) => update({ requireContact: v })} aria-label="Require contact" />
      </li>
    </ul>
  );
}

export function CopySnippet({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-md border bg-surface p-3 pr-12 font-mono text-[12px] leading-relaxed">{code}</pre>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(code);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="absolute right-2 top-2 rounded-md border bg-background p-1.5 text-muted-foreground hover:text-foreground"
        aria-label="Copy snippet"
      >
        {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
      </button>
    </div>
  );
}
