// Armory Wall — Active Cores. Groups tracked revision chapters into the four
// core columns rendered on the Overview tab and PDF Page 1.
import { getAllItems, type RevisionItem } from "@/lib/revision-engine";

export type ArmoryGroupKey = "t1" | "t2" | "t3" | "t4" | "t5";

export type ArmoryGroup = {
  key: ArmoryGroupKey;
  label: string;
  tiers: RevisionItem["tier"][];
  color: string;
  glow: string;
  entries: { name: string; count: number }[];
};

export const ARMORY_GROUPS: Omit<ArmoryGroup, "entries">[] = [
  { key: "t1", label: "Tier I · Bronze", tiers: [1], color: "#A9683C", glow: "rgba(169,104,60,0.65)" },
  { key: "t2", label: "Tier II · Iron", tiers: [2], color: "#EF4444", glow: "rgba(239,68,68,0.65)" },
  { key: "t3", label: "Tier III · Steel", tiers: [3], color: "#A855F7", glow: "rgba(168,85,247,0.65)" },
  { key: "t4", label: "Tier IV · Titanium", tiers: [4], color: "#3B82F6", glow: "rgba(59,130,246,0.65)" },
  { key: "t5", label: "Tier V · Platinum", tiers: [5], color: "#F5C542", glow: "rgba(245,197,66,0.7)" },
];



/**
 * Build the 5 tier columns with de-duplicated topic subtext (name x loops).
 *
 * Zero-tier rule: a chapter only appears on the wall once it has actually
 * CLAIMED a badge in the Library (`displayTier` is set). Unrevised chapters
 * are never bucketed into Bronze (or any other tier) by default.
 *
 * Multiplier: mirrors the Library shield — `displayLoopCount + 1` is the
 * number of completed recall loops for the displayed badge.
 */
export function buildArmoryGroups(): ArmoryGroup[] {
  const chapters = getAllItems().filter(
    (c) => !c.paused && c.displayTier != null,
  );
  const libraryTier = (c: RevisionItem): RevisionItem["tier"] =>
    c.displayTier as RevisionItem["tier"];
  return ARMORY_GROUPS.map((g) => {
    const items = chapters.filter((c) => g.tiers.includes(libraryTier(c)));
    const counts = new Map<string, number>();
    items.forEach((c) => {
      const loops = Math.max(1, (c.displayLoopCount ?? 0) + 1);
      counts.set(c.name, Math.max(counts.get(c.name) ?? 0, loops));
    });
    return {
      ...g,
      entries: Array.from(counts.entries()).map(([name, count]) => ({ name, count })),
    };
  });
}
