import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  email: string | null;
  created_at: string;
  /** Optional role column on `profiles` ("admin" grants console access). */
  role?: string | null;
};

type AuthGateReason =
  | "bookmark"
  | "reward"
  | "habit"
  | "review"
  | "profile"
  | "generic";

export const GATE_COPY: Record<AuthGateReason, string> = {
  bookmark: "Sign in to bookmark chapters and sync them across devices.",
  reward: "Sign in to claim this reward and bank it to your record.",
  habit: "Sign in to save your habits and keep your streaks safe.",
  review: "Sign in to leave a review.",
  profile: "Sign in to manage your profile.",
  generic: "Sign in to continue.",
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  /** Global auth modal state */
  modalOpen: boolean;
  modalReason: AuthGateReason;
  openAuthModal: (reason?: AuthGateReason) => void;
  closeAuthModal: () => void;
  /** Returns true when signed in; otherwise opens the modal and returns false. */
  requireAuth: (reason?: AuthGateReason) => boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalReason, setModalReason] = useState<AuthGateReason>("generic");

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    try {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle();
      setProfile((data as Profile | null) ?? null);
    } catch (err) {
      console.error("[auth] failed to load profile", err);
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let active = true;

    // Supabase can land the user back on ANY route with an auth callback in the
    // URL (email confirmation, magic link, OAuth). Clean it up and send them to
    // a real screen instead of letting the router blow up on an unknown URL.
    const settleAuthCallback = () => {
      try {
        if (typeof window === "undefined") return;
        const { hash, search, pathname } = window.location;
        const params = new URLSearchParams(
          (hash.startsWith("#") ? hash.slice(1) : hash) || search.slice(1),
        );
        const isRecovery = params.get("type") === "recovery";
        const hasToken =
          params.has("access_token") || params.has("code") || params.has("error_description");
        if (!hasToken) return;

        if (isRecovery) {
          if (pathname !== "/reset-password") {
            window.location.replace(`/reset-password${hash || ""}`);
          }
          return;
        }
        window.history.replaceState({}, "", pathname === "/" ? "/home" : pathname);
        if (pathname === "/") window.location.replace("/home");
      } catch (err) {
        console.error("[auth] callback handling failed", err);
      }
    };

    settleAuthCallback();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      try {
        if (!active) return;
        setSession(next);
        // Avoid calling other supabase methods inside the callback.
        setTimeout(() => {
          void loadProfile(next?.user?.id).catch((err) =>
            console.error("[auth] profile refresh failed", err),
          );
        }, 0);
      } catch (err) {
        console.error("[auth] onAuthStateChange handler failed", err);
      }
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        return loadProfile(data.session?.user?.id);
      })
      .catch((err) => console.error("[auth] getSession failed", err))
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      try {
        sub.subscription.unsubscribe();
      } catch {
        /* ignore */
      }
    };
  }, [loadProfile]);


  const openAuthModal = useCallback((reason: AuthGateReason = "generic") => {
    setModalReason(reason);
    setModalOpen(true);
  }, []);

  const closeAuthModal = useCallback(() => setModalOpen(false), []);

  const requireAuth = useCallback(
    (reason: AuthGateReason = "generic") => {
      if (session?.user) return true;
      openAuthModal(reason);
      return false;
    },
    [session, openAuthModal],
  );

  const refreshProfile = useCallback(
    () => loadProfile(session?.user?.id),
    [loadProfile, session],
  );

  const signOut = useCallback(async () => {
    try {
      if (typeof window !== "undefined") {
        localStorage.removeItem("ftlb.devpass.admin");
        localStorage.removeItem("isAdmin");
      }
    } catch {
      /* ignore */
    }
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      profile,
      loading,
      modalOpen,
      modalReason,
      openAuthModal,
      closeAuthModal,
      requireAuth,
      refreshProfile,
      signOut,
    }),
    [
      session,
      profile,
      loading,
      modalOpen,
      modalReason,
      openAuthModal,
      closeAuthModal,
      requireAuth,
      refreshProfile,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Display initials for the avatar fallback. */
export function initialsFor(name?: string | null, email?: string | null): string {
  const source = (name ?? "").trim() || (email ?? "").split("@")[0] || "Student";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
