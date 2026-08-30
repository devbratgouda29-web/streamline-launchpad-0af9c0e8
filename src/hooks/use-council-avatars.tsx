import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Member } from "@/lib/council-store";

export type AvatarMap = Record<string, string>;

/**
 * Fetches `avatar_url` from `profiles` for every council member linked to a
 * Supabase user, and keeps it live via a Realtime subscription so a photo
 * uploaded on the Profile tab shows up for everyone instantly.
 */
export function useCouncilAvatars(members: Member[] | undefined): AvatarMap {
  const ids = useMemo(
    () =>
      Array.from(
        new Set((members ?? []).map((m) => m?.userId).filter((v): v is string => Boolean(v))),
      ).sort(),
    [members],
  );
  const key = ids.join(",");
  const [avatars, setAvatars] = useState<AvatarMap>({});

  useEffect(() => {
    if (!ids.length) {
      setAvatars({});
      return;
    }
    let active = true;

    const load = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, avatar_url")
        .in("id", ids);
      if (!active) return;
      const next: AvatarMap = {};
      for (const row of data ?? []) {
        if (row?.avatar_url) next[row.id] = row.avatar_url;
      }
      setAvatars(next);
    };

    void load();

    const channel = supabase
      .channel("council-profile-avatars")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        (payload) => {
          const row = (payload.new ?? {}) as { id?: string; avatar_url?: string | null };
          if (!row.id || !ids.includes(row.id)) return;
          setAvatars((prev) => {
            const next = { ...prev };
            if (row.avatar_url) next[row.id!] = row.avatar_url;
            else delete next[row.id!];
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return avatars;
}

/** Two-letter fallback initials for a member name. */
export function memberInitials(name?: string | null): string {
  const source = (name ?? "").trim() || "Ally";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}
