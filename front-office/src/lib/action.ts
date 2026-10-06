import { AppError } from "@/server/context";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string };

/** Convert thrown errors into a form-friendly result; unexpected errors are logged, not leaked. */
export async function run<T>(fn: () => Promise<T>, message?: string): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    return { ok: true, data, message };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: e.message };
    // Next.js redirect()/notFound() throw control-flow errors — let them through.
    if (e && typeof e === "object" && "digest" in e) throw e;
    console.error(e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

export const str = (fd: FormData, k: string) => {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
};
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const num = (fd: FormData, k: string) => {
  const v = str(fd, k);
  return v === "" ? null : Number(v);
};
/** "650" or "650.50" (major units) → 65000 minor units. */
export const moneyToCents = (v: string) => {
  if (!v.trim()) return null;
  const n = Number(v.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100);
};
