"use client";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/action";
import { buyCreditsAction, choosePlanAction, manageBillingAction } from "./actions";

export function BillingButton({ planId, packId, disabledReason, children, ...props }: ButtonProps & { planId?: string; packId?: string; disabledReason?: string | null }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  return (
    <div className="space-y-1.5">
      <Button
        {...props}
        className="w-full"
        disabled={pending || Boolean(disabledReason)}
        title={disabledReason ?? undefined}
        onClick={() => start(async () => setState(await (packId ? buyCreditsAction(packId) : planId ? choosePlanAction(planId) : manageBillingAction())))}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {children}
      </Button>
      {disabledReason ? <p className="text-center text-xs text-muted-foreground">{disabledReason}</p> : null}
      {state && !state.ok ? <p className="text-center text-xs text-danger" role="alert">{state.error}</p> : null}
    </div>
  );
}
