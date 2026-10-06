import Link from "next/link";
import { Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, EmptyState, PageHeader, Table } from "@/components/ui/misc";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { requireBusiness } from "@/lib/session";
import { listCustomers } from "@/server/services/customers";
import { SOURCE_LABELS } from "./labels";
import { NewCustomerDialog } from "./new-customer-dialog";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { ctx, business } = await requireBusiness();
  const q = ((await searchParams).q ?? "").slice(0, 100);
  const rows = await listCustomers(ctx, { search: q });

  return (
    <>
      <PageHeader title="Customers" description="Everyone who has contacted or visited your business." actions={<NewCustomerDialog />} />

      <form className="mb-4 flex max-w-md gap-2" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Search name, phone or email" className="pl-8" aria-label="Search customers" />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
        {q ? (
          <Button asChild variant="ghost">
            <Link href="/app/customers">Clear</Link>
          </Button>
        ) : null}
      </form>

      <Card>
        {rows.length ? (
          <Table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Source</th>
                <th>Tags</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="relative">
                  <td className="min-w-48">
                    <Link href={`/app/customers/${c.id}`} className="flex items-center gap-3 after:absolute after:inset-0">
                      <Avatar name={c.name} />
                      <span className="truncate font-medium">{c.name ?? <span className="text-muted-foreground">Unnamed visitor</span>}</span>
                      {c.optedOut ? <Badge tone="outline">Opted out</Badge> : null}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap tabular text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{c.email ?? "—"}</td>
                  <td className="whitespace-nowrap text-muted-foreground">{c.source ? (SOURCE_LABELS[c.source] ?? c.source) : "—"}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {c.tags.length ? c.tags.slice(0, 4).map((t) => <Badge key={t}>{t}</Badge>) : <span className="text-muted-foreground">—</span>}
                    </div>
                  </td>
                  <td className="whitespace-nowrap text-muted-foreground" title={c.lastSeenAt ? fmtDateTime(c.lastSeenAt, business.timezone) : undefined}>
                    {fmtRelative(c.lastSeenAt ?? c.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState
            icon={<Users />}
            title={q ? `No customers match “${q}”` : "No customers yet"}
            description={q ? "Try a different name, phone number or email." : "Customers are created automatically when someone chats with your AI receptionist, or you can add one."}
          />
        )}
      </Card>
      {rows.length >= 200 ? <p className="mt-3 text-[13px] text-muted-foreground">Showing the 200 most recent customers — search to find others.</p> : null}
    </>
  );
}
