import { IS_TESTING_MODE } from "@/lib/testing-mode";
import { loadPdfjs } from "@/lib/pdf-engine";
import { supabase } from "@/integrations/supabase/client";

/** Language a note is authored in. `both` means the chapter ships both variants. */
export type NoteLanguage = "hinglish" | "english" | "both";
/** A language a student can actually read (never `both`). */
export type ReadableLanguage = "hinglish" | "english";

/** Sub-category shown on the note card. */
export type NoteDivision = "Botany" | "Zoology" | "General";

export type Note = {
  id: string;
  title: string;
  subject: string;
  division: NoteDivision;
  description: string | null;
  thumbnail_url: string | null;
  /** Optional full-bleed wallpaper shown behind the note card. */
  cover_image_url: string | null;
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
  "id, title, subject, division, description, thumbnail_url, cover_image_url, price_inr, is_free, is_pro, pdf_path, pdf_path_en, language, pair_note_id, preview_images, concepts, page_count, page_count_en, hidden, created_at";

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
  division?: NoteDivision;
  description: string;
  thumbnail_url: string | null;
  cover_image_url?: string | null;
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

/* ------------------------------------------------------------------ *
 * Local fallback storage
 * Used when the storage bucket rejects an upload (missing bucket, RLS,
 * size limits → HTTP 400). Files are kept as data URLs in localStorage
 * so publishing never fails outright.
 * ------------------------------------------------------------------ */

const LOCAL_FILES_KEY = "ftlb.localFiles.v1";
const LOCAL_MAX_BYTES = 6 * 1024 * 1024; // keep well under localStorage quota

export function isLocalPath(path: string) {
  return path.startsWith("local:");
}

function readLocalFiles(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(LOCAL_FILES_KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeLocalFile(path: string, dataUrl: string) {
  if (typeof window === "undefined") throw new Error("No local storage available");
  const all = readLocalFiles();
  all[path] = dataUrl;
  localStorage.setItem(LOCAL_FILES_KEY, JSON.stringify(all));
}

function readLocalFile(path: string): string | null {
  return readLocalFiles()[path] ?? null;
}

function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the file"));
    reader.readAsDataURL(file);
  });
}

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
}

/** Uploads a PDF to the private `notes-pdfs` bucket, falling back to local storage. */
export async function uploadNotePdf(file: File): Promise<string> {
  const path = `${Date.now()}-${safeName(file.name)}`;
  try {
    const { error } = await supabase.storage.from("notes-pdfs").upload(path, file, {
      contentType: "application/pdf",
      upsert: false,
    });
    if (error) throw error;
    return path;
  } catch (err) {
    console.error("[upload] PDF upload to bucket failed", {
      path,
      size: file.size,
      type: file.type,
      error: err,
    });
    if (file.size > LOCAL_MAX_BYTES) {
      throw new Error(
        `Could not upload "${file.name}" (${(file.size / 1048576).toFixed(1)} MB). Please use a smaller PDF (under 6 MB).`,
      );
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      const localPath = `local:${path}`;
      writeLocalFile(localPath, dataUrl);
      console.warn("[upload] Saved PDF locally as fallback:", localPath);
      return localPath;
    } catch (e) {
      console.error("[upload] Local PDF fallback failed", e);
      throw new Error(err instanceof Error ? err.message : "PDF upload failed");
    }
  }
}

/** Signed URL for reading a stored chapter PDF (1 hour), or the local data URL. */
export async function signedPdfUrl(path: string): Promise<string | null> {
  if (isLocalPath(path)) return readLocalFile(path);
  const { data, error } = await supabase.storage.from("notes-pdfs").createSignedUrl(path, 3600);
  if (error) console.error("[read] Could not sign PDF url", { path, error });
  return data?.signedUrl ?? null;
}

/** Reads a PDF's total page count in the browser (used to fill `page_count`). */
export async function readPdfPageCount(file: File): Promise<number | null> {
  if (typeof window === "undefined") return null;
  try {
    const lib = await loadPdfjs();
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

/** Downscales a picked image and returns a JPEG blob (keeps payloads small). */
async function compressImage(file: File, maxWidth = 1400): Promise<Blob> {
  if (typeof window === "undefined" || !file.type.startsWith("image/")) return file;
  try {
    const dataUrl = await fileToDataUrl(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Invalid image"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((img.naturalWidth || maxWidth) * scale);
    canvas.height = Math.round((img.naturalHeight || maxWidth) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.82),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch (e) {
    console.warn("[upload] Image compression skipped", e);
    return file;
  }
}

/** Uploads sample page screenshots to `note-previews`; returns storage paths. */
export async function uploadPreviewImages(files: File[]): Promise<string[]> {
  const paths: string[] = [];
  for (const file of files) {
    const body = await compressImage(file);
    const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName(file.name)}`;
    try {
      const { error } = await supabase.storage.from("note-previews").upload(path, body, {
        contentType: body.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw error;
      paths.push(path);
    } catch (err) {
      console.error("[upload] Preview image upload failed", {
        path,
        size: body.size,
        type: body.type,
        error: err,
      });
      try {
        const localPath = `local:${path}`;
        writeLocalFile(localPath, await fileToDataUrl(body));
        paths.push(localPath);
        console.warn("[upload] Saved preview locally as fallback:", localPath);
      } catch (e) {
        console.error("[upload] Local preview fallback failed", e);
      }
    }
  }
  return paths;
}

/** Signed URLs for the stored sample page screenshots (1 hour). */
export async function signedPreviewUrls(paths: string[]): Promise<string[]> {
  if (paths.length === 0) return [];
  const remote = paths.filter((p) => !isLocalPath(p));
  const local = paths.filter(isLocalPath).map(readLocalFile);
  let signed: string[] = [];
  if (remote.length > 0) {
    const { data, error } = await supabase.storage.from("note-previews").createSignedUrls(remote, 3600);
    if (error) console.error("[read] Could not sign preview urls", error);
    signed = (data ?? []).map((d) => d.signedUrl).filter((u): u is string => Boolean(u));
  }
  return [...signed, ...local.filter((u): u is string => Boolean(u))];
}


/**
 * Reads a picked image file and returns a downscaled `data:image/jpeg;base64,…`
 * URL suitable for storing directly in `notes.cover_image_url`.
 */
export async function fileToCoverDataUrl(file: File, maxWidth = 1200): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image"));
    reader.readAsDataURL(file);
  });
  if (typeof window === "undefined") return dataUrl;
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Invalid image"));
      el.src = dataUrl;
    });
    const scale = Math.min(1, maxWidth / (img.naturalWidth || maxWidth));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((img.naturalWidth || maxWidth) * scale);
    canvas.height = Math.round((img.naturalHeight || maxWidth) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = canvas.toDataURL("image/jpeg", 0.82);
    return out.length < dataUrl.length ? out : dataUrl;
  } catch {
    return dataUrl;
  }
}
