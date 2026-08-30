import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { FileText, Image as ImageIcon, Languages, Loader2, Plus, Save, Trash2, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  createNote,
  deleteNote,
  listNotes,
  readPdfPageCount,
  updateNote,
  uploadNotePdf,
  uploadPreviewImages,
  type Note,
  type NoteLanguage,
} from "@/lib/notes-store";


import { getNoteSales } from "@/lib/notes.functions";
import {
  PurchaseAnalyticsCard,
  ReviewModerationCard,
  TestingToolsCard,
  UserManagementCard,
} from "@/components/admin/AdminPanels";
import { cn } from "@/lib/utils";


export const Route = createFileRoute("/_app/admin")({
  head: () => ({
    meta: [
      { title: "Admin Console — From The Last Bench" },
      { name: "description", content: "Upload chapters, manage pricing and review sales." },
      { property: "og:title", content: "Admin Console — From The Last Bench" },
      { property: "og:description", content: "Upload chapters, manage pricing and review sales." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const navigate = useNavigate();
  const { isAdmin, checking } = useIsAdmin();

  useEffect(() => {
    if (!checking && !isAdmin) void navigate({ to: "/home", replace: true });
  }, [checking, isAdmin, navigate]);

  if (checking) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!isAdmin) return null;
  return <AdminConsole />;
}

function AdminConsole() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [sales, setSales] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchSales = useServerFn(getNoteSales);

  const refresh = useCallback(async () => {
    try {
      setNotes(await listNotes(true));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notes");
    } finally {
      setLoading(false);
    }
    try {
      setSales(await fetchSales());
    } catch {
      setSales({});
    }
  }, [fetchSales]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <div className="flex flex-col gap-6 px-5 pt-6">
      <header>
        <p className="flex items-center gap-1.5 text-xs font-medium text-accent-amber">
          <ShieldCheck className="h-3.5 w-3.5" /> Admin only
        </p>
        <h1 className="text-2xl">Content Console</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload chapters, set pricing and track sales.
        </p>
      </header>

      {error && (
        <p className="rounded-xl bg-destructive/10 p-3 text-xs text-destructive ring-1 ring-destructive/30">
          {error}
        </p>
      )}

      <UploadForm onDone={refresh} />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-black uppercase tracking-widest text-muted-foreground">
          Catalogue ({notes.length})
        </h2>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          notes.map((n) => (
            <NoteRow key={n.id} note={n} sales={sales[n.id] ?? 0} onDone={refresh} />
          ))
        )}
      </section>

      <TestingToolsCard />
      <UserManagementCard />
      <ReviewModerationCard />
      <PurchaseAnalyticsCard />
    </div>
  );
}


const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent-amber";

const LANGUAGE_OPTIONS: { value: NoteLanguage; label: string }[] = [
  { value: "hinglish", label: "Hinglish (Hindi + English)" },
  { value: "english", label: "English (Global)" },
  { value: "both", label: "Both versions" },
];

function UploadForm({ onDone }: { onDone: () => Promise<void> }) {
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [pageCount, setPageCount] = useState("12");
  const [price, setPrice] = useState("199");
  const [isFree, setIsFree] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [language, setLanguage] = useState<NoteLanguage>("hinglish");
  const [file, setFile] = useState<File | null>(null);
  const [fileEn, setFileEn] = useState<File | null>(null);
  const [concepts, setConcepts] = useState("");
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const wantsHinglish = language === "hinglish" || language === "both";
  const wantsEnglish = language === "english" || language === "both";

  // Reads the PDF client-side (PDF.js) and auto-fills "Total Page Count".
  const autoFillPageCount = async (f: File) => {
    const n = await readPdfPageCount(f);
    if (n && n > 0) setPageCount(String(n));
  };


  // Publishing is purely a content operation: it writes to the notes table and
  // never touches user-role / admin-access code paths, so it can no longer trip
  // the "You cannot remove your own admin access" guard.
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (!title.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      // `pdf_path` holds the Hinglish (primary) file; English-only chapters
      // store their single file there too, so readers always find one PDF.
      const primary = language === "english" ? fileEn : file;
      const pdf_path = primary ? await uploadNotePdf(primary) : null;
      const englishExtra = language === "both" ? fileEn : null;
      const pdf_path_en = englishExtra ? await uploadNotePdf(englishExtra) : null;
      // Page counts are parsed from the PDFs, but the admin-entered
      // "Total Page Count" always wins so the store page can show
      // "• [X] Pages of Ultra-Dense Visual Notes" accurately.
      const typedCount = Number(pageCount);
      const parsedCount = primary ? await readPdfPageCount(primary) : null;
      const page_count = Number.isFinite(typedCount) && typedCount > 0 ? typedCount : parsedCount;
      const page_count_en = englishExtra ? await readPdfPageCount(englishExtra) : null;
      const preview_images =
        previewFiles.length > 0 ? await uploadPreviewImages(previewFiles) : [];
      await createNote({
        title: title.trim(),
        subject: subject.trim(),
        description: description.trim(),
        thumbnail_url: null,
        price_inr: isFree ? 0 : Number(price) || 0,
        is_free: isFree,
        is_pro: isPro,
        language,
        pdf_path,
        pdf_path_en,
        page_count,
        page_count_en,
        preview_images,
        concepts: concepts.trim() || null,
      });
      // Clear the form immediately so the button leaves its loading state
      // before the (slower) catalogue refresh runs.
      setTitle("");
      setSubject("");
      setDescription("");
      setPageCount("12");
      setPrice("199");
      setIsFree(false);
      setIsPro(false);
      setLanguage("hinglish");
      setFile(null);
      setFileEn(null);
      setConcepts("");
      setPreviewFiles([]);
      formEl.reset();
      setMsg("Chapter published to the Library.");
      setBusy(false);
      toast.success("Note pack published successfully!");
      await onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      setMsg(message);
      toast.error(message);
      setBusy(false);
    }
  };


  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-3 rounded-2xl bg-card p-4 ring-1 ring-border"
    >
      <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-widest">
        <Plus className="h-4 w-4 text-accent-amber" /> Upload New Note
      </h2>

      <input className={inputCls} placeholder="Chapter title" value={title} onChange={(e) => setTitle(e.target.value)} required />
      <input className={inputCls} placeholder="Subject (e.g. Physics · 12)" value={subject} onChange={(e) => setSubject(e.target.value)} />
      <textarea className={cn(inputCls, "min-h-20 resize-y")} placeholder="Description" value={description} onChange={(e) => setDescription(e.target.value)} />

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="total-page-count"
          className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
        >
          Total Page Count
        </label>
        <input
          id="total-page-count"
          className={inputCls}
          type="number"
          min={1}
          value={pageCount}
          onChange={(e) => setPageCount(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="chapter-concepts"
          className="text-[10px] font-black uppercase tracking-widest text-muted-foreground"
        >
          Chapter Concepts Covered (one per line)
        </label>
        <textarea
          id="chapter-concepts"
          className={cn(inputCls, "min-h-20 resize-y")}
          placeholder={"Coulomb's Law\nElectric field & dipoles\nGauss's Law applications"}
          value={concepts}
          onChange={(e) => setConcepts(e.target.value)}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="language-target"
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground"
        >
          <Languages className="h-3.5 w-3.5 text-accent-amber" /> Language Target
        </label>
        <select
          id="language-target"
          className={inputCls}
          value={language}
          onChange={(e) => setLanguage(e.target.value as NoteLanguage)}
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-3">
        <input
          className={cn(inputCls, "flex-1")}
          type="number"
          min={0}
          placeholder="Price (INR)"
          value={isFree ? 0 : price}
          disabled={isFree}
          onChange={(e) => setPrice(e.target.value)}
        />
        <Toggle label="Free" on={isFree} onChange={setIsFree} />
        <Toggle label="Pro" on={isPro} onChange={setIsPro} />
      </div>

      {wantsHinglish && (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4" />
          {file ? file.name : "Attach Hinglish PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFile(f);
              if (f) void autoFillPageCount(f);
            }}
          />
        </label>
      )}

      {wantsEnglish && (
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
          <FileText className="h-4 w-4" />
          {fileEn ? fileEn.name : "Attach English PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setFileEn(f);
              if (f && language === "english") void autoFillPageCount(f);
            }}
          />
        </label>
      )}

      <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
        <ImageIcon className="h-4 w-4" />
        {previewFiles.length > 0
          ? `${previewFiles.length} sample page(s) selected`
          : "Sample Preview Images (Upload 2–4 page screenshots)"}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => setPreviewFiles(Array.from(e.target.files ?? []).slice(0, 4))}
        />
      </label>




      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}

      <button
        type="submit"
        disabled={busy}
        className="inline-flex items-center justify-center gap-2 rounded-lg bg-crimson-gradient px-3 py-2 text-[11px] font-black uppercase tracking-widest text-primary-foreground disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
        Publish Chapter
      </button>
    </form>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={cn(
        "rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-widest ring-1 transition",
        on
          ? "bg-accent-amber text-accent-amber-foreground ring-accent-amber"
          : "text-muted-foreground ring-border",
      )}
    >
      {label}
    </button>
  );
}

