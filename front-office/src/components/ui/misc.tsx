import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground [&_svg]:size-5">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "warning" | "danger" | "success" | "neutral"; children: React.ReactNode; className?: string }) {
  const tones = {
    info: "bg-info-soft text-info border-info/15",
    warning: "bg-warning-soft text-warning border-warning/20",
    danger: "bg-danger-soft text-danger border-danger/20",
    success: "bg-success-soft text-success border-success/20",
    neutral: "bg-muted text-foreground/80 border-border",
  };
  return <div className={cn("rounded-md border px-3.5 py-2.5 text-[13px] leading-relaxed", tones[tone], className)}>{children}</div>;
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn("w-full text-sm [&_th]:h-10 [&_th]:px-4 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:whitespace-nowrap [&_td]:px-4 [&_td]:py-3 [&_td]:align-middle [&_tbody_tr]:border-t [&_tbody_tr:hover]:bg-surface", className)} {...props} />
    </div>
  );
}

export function Avatar({ name, className }: { name: string | null | undefined; className?: string }) {
  const initials = (name ?? "?").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
  return (
    <span className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground/70", className)}>
      {initials}
    </span>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return <kbd className="rounded border bg-surface px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">{children}</kbd>;
}
