import { useState } from "react";
import { Image as ImageIcon, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { fileToCoverDataUrl } from "@/lib/notes-store";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (v: string) => void;
  inputCls: string;
};

/** "Card Cover Wallpaper" control: URL text field + device file picker + preview. */
export function CoverWallpaperField({ value, onChange, inputCls }: Props) {
  const [busy, setBusy] = useState(false);

  const pick = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange(await fileToCoverDataUrl(file));
      toast.success("Cover wallpaper attached");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read that image");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5 text-accent-amber" /> Card Cover Wallpaper
      </span>
      <input
        className={cn(inputCls, "font-normal normal-case tracking-normal")}
        type="text"
        placeholder="https://… (leave blank for the default red gradient)"
        value={value.startsWith("data:") ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        disabled={value.startsWith("data:")}
      />
      <div className="flex items-center gap-2">
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-foreground">
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
          Upload from device
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
        </label>
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-black uppercase tracking-widest text-destructive ring-1 ring-destructive/40"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        )}
      </div>
      {value && (
        <img
          src={value}
          alt="Card cover wallpaper preview"
          className="h-24 w-full rounded-xl object-cover ring-1 ring-border"
        />
      )}
    </div>
  );
}
