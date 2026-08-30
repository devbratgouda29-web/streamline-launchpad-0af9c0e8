import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  BadgeCheck,
  BookOpen,
  Camera,
  CalendarDays,
  ChevronRight,
  Clock3,
  Crown,
  KeyRound,
  Loader2,
  LogOut,
  Mail,
  Pencil,
  ShieldCheck,
  Sparkles,
  Trophy,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { initialsFor, useAuth } from "@/hooks/use-auth";
import { ProfileInfoModals, type ProfileModalKey } from "@/components/ProfileInfoModals";
import { isSubscriptionActive, isTrialActive } from "@/lib/subscription-store";

export const Route = createFileRoute("/_app/profile")({
  head: () => ({
    meta: [
      { title: "Your Profile — From The Last Bench" },
      {
        name: "description",
        content:
          "Manage your account details, settings and membership status on From The Last Bench.",
      },
      { property: "og:title", content: "Your Profile — From The Last Bench" },
      {
        property: "og:description",
        content: "Manage your account details, settings and membership status.",
      },
    ],
  }),
  component: ProfilePage,
});

/** Downscale + compress a picked image to a small square JPEG data URL. */
async function compressToDataUrl(file: File, size = 256): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  const side = Math.min(bitmap.width, bitmap.height);
  ctx.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    size,
    size,
  );
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.8);
}

