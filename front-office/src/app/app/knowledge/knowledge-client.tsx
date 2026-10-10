"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FileText, Globe, Loader2, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Trash2, Upload, X } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Notice } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ActionResult } from "@/lib/action";
import { cn } from "@/lib/utils";
import { addSourceAction, uploadDocumentAction, deleteSourceAction, reindexSourceAction, testRetrievalAction, updateSourceAction } from "./actions";

type Faq = { q: string; a: string };

function Result({ state }: { state: ActionResult<unknown> | null }) {
  if (!state) return null;
  if (!state.ok) return <p className="text-[13px] text-danger" role="alert">{state.error}</p>;
  return state.message ? <p className="text-[13px] text-success">{state.message}</p> : null;
}

export function FaqEditor({ value, onChange }: { value: Faq[]; onChange: (v: Faq[]) => void }) {
  const set = (i: number, patch: Partial<Faq>) => onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  return (
    <div className="space-y-3">
      {value.map((f, i) => (
        <div key={i} className="relative rounded-md border bg-surface p-3 pr-10">
          <div className="space-y-2">
            <Input aria-label={`Question ${i + 1}`} placeholder="Question, e.g. Do you have parking?" value={f.q} onChange={(e) => set(i, { q: e.target.value })} />
            <Textarea aria-label={`Answer ${i + 1}`} placeholder="Answer" className="min-h-[60px]" value={f.a} onChange={(e) => set(i, { a: e.target.value })} />
          </div>
          {value.length > 1 ? (
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute right-2 top-2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={`Remove question ${i + 1}`}>
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { q: "", a: "" }])}>
        <Plus /> Add question
      </Button>
    </div>
  );
}

const DOC_EXT = /\.(pdf|docx|txt|md|markdown|csv|html?)$/i;
const MAX_UPLOAD = 4 * 1024 * 1024;

export function AddSourceDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("text");
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [pending, start] = useTransition();
  const [faqs, setFaqs] = useState<Faq[]>([{ q: "", a: "" }]);
  const [doc, setDoc] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const reset = () => {
    setState(null);
    setFaqs([{ q: "", a: "" }]);
    setDoc(null);
    setFileError(null);
    formRef.current?.reset();
  };

  function onFile(file: File | undefined) {
    setFileError(null);
    setDoc(null);
    if (!file) return;
    if (!DOC_EXT.test(file.name)) {
      setFileError(/\.doc$/i.test(file.name) ? "Old Word (.doc) files aren't supported — save it as .docx or PDF first." : "Upload a PDF, Word (.docx), .txt, .md, .csv or .html file.");
      return;
    }
    if (file.size > MAX_UPLOAD) {
      setFileError("That file is larger than 4 MB. Split it, or save a smaller PDF.");
      return;
    }
    setDoc(file);
  }

  function submit(fd: FormData) {
    const title = String(fd.get("title") ?? "");
    const payload =
      tab === "text"
        ? { kind: "text" as const, title, content: String(fd.get("content") ?? "") }
        : tab === "faq"
          ? { kind: "faq" as const, title: title || "FAQs", faqs }
          : { kind: "url" as const, title, url: String(fd.get("url") ?? "") };
    if (tab === "document" && !doc) {
      setState({ ok: false, error: "Choose a file to upload." });
      return;
    }
    start(async () => {
      let r: ActionResult<unknown>;
      if (tab === "document") {
        const up = new FormData();
        up.set("file", doc!);
        up.set("title", title);
        r = await uploadDocumentAction(up);
      } else r = await addSourceAction(payload);
      setState(r);
      router.refresh();
      if (r.ok) {
        setOpen(false);
        reset();
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add source
        </Button>
      </DialogTrigger>
      <DialogContent wide title="Add knowledge" description="The AI receptionist answers from this information first, before anything general it knows.">
        <Tabs value={tab} onValueChange={(v) => { setTab(v); setState(null); }}>
          <TabsList>
            <TabsTrigger value="text">Text</TabsTrigger>
            <TabsTrigger value="faq">FAQs</TabsTrigger>
            <TabsTrigger value="document">Document</TabsTrigger>
            <TabsTrigger value="url">Website</TabsTrigger>
          </TabsList>
          <form ref={formRef} action={submit} className="space-y-4 pt-5">
            <Field label="Title" hint={tab === "url" ? "Optional — we'll use the page title." : undefined}>
              <Input name="title" placeholder={tab === "faq" ? "e.g. General FAQs" : tab === "url" ? "e.g. Our pricing page" : "e.g. Aftercare instructions"} maxLength={200} required={tab === "text"} />
            </Field>
            <TabsContent value="text" className="pt-0">
              <Field label="Content" hint="Paste anything a receptionist should know: services, preparation, aftercare, parking, payment options…">
                <Textarea name="content" className="min-h-[200px]" required={tab === "text"} />
              </Field>
            </TabsContent>
            <TabsContent value="faq" className="pt-0">
              <FaqEditor value={faqs} onChange={setFaqs} />
            </TabsContent>
            <TabsContent value="document" className="pt-0 space-y-3">
              <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-surface px-4 py-8 text-center hover:bg-muted">
                <Upload className="size-5 text-muted-foreground" />
                <span className="text-sm font-medium">{doc ? doc.name : "Choose a file"}</span>
                <span className="text-xs text-muted-foreground">{doc ? `${(doc.size / 1024).toFixed(0)} KB — text is read when you add it` : "PDF, Word (.docx), .txt, .md, .csv or .html — up to 4 MB"}</span>
                <input type="file" className="sr-only" accept=".pdf,.docx,.txt,.md,.markdown,.csv,.html,.htm" onChange={(e) => onFile(e.target.files?.[0])} />
              </label>
              {fileError ? <Notice tone="warning">{fileError}</Notice> : null}
              <p className="text-xs text-muted-foreground">Price lists, treatment menus, aftercare sheets, policies. Scanned PDFs (photos of pages) have no readable text — paste those into the Text tab.</p>
            </TabsContent>
            <TabsContent value="url" className="pt-0">
              <Field label="Page URL" hint="We fetch this one page now and whenever you re-index it. Only public http(s) pages can be imported.">
                <Input name="url" type="url" placeholder="https://yourclinic.com/faq" required={tab === "url"} />
              </Field>
            </TabsContent>
            <Result state={state} />
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={pending}>
                {pending ? <><Loader2 className="animate-spin" /> Indexing…</> : "Add & index"}
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

export function SourceActions({ source }: { source: { id: string; kind: string; title: string; content: string | null; faqs: Faq[] | null; url: string | null } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult<unknown> | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [title, setTitle] = useState(source.title);
  const [content, setContent] = useState(source.content ?? "");
  const [faqs, setFaqs] = useState<Faq[]>(source.faqs?.length ? source.faqs : [{ q: "", a: "" }]);
  const editable = source.kind !== "url";

  const go = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setState(r);
      router.refresh();
      if (r.ok) after?.();
    });

  return (
    <div className="flex items-center justify-end gap-2">
      {pending ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Working" /> : null}
      {state && !state.ok && !editOpen ? <span className="max-w-48 truncate text-xs text-danger" title={state.error}>{state.error}</span> : null}
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${source.title}`} disabled={pending}>
            <MoreHorizontal />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" sideOffset={4} className="z-50 min-w-40 rounded-lg border bg-background p-1 text-sm shadow-lg">
            {editable ? (
              <DropdownMenu.Item onSelect={() => { setState(null); setEditOpen(true); }} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 outline-none data-[highlighted]:bg-muted">
                <Pencil className="size-3.5" /> Edit
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Item onSelect={() => go(() => reindexSourceAction(source.id))} className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 outline-none data-[highlighted]:bg-muted">
              <RefreshCw className="size-3.5" /> {source.kind === "url" ? "Re-fetch & index" : "Re-index"}
            </DropdownMenu.Item>
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
            <DropdownMenu.Item
              onSelect={() => {
                if (confirm(`Delete "${source.title}"? The AI will stop using this information.`)) go(() => deleteSourceAction(source.id));
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-danger outline-none data-[highlighted]:bg-danger-soft"
            >
              <Trash2 className="size-3.5" /> Delete
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      {editable ? (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent wide title={`Edit ${source.kind === "faq" ? "FAQs" : "source"}`} description="Saving re-indexes the source so the AI uses the new version immediately.">
            <form
              className="space-y-4"
              action={() =>
                go(
                  () => updateSourceAction(source.id, source.kind === "faq" ? { title, faqs } : { title, content }),
                  () => setEditOpen(false),
                )
              }
            >
              <Field label="Title">
                <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
              </Field>
              {source.kind === "faq" ? (
                <FaqEditor value={faqs} onChange={setFaqs} />
              ) : (
                <Field label="Content">
                  <Textarea value={content} onChange={(e) => setContent(e.target.value)} className="min-h-[260px] font-mono text-[13px]" required />
                </Field>
              )}
              <Result state={state} />
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save & re-index"}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

export function TestRetrieval({ disabled }: { disabled: boolean }) {
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const [state, setState] = useState<ActionResult<{ chunkId: string; sourceTitle: string; content: string }[]> | null>(null);
  return (
    <div className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => setState(await testRetrievalAction(q)));
        }}
      >
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Do you have parking?" className="pl-9" aria-label="Test question" disabled={disabled} />
        </div>
        <Button type="submit" variant="outline" disabled={pending || disabled || !q.trim()}>
          {pending ? <Loader2 className="animate-spin" /> : null} Test
        </Button>
      </form>
      {state && !state.ok ? <p className="text-[13px] text-danger">{state.error}</p> : null}
      {state?.ok ? (
        state.data?.length ? (
          <ol className="space-y-2">
            {state.data.map((h, i) => (
              <li key={h.chunkId} className="rounded-md border bg-surface p-3">
                <p className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="inline-flex size-4 items-center justify-center rounded-full bg-foreground text-[10px] font-semibold text-background">{i + 1}</span>
                  {h.sourceTitle}
                </p>
                <p className="line-clamp-6 whitespace-pre-line text-[13px] leading-relaxed">{h.content}</p>
              </li>
            ))}
          </ol>
        ) : (
          <Notice tone="warning">
            Nothing in your knowledge base matches. The AI would not have business-specific information for this question — it will say it isn&apos;t sure and offer to connect the customer with your team. Consider adding an FAQ.
          </Notice>
        )
      ) : null}
    </div>
  );
}

export function KindIcon({ kind, className }: { kind: string; className?: string }) {
  const Icon = kind === "url" ? Globe : kind === "document" ? Upload : FileText;
  return <Icon className={cn("size-4 text-muted-foreground", className)} />;
}