function NoteRow({ note, sales, onDone }: { note: Note; sales: number; onDone: () => Promise<void> }) {
  const [price, setPrice] = useState(String(note.price_inr));
  const [isPro, setIsPro] = useState(note.is_pro);
  const [isFree, setIsFree] = useState(note.is_free);
  const [language, setLanguage] = useState<NoteLanguage>(note.language);
  const [enFile, setEnFile] = useState<File | null>(null);
  const [concepts, setConcepts] = useState(note.concepts ?? "");
  const [previewFiles, setPreviewFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const existingPreviews = note.preview_images ?? [];

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await onDone();
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const pdf_path_en = enFile ? await uploadNotePdf(enFile) : undefined;
    const page_count_en = enFile ? await readPdfPageCount(enFile) : undefined;
    const newPreviews = previewFiles.length > 0 ? await uploadPreviewImages(previewFiles) : [];
    await updateNote(note.id, {
      price_inr: isFree ? 0 : Number(price) || 0,
      is_free: isFree,
      is_pro: isPro,
      language,
      concepts: concepts.trim() || null,
      ...(newPreviews.length > 0
        ? { preview_images: [...existingPreviews, ...newPreviews].slice(0, 8) }
        : {}),
      ...(pdf_path_en ? { pdf_path_en } : {}),
      ...(page_count_en != null ? { page_count_en } : {}),
    });
    setEnFile(null);
    setPreviewFiles([]);
  };

  return (
    <div className={cn("rounded-2xl bg-card p-3 ring-1 ring-border", note.hidden && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{note.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">{note.subject || "—"}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-accent-amber">
            {note.language === "both" ? "Hinglish + English" : note.language}
          </span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
            {sales} sold
          </span>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          Chapter Concepts Covered (one per line)
          <textarea
            className={cn(inputCls, "mt-1 min-h-16 resize-y font-normal normal-case tracking-normal")}
            placeholder={"Coulomb's Law\nElectric field & dipoles\nGauss's Law applications"}
            value={concepts}
            onChange={(e) => setConcepts(e.target.value)}
          />
        </label>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <ImageIcon className="h-3 w-3" />
          {previewFiles.length > 0
            ? `${previewFiles.length} new sample page(s)`
            : `Sample preview images (${existingPreviews.length} uploaded)`}
          <input
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => setPreviewFiles(Array.from(e.target.files ?? []).slice(0, 4))}
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">

        <input
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={cn(inputCls, "w-24 py-1.5")}
          aria-label={`Price for ${note.title}`}
        />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value as NoteLanguage)}
          className={cn(inputCls, "w-44 py-1.5")}
          aria-label={`Language for ${note.title}`}
        >
          {LANGUAGE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <FileText className="h-3 w-3" />
          {enFile ? enFile.name : note.pdf_path_en ? "Replace English PDF" : "Add English PDF"}
          <input
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => setEnFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Toggle label="Free" on={isFree} onChange={setIsFree} />
        <Toggle label="Pro" on={isPro} onChange={setIsPro} />
        <button
          type="button"
          disabled={busy}
          onClick={() => run(save)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-amber px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-accent-amber-foreground disabled:opacity-60"
        >
          <Save className="h-3 w-3" /> Save
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => run(() => updateNote(note.id, { hidden: !note.hidden }))}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground ring-1 ring-border"
        >
          {note.hidden ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {note.hidden ? "Show" : "Hide"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (confirm(`Delete "${note.title}" permanently?`)) void run(() => deleteNote(note.id));
          }}
          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-destructive ring-1 ring-destructive/40"
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>
    </div>
  );
}
