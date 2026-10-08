"use server";
import { headers } from "next/headers";
import { run, str, type ActionResult } from "@/lib/action";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { submitReview } from "@/server/services/reviews";

export type ReviewOutcome = { positive: boolean; links: { label: string; url: string }[] };

/** Public: the token in the URL is the only capability; no session is involved. */
export async function submitReviewAction(token: string, _: ActionResult<ReviewOutcome> | null, fd: FormData): Promise<ActionResult<ReviewOutcome>> {
  const ip = clientIp(await headers());
  if (!(await rateLimit(`review:${ip}`, 20, 15 * 60_000)).ok) return { ok: false, error: "Too many attempts. Please try again in a few minutes." };
  const rating = Number(fd.get("rating"));
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Please choose a rating from 1 to 5 stars." };
  return run(async () => {
    const r = await submitReview(token, { rating, feedback: str(fd, "feedback") });
    // Only pass through well-formed http(s) links.
    const links = r.links.filter((l) => /^https?:\/\/\S+$/i.test(l.url)).map((l) => ({ label: l.label || "Leave a review", url: l.url }));
    return { positive: r.positive, links };
  });
}
