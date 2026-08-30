import { IS_TESTING_MODE } from "@/lib/testing-mode";
import { supabase } from "@/integrations/supabase/client";

/** Language a note is authored in. `both` means the chapter ships both variants. */
export type NoteLanguage = "hinglish" | "english" | "both";
/** A language a student can actually read (never `both`). */
export type ReadableLanguage = "hinglish" | "english";

export type Note = {
  id: string;
  title: string;
  subject: string;
  description: string | null;
  thumbnail_url: string | null;
  price_inr: number;
  is_free: boolean;
  is_pro: boolean;
  /** Hinglish (or primary) PDF storage path. */
  pdf_path: string | null;
  /** English variant PDF storage path. */
  pdf_path_en: string | null;
  language: NoteLanguage;
  /** Optional link to a sibling note holding the other language variant. */
  pair_note_id: string | null;
  /** Storage paths (in `note-previews`) of the sample page screenshots. */
  preview_images: string[];
  /** Newline-separated list of concepts covered in the chapter. */
  concepts: string | null;
  /** Page count parsed from the primary PDF at upload time. */
  page_count: number | null;
  /** Page count parsed from the English PDF at upload time. */
  page_count_en: number | null;
  hidden: boolean;
  created_at: string;
};

const COLUMNS =
  "id, title, subject, description, thumbnail_url, price_inr, is_free, is_pro, pdf_path, pdf_path_en, language, pair_note_id, preview_images, concepts, page_count, page_count_en, hidden, created_at";

export async function listNotes(includeHidden = false): Promise<Note[]> {
  let query = supabase.from("notes").select(COLUMNS).order("created_at", { ascending: false });
  if (!includeHidden) query = query.eq("hidden", false);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as Note[];
}

export async function getNote(id: string): Promise<Note | null> {
  const { data, error } = await supabase.from("notes").select(COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Note | null) ?? null;
}

/** Parsed bullet list of the admin-entered "Chapter Concepts Covered" text. */
export function conceptList(note: Pick<Note, "concepts">): string[] {
  return (note.concepts ?? "")
    .split(/\r?\n|·|;/)
    .map((s) => s.replace(/^[-•*\s]+/, "").trim())
    .filter(Boolean);
}


/** Languages this note (plus its paired sibling, if any) can be read in. */
export function noteLanguages(note: Note, all: Note[] = []): ReadableLanguage[] {
  const langs = new Set<ReadableLanguage>();
  if (note.language === "both") {
    langs.add("hinglish");
    langs.add("english");
  } else {
    langs.add(note.language);
  }
  if (note.pdf_path_en) langs.add("english");
  const pair = note.pair_note_id ? all.find((n) => n.id === note.pair_note_id) : undefined;
  if (pair) for (const l of noteLanguages(pair)) langs.add(l);
  return [...langs];
}

/** True when the note should show up under the given library language tab. */
export function noteMatchesLanguage(note: Note, lang: ReadableLanguage, all: Note[] = []) {
  return noteLanguages(note, all).includes(lang);
}

/** Storage path of the PDF for a language, falling back to a paired note. */
export function pdfPathForLanguage(
  note: Note,
  lang: ReadableLanguage,
  all: Note[] = [],
): string | null {
  if (lang === "english") {
    if (note.pdf_path_en) return note.pdf_path_en;
    if (note.language === "english") return note.pdf_path;
  } else {
    if (note.language !== "english") return note.pdf_path;
  }
  const pair = note.pair_note_id ? all.find((n) => n.id === note.pair_note_id) : undefined;
  return pair ? pdfPathForLanguage(pair, lang) : null;
}

/** Page count for a language, falling back to a paired note. */
export function pageCountForLanguage(
  note: Note,
  lang: ReadableLanguage,
  all: Note[] = [],
): number | null {
  if (lang === "english") {
    if (note.pdf_path_en) return note.page_count_en;
    if (note.language === "english") return note.page_count;
  } else if (note.language !== "english") {
    return note.page_count;
  }
  const pair = note.pair_note_id ? all.find((n) => n.id === note.pair_note_id) : undefined;
  return pair ? pageCountForLanguage(pair, lang) : null;
}

export type NoteDraft = {
  title: string;
  subject: string;
  description: string;
  thumbnail_url: string | null;
  price_inr: number;
  is_free: boolean;
  is_pro: boolean;
  pdf_path: string | null;
  pdf_path_en?: string | null;
  language?: NoteLanguage;
  pair_note_id?: string | null;
  preview_images?: string[];
  concepts?: string | null;
  page_count?: number | null;
  page_count_en?: number | null;
};


/** Note ids the signed-in user has purchased / unlocked (empty when signed out). */
export async function listPurchasedNoteIds(): Promise<string[]> {
  // Demo mode: treat every visible pack as unlocked for the current user.
  if (IS_TESTING_MODE) {
    const { data: all } = await supabase.from("notes").select("id").eq("hidden", false);
    return (all ?? []).map((r) => r.id);
  }
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  // Admin bypass: role holders (e.g. devbratgouda29@gmail.com) unlock every pack.
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("role", "admin")
    .maybeSingle();
  if (roleRow) {
    const { data: all } = await supabase.from("notes").select("id").eq("hidden", false);
    return (all ?? []).map((r) => r.id);
  }
  const { data, error } = await supabase
    .from("purchases")
    .select("note_id")
    .eq("user_id", auth.user.id);
  if (error) return [];
  return (data ?? []).map((r) => r.note_id);
}


export async function createNote(draft: NoteDraft) {
  const { error } = await supabase.from("notes").insert(draft);
  if (error) throw new Error(error.message);
}

export async function updateNote(id: string, patch: Partial<NoteDraft> & { hidden?: boolean }) {
  const { error } = await supabase.from("notes").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteNote(id: string) {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Uploads a PDF to the private `notes-pdfs` bucket and returns its storage path. */
export async function uploadNotePdf(file: File): Promise<string> {
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from("notes-pdfs").upload(path, file, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return path;
}

/** Signed URL for reading a stored chapter PDF (1 hour). */
export async function signedPdfUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("notes-pdfs").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

/** Reads a PDF's total page count in the browser (used to fill `page_count`). */
export async function readPdfPageCount(file: File): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const [lib, workerMod] = await Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (lib as any).GlobalWorkerOptions.workerSrc = (workerMod as any).default;
    const buf = await file.arrayBuffer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = await (lib as any).getDocument({ data: buf }).promise;
    const pages = doc.numPages as number;
    void doc.destroy();
    return pages;
  } catch {
    return null;
  }
}

/** Uploads sample page screenshots to `note-previews`; returns storage paths. */
export async function uploadPreviewImages(files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}`;
    const { error } = await supabase.storage.from("note-previews").upload(path, file, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    if (error) throw new Error(error.message);
    paths.push(path);
  }
  return paths;
}

/** Signed URLs for the stored sample page screenshots (1 hour). */
export async function signedPreviewUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const { data } = await supabase.storage.from("note-previews").createSignedUrls(paths, 3600);
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
}
