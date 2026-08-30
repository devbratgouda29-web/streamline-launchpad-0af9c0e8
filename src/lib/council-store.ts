// THE WAR COUNCIL — localStorage store for the multiplayer accountability cell.
// Real-life friends only: no random matchmaking, no public directories.
// A single user can create/join exactly ONE council; max 5 members per council.

// Canonical 5-tier core evolution names — enforced app-wide.
export const CORE_TIERS = [
  "BRONZE CORE",
  "IRON CORE",
  "STEEL SENTINEL",
  "TITANIUM WARDEN",
  "PLATINUM CORE",
] as const;
export type CoreTier = (typeof CORE_TIERS)[number];

export type MemberDailyStats = {
  wakeUpAt: number | null; // ms epoch of today's wake-up
  focusMinutes: number;
  tasksDone: number;
  tasksTotal: number;
  revisionCoresCleared: number;
  // e.g. { "Electrostatics": "PLATINUM CORE" }
  chapterCores: Record<string, string>;
  // completed re-loop count per chapter (0 = first pass, 1 = one re-loop, ...)
  coreLoops?: Record<string, number>;
  tier: string; // e.g. "Sovereign"
  characterRank: string; // e.g. "Field Marshal"
};

export type MockScore = {
  id: string;
  memberTag: string;
  examName: string;
  score: number;
  scoreMax: number;
  loggedAt: number;
};


export type ExileVote = {
  targetTag: string;
  voterTag: string;
  down: boolean;
  at: number;
};

export type ChatMessage = {
  id: string;
  memberTag: string;
  kind: "text" | "image";
  body: string; // text or grayscale data URL
  at: number;
};

export type Member = {
  userTag: string; // #USR-XXXX
  userId?: string; // Supabase auth user id (when signed in) — used to sync avatars
  name: string;
  joinedAt: number;
  isLeader: boolean;
  productivityRank: number; // in-app leaderboard rank (1..5)
  daily: MemberDailyStats;
  warlordUntil?: number; // ms epoch; if in the future -> gold aura
};

export type Council = {
  councilTag: string; // #CNL-XXXX
  name: string;
  createdAt: number;
  members: Member[];
  chat: ChatMessage[];
  mockLedger: MockScore[];
  votes: ExileVote[];
  lastDailyReportAt?: number;
  lastWarlordAt?: number;
};

export type Me = { userTag: string; name: string; userId?: string };


const K_ME = "ftlb.council.me.v1";
const K_COUNCIL = "ftlb.council.v1";
const MAX = 5;

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeCouncil(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}
function emit() {
  for (const l of listeners) l();
}

function rand(n: number) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}
export function makeUserTag() {
  return "#USR-" + rand(4);
}
export function makeCouncilTag() {
  return "#CNL-" + rand(4);
}

// -------- Me --------
export function getMe(): Me {
  if (typeof window === "undefined") return { userTag: "#USR-XXXX", name: "You" };
  try {
    const raw = localStorage.getItem(K_ME);
    if (raw) return JSON.parse(raw);
  } catch {}
  const me: Me = { userTag: makeUserTag(), name: "You" };
  localStorage.setItem(K_ME, JSON.stringify(me));
  return me;
}
export function setMyName(name: string) {
  const me = getMe();
  const next = { ...me, name: name.trim() || me.name };
  localStorage.setItem(K_ME, JSON.stringify(next));
  const c = getCouncil();
  if (c) {
    const m = c.members.find((x) => x.userTag === next.userTag);
    if (m) {
      m.name = next.name;
      save(c);
    }
  }
  emit();
}

/** Link the local council identity to the signed-in Supabase user (for avatar sync). */
export function setMyUserId(userId: string | null | undefined) {
  if (typeof window === "undefined") return;
  const me = getMe();
  const c = getCouncil();
  const memberNeedsStamp =
    c?.members.some((m) => m.userTag === me.userTag && m.userId !== (userId ?? undefined)) ?? false;
  if (me.userId === (userId ?? undefined) && !memberNeedsStamp) return;
  const next: Me = { ...me, ...(userId ? { userId } : {}) };
  if (!userId) delete next.userId;
  localStorage.setItem(K_ME, JSON.stringify(next));
  if (c) {
    const m = c.members.find((x) => x.userTag === me.userTag);
    if (m) {
      if (userId) m.userId = userId;
      else delete m.userId;
      save(c);
      return;
    }
  }
  emit();
}



