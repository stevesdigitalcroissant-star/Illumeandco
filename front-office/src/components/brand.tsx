import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#0a0a0a" />
      <path d="M9 22V12.5a2.5 2.5 0 0 1 2.5-2.5h9a2.5 2.5 0 0 1 2.5 2.5V22" stroke="#fff" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M7 22h18" stroke="#2dd4bf" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="15.5" r="2" fill="#2dd4bf" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark />
      <span className="text-[15px] font-semibold tracking-tight">AI Front Office</span>
    </span>
  );
}
