import type { Metadata } from "next";
import { CheckCircle2, SearchX } from "lucide-react";
import { LogoMark } from "@/components/brand";
import { getReviewByToken } from "@/server/services/reviews";
import { ReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const found = await getReviewByToken(token);
  return {
    title: found ? `How was your visit to ${found.businessName}?` : "Feedback link not found",
    robots: { index: false, follow: false },
  };
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-[10vh]">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="flex items-center justify-center gap-1.5 pb-8 text-xs text-muted-foreground">
        <LogoMark className="size-4" /> Powered by AI Front Office
      </footer>
    </div>
  );
}

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getReviewByToken(token);

  if (!found) {
    return (
      <Shell>
        <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
          <span className="mx-auto inline-flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">We couldn&apos;t find this feedback link</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            It may have been mistyped or is no longer valid. If you were sent this link by a business, please reply to their message and they&apos;ll help.
          </p>
        </div>
      </Shell>
    );
  }

  if (found.review.status === "responded") {
    return (
      <Shell>
        <div className="rounded-xl border bg-background p-8 text-center shadow-sm">
          <span className="mx-auto inline-flex size-10 items-center justify-center rounded-full bg-success-soft text-success">
            <CheckCircle2 className="size-5" />
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Thank you for your feedback</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            You&apos;ve already rated your {found.serviceName} at {found.businessName}. We appreciate you taking the time.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <ReviewForm token={token} businessName={found.businessName} serviceName={found.serviceName} />
    </Shell>
  );
}