// -------- Council --------
export function getCouncil(): Council | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(K_COUNCIL);
    return raw ? (JSON.parse(raw) as Council) : null;
  } catch {
    return null;
  }
}

function save(c: Council | null) {
  if (typeof window === "undefined") return;
  if (c === null) localStorage.removeItem(K_COUNCIL);
  else localStorage.setItem(K_COUNCIL, JSON.stringify(c));
  emit();
}

function defaultDaily(): MemberDailyStats {
  return {
    wakeUpAt: null,
    focusMinutes: 0,
    tasksDone: 0,
    tasksTotal: 0,
    revisionCoresCleared: 0,
    chapterCores: {},
    coreLoops: {},
    tier: "Recruit",
    characterRank: "Cadet",
  };
}

const SAMPLE_CORES = ["Electrostatics", "Kinematics", "Organic", "Trigonometry"];
// Global progression rules — tiers/ranks map 1:1 to app level bands (0..14).
const TIERS = ["Recruit", "Squire", "Knight", "Warlord", "Sovereign"];
const CHAR_RANKS = [
  "Cadet",
  "Corporal",
  "Sergeant",
  "Lieutenant",
  "Captain",
  "Major",
  "Colonel",
  "Commander",
  "Brigadier",
  "General",
  "High General",
  "Warlord",
  "Overlord",
  "Sovereign",
  "Field Marshal",
];

// Deterministic derivation from measured effort — no random placeholders.
export function deriveProgression(daily: Pick<MemberDailyStats, "focusMinutes" | "tasksDone" | "revisionCoresCleared">) {
  const score = daily.focusMinutes + daily.tasksDone * 30 + daily.revisionCoresCleared * 45;
  const rankIdx = Math.min(CHAR_RANKS.length - 1, Math.floor(score / 60));
  const tierIdx = Math.min(TIERS.length - 1, Math.floor(rankIdx / 3));
  return { tier: TIERS[tierIdx], characterRank: CHAR_RANKS[rankIdx] };
}

function randomDaily(): MemberDailyStats {
  const cores: Record<string, string> = {};
  const loops: Record<string, number> = {};
  SAMPLE_CORES.forEach((c, idx) => {
    cores[c] = CORE_TIERS[Math.min(CORE_TIERS.length - 1, idx)];
    loops[c] = idx === 0 ? 2 : idx === 1 ? 1 : 0;
  });
  const totalT = 4 + Math.floor(Math.random() * 6);
  const wakeHour = 5 + Math.floor(Math.random() * 3);
  const wake = new Date();
  wake.setHours(wakeHour, Math.floor(Math.random() * 60), 0, 0);
  const base = {
    focusMinutes: 60 + Math.floor(Math.random() * 300),
    tasksDone: Math.floor(Math.random() * (totalT + 1)),
    revisionCoresCleared: Math.floor(Math.random() * 5),
  };
  const prog = deriveProgression(base);
  return {
    wakeUpAt: wake.getTime(),
    ...base,
    tasksTotal: totalT,
    chapterCores: cores,
    coreLoops: loops,
    ...prog,
  };
}



function recomputeRanks(c: Council) {
  const sorted = [...c.members].sort((a, b) => {
    const sa = a.daily.focusMinutes + a.daily.tasksDone * 30 + a.daily.revisionCoresCleared * 45;
    const sb = b.daily.focusMinutes + b.daily.tasksDone * 30 + b.daily.revisionCoresCleared * 45;
    return sb - sa;
  });
  sorted.forEach((m, i) => {
    const t = c.members.find((x) => x.userTag === m.userTag)!;
    t.productivityRank = i + 1;
  });
}

export function forgeCouncil(name: string): Council {
  const me = getMe();
  const c: Council = {
    councilTag: makeCouncilTag(),
    name: name.trim() || "The War Council",
    createdAt: Date.now(),
    members: [
      {
        userTag: me.userTag,
        ...(me.userId ? { userId: me.userId } : {}),

        name: me.name,
        joinedAt: Date.now(),
        isLeader: true,
        productivityRank: 1,
        daily: defaultDaily(),
      },
    ],
    chat: [
      {
        id: "sys-" + Date.now(),
        memberTag: "#SYSTEM",
        kind: "text",
        body: `Council forged. Share ${""} your Council Tag with real-life allies only.`,
        at: Date.now(),
      },
    ],
    mockLedger: [],
    votes: [],
  };
  save(c);
  return c;
}

