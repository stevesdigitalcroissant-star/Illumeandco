import { BookOpen, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { EmptyState, Notice, PageHeader, Table } from "@/components/ui/misc";
import { Stat } from "@/components/stat";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import { embeddingsEnabled } from "@/server/ai/embeddings";
import { knowledgeStats, listSources, parseFaqs } from "@/server/services/knowledge";
import { listOpenGaps, ANSWERS_SOURCE_TITLE } from "@/server/services/knowledge-gaps";
import { GapList } from "./gaps-client";
import { AddSourceDialog, KindIcon, SourceActions, TestRetrieval } from "./knowledge-client";

export const metadata = { title: "Knowledge base" };
// Importing a whole website can take up to ~45 seconds.
export const maxDuration = 60;

const KIND_LABEL: Record<string, string> = { text: "Text", faq: "FAQ", document: "Document", url: "Website" };

export default async function KnowledgePage() {
  const { ctx, business } = await requirePermission("business.manage");
  const [sources, stats, gaps] = await Promise.all([listSources(ctx), knowledgeStats(ctx), listOpenGaps(ctx)]);
  const semantic = embeddingsEnabled();
  const failed = sources.filter((s) => s.status === "failed").length;

  return (
    <>
      <PageHeader
        title="Knowledge base"
        description="What your AI receptionist knows about your business. It answers from this information first and won't invent details that aren't here."
        actions={<AddSourceDialog website={business.website} />}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Sources" value={stats.sources} sub="Text, FAQs, documents and pages" />
        <Stat label="Indexed" value={`${stats.indexed}/${stats.sources}`} sub={failed ? `${failed} failed — see below` : "Ready for the AI to use"} tone={failed ? "danger" : "default"} />
        <Stat label="Searchable passages" value={stats.chunks} sub="Chunks the AI can retrieve" />
        <div className="rounded-lg border bg-background px-4 py-4">
          <p className="text-[12.5px] text-muted-foreground">Semantic search</p>
          <p className="mt-1.5 flex items-center gap-2 text-[26px] font-semibold leading-none tracking-tight">
            {semantic ? "On" : "Off"}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {semantic ? "Keyword + meaning-based matching" : "Keyword matching only · set VOYAGE_API_KEY to enable"}
          </p>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader
          title={gaps.length ? `Questions your AI couldn't answer (${gaps.length})` : "Questions your AI couldn't answer"}
          description={`Answer once and the AI knows it from then on — answers are saved to “${ANSWERS_SOURCE_TITLE}”. Most-asked first.`}
        />
        <CardBody className="pt-0">
          {gaps.length ? (
            <GapList gaps={gaps.map((g) => ({ id: g.id, question: g.question, timesAsked: g.timesAsked, lastAsked: fmtRelative(g.lastAskedAt) }))} />
          ) : (
            <p className="text-sm text-muted-foreground">Nothing yet. When a customer asks something your information doesn&apos;t cover, it shows up here.</p>
          )}
        </CardBody>
      </Card>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Sources" description="Edit or re-index a source after your information changes." />
          {sources.length ? (
            <Table>
              <thead>
                <tr>
                  <th>Source</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="text-right!">Passages</th>
                  <th>Updated</th>
                  <th className="w-12"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td className="max-w-[280px]">
                      <div className="flex items-center gap-2.5">
                        <KindIcon kind={s.kind} className="shrink-0" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{s.title}</p>
                          {s.url ? <p className="truncate text-xs text-muted-foreground">{s.url}</p> : null}
                          {s.status === "failed" && s.error ? <p className="mt-0.5 text-xs text-danger">{s.error}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="text-muted-foreground">{KIND_LABEL[s.kind] ?? s.kind}</td>
                    <td>
                      {s.status === "indexed" ? <Badge tone="success">Indexed</Badge> : s.status === "failed" ? <Badge tone="danger">Failed</Badge> : <Badge tone="warning">Pending</Badge>}
                    </td>
                    <td className="text-right tabular">{s.chunkCount}</td>
                    <td className="whitespace-nowrap text-[13px] text-muted-foreground" title={s.lastIndexedAt ? `Indexed ${fmtDateTime(s.lastIndexedAt, business.timezone)}` : "Never indexed"}>
                      {fmtRelative(s.updatedAt)}
                      <span className="block text-xs">{s.lastIndexedAt ? `indexed ${fmtRelative(s.lastIndexedAt)}` : "not indexed"}</span>
                    </td>
                    <td>
                      <SourceActions
                        source={{
                          id: s.id,
                          kind: s.kind,
                          title: s.title,
                          url: s.url,
                          content: s.kind === "url" || s.kind === "faq" ? null : s.content,
                          faqs: s.kind === "faq" ? parseFaqs(s.content ?? "") : null,
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : (
            <EmptyState
              icon={<BookOpen />}
              title="Your knowledge base is empty"
              description={business.website ? `Start by importing ${business.website.replace(/^https?:\/\//, "").replace(/\/$/, "")} — the AI reads your pages in about a minute. Then add price lists, menus or policies as PDF or Word files.` : "Import your website, upload price lists, menus or policies (PDF or Word), or add FAQs. Until then the AI can only use your services, prices, hours and policies from Settings."}
              action={<AddSourceDialog website={business.website} initialTab="url" />}
            />
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Test retrieval" description="See exactly which passages the AI would read before answering." />
            <CardBody>
              <TestRetrieval disabled={!stats.chunks} />
              {!stats.chunks ? <p className="mt-3 text-xs text-muted-foreground">Add and index a source to test it.</p> : null}
            </CardBody>
          </Card>
          <Notice tone="neutral" className="flex gap-2.5">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              Business-provided information always takes priority. If a customer asks something not covered here, the AI says it isn&apos;t sure and offers to connect them with your team rather than guessing.
            </span>
          </Notice>
        </div>
      </div>
    </>
  );
}
