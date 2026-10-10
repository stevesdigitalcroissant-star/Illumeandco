import { notFound } from "next/navigation";
import { Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader } from "@/components/ui/misc";
import { fmtRelative } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { isPlatformAdmin, listInquiries, salesEmailConfigured } from "@/server/services/sales";
import { InquiryStatus } from "./status";

export const metadata = { title: "Sales enquiries" };

export default async function InquiriesPage() {
  const { user } = await requireUser();
  if (!isPlatformAdmin(user.email)) notFound();
  const rows = await listInquiries(user.email);
  return (
    <>
      <PageHeader title="Sales enquiries" description="Custom-plan requests from the website's contact form. Only platform admins see this page." />
      {!salesEmailConfigured() ? (
        <Notice tone="info" className="mb-6">New enquiries aren&apos;t emailed to you yet — set RESEND_API_KEY, EMAIL_FROM and SALES_EMAIL. They always appear here.</Notice>
      ) : null}
      <Card>
        {rows.length ? (
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{r.organization} <span className="font-normal text-muted-foreground">· {r.locations} locations</span></p>
                  <p className="mt-0.5 text-[13px]">
                    {r.name} · <a href={`mailto:${r.email}`} className="text-primary hover:underline">{r.email}</a>
                    {r.phone ? <> · <a href={`tel:${r.phone}`} className="text-primary hover:underline">{r.phone}</a></> : null}
                  </p>
                  {r.message ? <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{r.message}</p> : null}
                  <p className="mt-2 text-xs text-muted-foreground">{fmtRelative(r.createdAt)}{r.emailedAt ? " · emailed to you" : ""}</p>
                </div>
                <InquiryStatus id={r.id} value={r.status} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={<Mail />} title="No enquiries yet" description="Requests from /contact appear here." />
        )}
      </Card>
    </>
  );
}