export function joinCouncilByTag(tag: string): { ok: boolean; error?: string } {
  const clean = tag.trim().toUpperCase();
  const c = getCouncil();
  if (!c) return { ok: false, error: "No council with that tag exists on this device." };
  if (clean !== c.councilTag.toUpperCase())
    return { ok: false, error: "Tag mismatch. Verify with the Leader." };
  const me = getMe();
  if (c.members.some((m) => m.userTag === me.userTag))
    return { ok: false, error: "You are already in this council." };
  if (c.members.length >= MAX)
    return { ok: false, error: "Council is full. Max 5 members." };
  c.members.push({
    userTag: me.userTag,
    ...(me.userId ? { userId: me.userId } : {}),

    name: me.name,
    joinedAt: Date.now(),
    isLeader: false,
    productivityRank: c.members.length + 1,
    daily: defaultDaily(),
  });
  save(c);
  return { ok: true };
}

// For demo: add a simulated ally (still a "real friend" the leader added by tag).
// Represents another device's user; keeps the ecosystem playable on one device.
export function addSimulatedAlly(name: string): { ok: boolean; error?: string } {
  const c = getCouncil();
  if (!c) return { ok: false, error: "No council." };
  if (c.members.length >= MAX) return { ok: false, error: "Council is full (5/5)." };
  c.members.push({
    userTag: makeUserTag(),
    name: name.trim() || "Ally",
    joinedAt: Date.now(),
    isLeader: false,
    productivityRank: c.members.length + 1,
    daily: randomDaily(),
  });
  recomputeRanks(c);
  save(c);
  return { ok: true };
}

export function leaveCouncil() {
  const me = getMe();
  const c = getCouncil();
  if (!c) return;
  c.members = c.members.filter((m) => m.userTag !== me.userTag);
  if (c.members.length === 0) {
    save(null);
    return;
  }
  if (!c.members.some((m) => m.isLeader)) c.members[0].isLeader = true;
  save(c);
}

export function dissolveCouncil() {
  save(null);
}

// -------- Chat --------
export function sendChat(text: string) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  const t = text.trim();
  if (!t) return;
  c.chat.push({
    id: "m-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    memberTag: me.userTag,
    kind: "text",
    body: t,
    at: Date.now(),
  });
  save(c);
}

export type ImageCheck = { ok: true; dataUrl: string } | { ok: false; error: string };

// Anti-distraction filter:
// - reject vibrant / high-saturation images (memes, photos, screenshots with heavy color)
// - reject files > 400 KB
// - convert survivors to high-contrast monochrome document-scanner grayscale
export async function processAcademicImage(file: File): Promise<ImageCheck> {
  if (!file.type.startsWith("image/"))
    return { ok: false, error: "Only image files are allowed." };
  if (file.size > 400 * 1024)
    return {
      ok: false,
      error: "Image too large (limit 400 KB). Compress or crop to the diagram only.",
    };
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { ok: false, error: "Could not read image." };

  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { ok: false, error: "Canvas unavailable." };
  ctx.drawImage(bitmap, 0, 0, w, h);

  const img = ctx.getImageData(0, 0, w, h);
  const data = img.data;
  // Sample every ~50th pixel for saturation analysis
  let vividCount = 0;
  let samples = 0;
  for (let i = 0; i < data.length; i += 4 * 50) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    if (sat > 0.35 && max > 60) vividCount++;
    samples++;
  }
  const vividRatio = samples ? vividCount / samples : 0;
  if (vividRatio > 0.12) {
    return {
      ok: false,
      error:
        "Only clear, high-contrast academic diagrams or proofs are allowed.",
    };
  }

  // Convert to high-contrast monochrome (document scanner style)
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Luma
    let y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    // High-contrast S-curve around ~150
    y = Math.max(0, Math.min(255, (y - 150) * 1.9 + 200));
    data[i] = data[i + 1] = data[i + 2] = y;
  }
  ctx.putImageData(img, 0, 0);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
  if (dataUrl.length > 350 * 1024 * 1.4)
    return { ok: false, error: "Processed image still too large. Crop tighter." };
  return { ok: true, dataUrl };
}