function ProfilePage() {
  const navigate = useNavigate();
  const { user, profile, loading, openAuthModal, refreshProfile, signOut } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [mounted, setMounted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [modal, setModal] = useState<ProfileModalKey>(null);


  useEffect(() => {
    setMounted(true);
  }, []);

  const pro = useMemo(() => mounted && isSubscriptionActive(), [mounted]);
  const trial = useMemo(() => mounted && isTrialActive(), [mounted]);

  const displayName =
    profile?.full_name ??
    (user?.user_metadata?.["full_name"] as string | undefined) ??
    user?.email?.split("@")[0] ??
    "Student";
  const email = profile?.email ?? user?.email ?? null;
  const joined = profile?.created_at ?? user?.created_at ?? null;

  const handleAvatarPick = async (file: File | undefined) => {
    if (!file || !user) return;
    if (!/image\/(png|jpe?g)/.test(file.type)) {
      return toast.error("Pick a PNG or JPG image");
    }
    setUploading(true);
    try {
      const dataUrl = await compressToDataUrl(file);
      const { error } = await supabase.from("profiles").upsert(
        {
          id: user.id,
          full_name: displayName,
          avatar_url: dataUrl,
          email,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
      if (error) throw error;
      await supabase.auth.updateUser({ data: { avatar_url: dataUrl } });
      await refreshProfile();
      toast.success("Profile photo updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const handleLogout = async () => {
    await signOut();
    toast.success("Signed out");
    navigate({ to: "/home", replace: true });
  };


  const handleChangePassword = async () => {
    if (!email) return;
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return toast.error(error.message);
    toast.success(`Password reset link sent to ${email}`);
  };

  if (!mounted || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 px-5 pt-6 pb-24">
      {/* ---------- Header card ---------- */}
      <header className="overflow-hidden rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="relative h-16 w-16 shrink-0">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={`${displayName} avatar`}
                className="h-16 w-16 rounded-full object-cover ring-2 ring-primary/30"
              />
            ) : (
              <div className="grid h-16 w-16 place-items-center rounded-full bg-primary text-xl font-black text-primary-foreground">
                {user ? initialsFor(displayName, email) : "FB"}
              </div>
            )}
            <button
              type="button"
              aria-label="Change profile photo"
              disabled={uploading}
              onClick={() =>
                user ? fileRef.current?.click() : openAuthModal("profile")
              }
              className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-primary text-primary-foreground shadow-md ring-2 ring-card disabled:opacity-70"
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Camera className="h-3.5 w-3.5" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".png,.jpg,.jpeg,image/png,image/jpeg"
              className="hidden"
              onChange={(e) => void handleAvatarPick(e.target.files?.[0])}
            />
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-black">
              {user ? displayName : "Welcome, Student"}
            </h1>
            <p className="mt-0.5 flex items-center gap-1.5 truncate text-sm text-muted-foreground">
              <Mail className="h-3.5 w-3.5 shrink-0" />
              {email ?? "Sign in to sync your notes"}
            </p>
            {user && joined && (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                Joined{" "}
                {new Date(joined).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        {/* Subscription badge */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span
            className={
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.16em] " +
              (pro
                ? "bg-amber-400 text-black"
                : "bg-secondary text-secondary-foreground")
            }
          >
            {pro ? <Crown className="h-3.5 w-3.5" /> : <BadgeCheck className="h-3.5 w-3.5" />}
            {pro ? "Pro Bench Member" : "Scholar Free Pass"}
          </span>
          {trial && (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-500">
              Trial active
            </span>
          )}
        </div>

        {!user && (
          <button
            onClick={() => openAuthModal("profile")}
            className="mt-4 w-full rounded-2xl bg-primary px-4 py-3 text-sm font-black uppercase tracking-[0.14em] text-primary-foreground"
          >
            Sign in / Create account
          </button>
        )}

      </header>




      {editing && user && (
        <EditProfileCard
          initialName={displayName}
          initialAvatar={profile?.avatar_url ?? ""}
          userId={user.id}
          email={email}
          onDone={async () => {
            setEditing(false);
            await refreshProfile();
          }}
          onCancel={() => setEditing(false)}
        />
      )}

      <Link
        to="/discipline"
        className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm"
      >
        <Trophy className="h-4 w-4 text-amber-500" />
        <span className="flex-1 font-semibold">Discipline Hub</span>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>

      {isAdmin && (
        <Link
          to="/admin"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 text-sm"
        >
          <ShieldCheck className="h-4 w-4 text-accent-amber" />
          <span className="flex-1 font-semibold">Admin console</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </Link>
      )}



      {/* ---------- Account actions ---------- */}
      <ul className="divide-y divide-border overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border">
        <ActionRow
          icon={Pencil}
          label="Edit profile"
          onClick={() => (user ? setEditing((v) => !v) : openAuthModal("profile"))}
        />
        <ActionRow
          icon={KeyRound}
          label="Change password"
          onClick={() => (user ? handleChangePassword() : openAuthModal("profile"))}
        />
        <ActionRow icon={BookOpen} label="Your library" to="/library" />
        <ActionRow icon={BookOpen} label="App Guide" onClick={() => setModal("guide")} />
        <ActionRow icon={Sparkles} label="About the Platform" onClick={() => setModal("about")} />
        <ActionRow
          icon={ShieldCheck}
          label="Privacy & terms"
          onClick={() => setModal("privacy")}
        />
      </ul>

      <ProfileInfoModals active={modal} onClose={() => setModal(null)} />

      {user && (
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 rounded-2xl bg-card px-4 py-3 text-sm font-semibold text-destructive shadow-sm ring-1 ring-border"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </button>
      )}
    </div>
  );
}


function ActionRow({
  icon: Icon,
  label,
  onClick,
  to,
}: {
  icon: typeof Clock3;
  label: string;
  onClick?: () => void;
  to?: "/library";
}) {
  const inner = (
    <>
      <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </>
  );
  return (
    <li>
      {to ? (
        <Link to={to} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          {inner}
        </Link>
      ) : (
        <button onClick={onClick} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
          {inner}
        </button>
      )}
    </li>
  );
}

function EditProfileCard({
  initialName,
  initialAvatar,
  userId,
  email,
  onDone,
  onCancel,
}: {
  initialName: string;
  initialAvatar: string;
  userId: string;
  email: string | null;
  onDone: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name cannot be empty");
    if (trimmed.length > 100) return toast.error("Name is too long");
    setBusy(true);
    const { error } = await supabase.from("profiles").upsert(
      {
        id: userId,
        full_name: trimmed,
        avatar_url: avatar.trim() || null,
        email,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (!error) {
      await supabase.auth.updateUser({ data: { full_name: trimmed, avatar_url: avatar.trim() || null } });
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Profile updated");
    await onDone();
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
        Edit profile
      </p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={100}
        placeholder="Full name"
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <input
        value={avatar}
        onChange={(e) => setAvatar(e.target.value)}
        maxLength={500}
        placeholder="Avatar image URL (optional)"
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"
      />
      <div className="flex gap-2">
        <button
          onClick={save}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Save
        </button>
        <button
          onClick={onCancel}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
