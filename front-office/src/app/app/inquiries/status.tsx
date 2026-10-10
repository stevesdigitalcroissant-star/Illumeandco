"use client";
import { useTransition } from "react";
import { NativeSelect } from "@/components/ui/input";
import { setInquiryStatusAction } from "./actions";

export function InquiryStatus({ id, value }: { id: string; value: string }) {
  const [pending, start] = useTransition();
  return (
    <NativeSelect aria-label="Status" defaultValue={value} disabled={pending} className="h-8 w-32" onChange={(e) => start(async () => void (await setInquiryStatusAction(id, e.target.value as "new")))}>
      <option value="new">New</option>
      <option value="contacted">Contacted</option>
      <option value="closed">Closed</option>
    </NativeSelect>
  );
}