export function sendImage(dataUrl: string) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  c.chat.push({
    id: "i-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
    memberTag: me.userTag,
    kind: "image",
    body: dataUrl,
    at: Date.now(),
  });
  save(c);
}

// -------- Mock ledger --------
export function logMockScore(input: { examName: string; score: number; scoreMax: number }) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  c.mockLedger.push({
    id: "mk-" + Date.now(),
    memberTag: me.userTag,
    examName: input.examName.trim() || "Mock",
    score: Math.max(0, Math.floor(input.score)),
    scoreMax: Math.max(1, Math.floor(input.scoreMax)),
    loggedAt: Date.now(),
  });
  save(c);
}


// -------- Vote to exile --------
export function castExileVote(targetTag: string, down: boolean) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  if (targetTag === me.userTag) return;
  // remove any previous vote from me on this target in the last 24h
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  c.votes = c.votes.filter(
    (v) => !(v.voterTag === me.userTag && v.targetTag === targetTag) && v.at >= cutoff,
  );
  c.votes.push({ targetTag, voterTag: me.userTag, down, at: Date.now() });
  // check kick threshold: 3 of remaining 4 downvotes in a 24h window
  const others = c.members.filter((m) => m.userTag !== targetTag);
  const downs = c.votes.filter(
    (v) => v.targetTag === targetTag && v.down && v.at >= cutoff,
  ).length;
  if (others.length >= 4 && downs >= 3) {
    c.members = c.members.filter((m) => m.userTag !== targetTag);
    c.chat = c.chat.filter((m) => m.memberTag !== targetTag);
    c.mockLedger = c.mockLedger.filter((m) => m.memberTag !== targetTag);
    c.votes = c.votes.filter((v) => v.targetTag !== targetTag && v.voterTag !== targetTag);
    c.chat.push({
      id: "sys-" + Date.now(),
      memberTag: "#SYSTEM",
      kind: "text",
      body: `${targetTag} was exiled by council vote. Data purged. Slot open.`,
      at: Date.now(),
    });
  }
  save(c);
}

export function activeDownVotes(targetTag: string): number {
  const c = getCouncil();
  if (!c) return 0;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  return c.votes.filter((v) => v.targetTag === targetTag && v.down && v.at >= cutoff).length;
}

// -------- Warlord (Sunday midnight) --------
export function maybeCrownWarlord() {
  const c = getCouncil();
  if (!c || c.members.length === 0) return;
  const now = new Date();
  // Find most-recent past Sunday 00:00
  const sun = new Date(now);
  const day = sun.getDay(); // 0 Sun..6 Sat
  sun.setHours(0, 0, 0, 0);
  sun.setDate(sun.getDate() - day);
  if (c.lastWarlordAt && c.lastWarlordAt >= sun.getTime()) return;
  const winner = [...c.members].sort((a, b) => {
    const sa = a.daily.focusMinutes + a.daily.tasksDone * 30 + a.daily.revisionCoresCleared * 45;
    const sb = b.daily.focusMinutes + b.daily.tasksDone * 30 + b.daily.revisionCoresCleared * 45;
    return sb - sa;
  })[0];
  c.members.forEach((m) => (m.warlordUntil = undefined));
  winner.warlordUntil = sun.getTime() + 7 * 24 * 60 * 60 * 1000;
  c.lastWarlordAt = Date.now();
  c.chat.push({
    id: "sys-" + Date.now(),
    memberTag: "#SYSTEM",
    kind: "text",
    body: `👑 ${winner.name} (${winner.userTag}) is this week's Council Warlord.`,
    at: Date.now(),
  });
  save(c);
}

// -------- Self stats (current user) --------
export function updateMyDaily(patch: Partial<MemberDailyStats>) {
  const c = getCouncil();
  const me = getMe();
  if (!c) return;
  const m = c.members.find((x) => x.userTag === me.userTag);
  if (!m) return;
  m.daily = { ...m.daily, ...patch, ...deriveProgression({ ...m.daily, ...patch }) };
  recomputeRanks(c);
  save(c);
}

export const MAX_MEMBERS = MAX;
