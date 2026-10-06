import Link from "next/link";
import { cn } from "@/lib/utils";

export function Stat({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  tone?: "danger" | "default";
}) {
  const body = (
    <>
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className={cn("mt-1.5 text-[26px] font-semibold leading-none tracking-tight tabular", tone === "danger" && "text-danger")}>{value}</p>
      {sub ? <p className="mt-2 text-xs text-muted-foreground">{sub}</p> : null}
    </>
  );
  const cls = "block rounded-lg border bg-background px-4 py-4 transition-colors";
  return href ? (
    <Link href={href} className={cn(cls, "hover:border-foreground/20")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
