import { useState } from "react";
import {
  BookOpen,
  Sparkles,
  ShieldCheck,
  Timer,
  Trophy,
  FileText,
  Award,
  Library,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type ProfileModalKey = "guide" | "about" | "privacy" | null;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-5 text-[11px] font-black uppercase tracking-[0.22em] text-amber-500">
      {children}
    </h3>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>;
}

function Shell({
  open,
  onOpenChange,
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  icon: typeof BookOpen;
  eyebrow: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] gap-0 overflow-y-auto rounded-3xl border-amber-400/25 bg-card p-0 sm:max-w-md">
        <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-5 pb-4 pt-5 backdrop-blur">
          <DialogHeader className="space-y-1 text-left">
            <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-400/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.2em] text-amber-500">
              <Icon className="h-3 w-3" /> {eyebrow}
            </span>
            <DialogTitle className="text-xl font-black leading-tight">{title}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {subtitle}
            </DialogDescription>
          </DialogHeader>
        </div>
        <div className="px-5 pb-6 pt-1">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

type GuideTab = "focus" | "ranks" | "badges" | "library" | "reports";

const GUIDE_TABS: { id: GuideTab; label: string; icon: typeof Timer }[] = [
  { id: "focus", label: "Focus", icon: Timer },
  { id: "ranks", label: "Ranks", icon: Trophy },
  { id: "badges", label: "Badges", icon: Award },
  { id: "library", label: "Library", icon: Library },
  { id: "reports", label: "Reports", icon: FileText },
];

export function ProfileInfoModals({
  active,
  onClose,
}: {
  active: ProfileModalKey;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<GuideTab>("focus");
  const set = (v: boolean) => {
    if (!v) onClose();
  };

  return (
    <>
      {/* ---------------- App Guide ---------------- */}
      <Shell
        open={active === "guide"}
        onOpenChange={set}
        icon={BookOpen}
        eyebrow="App Guide"
        title="How to use the Bench"
        subtitle="Every system that turns study hours into proof."
      >
        <div className="mt-3 flex gap-1.5 overflow-x-auto rounded-2xl bg-secondary p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {GUIDE_TABS.map((t) => {
            const Icon = t.icon;
            const on = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={
                  "flex shrink-0 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition " +
                  (on ? "bg-amber-400 text-black" : "text-muted-foreground hover:text-foreground")
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "focus" && (
          <div>
            <SectionTitle>Focus Engine &amp; HUD</SectionTitle>
            <Body>
              Set your session timer before you open a chapter. Once it starts, the HUD locks to the
              session — a fixed heads-up display of remaining time, current subject and live streak.
              No tab shuffling, no "just five minutes" negotiations with yourself.
            </Body>
            <Body>
              Still in flow when the clock runs low? Tap <b>+10 Min Overtime</b> for an emergency
              extension. Overtime is recorded separately, so extending never breaks or resets the
              integrity of the session record.
            </Body>
            <Body>
              When you're done, hit <b>Finish &amp; Claim</b>. The session is sealed with an honest
              recall check — you answer from memory what you actually covered before the hours are
              logged. No recall, no credit.
            </Body>
          </div>
        )}

        {tab === "ranks" && (
          <div>
            <SectionTitle>Discipline Rank Ladder</SectionTitle>
            <Body>
              Every claimed focus hour feeds your weekly total. Cross a threshold and you climb the
              five-tier ladder. Ranks are based on the current week only — they are earned again,
              every week.
            </Body>
            <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
              <li>• Tier 1 — Novice Scholar · 20–30 hrs</li>
              <li>• Tier 2 — Steady Grinder · 30–45 hrs</li>
              <li>• Tier 3 — Relentless · 45–60 hrs</li>
              <li>• Tier 4 — Elite Bench · 60–70 hrs</li>
              <li>• Tier 5 — Apex Mastery · 70+ hrs</li>
            </ul>
            <Body>
              Totals recalculate automatically every <b>Sunday at 23:59</b>, then the week resets.
              Slack a week and the crest slips back down the ladder.
            </Body>
          </div>
        )}

        {tab === "badges" && (
          <div>
            <SectionTitle>Shields, Badges &amp; Milestones</SectionTitle>
            <Body>
              Shields are permanent proof of behaviour, not of a single good day. They unlock only
              from verified study logs — sessions sealed with a passed recall check.
            </Body>
            <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
              <li>
                • <b className="text-foreground">Streak Shields</b> — awarded for unbroken daily
                focus. Miss a day and the active streak resets; the shield you already earned stays.
              </li>
              <li>
                • <b className="text-foreground">Consistency Seals</b> — granted for hitting your
                weekly hour target several weeks in a row, rewarding rhythm over bursts.
              </li>
              <li>
                • <b className="text-foreground">Mastery Badges</b> — unlocked by reaching a rank
                tier and holding it, marking sustained deep-work volume.
              </li>
              <li>
                • <b className="text-foreground">Overtime Badges</b> — earned by stacking +10 min
                extensions across sessions, proof you kept going past the bell.
              </li>
            </ul>
            <Body>
              Retention matters: active streaks keep milestone progress alive, while an idle week
              pauses progress toward the next seal.
            </Body>
          </div>
        )}

        {tab === "library" && (
          <div>
            <SectionTitle>My Library &amp; Material Hub</SectionTitle>
            <Body>
              Upload your own PDFs — notes, past papers, textbook chapters — and organise them into
              subject folders so every material has one home instead of five downloads folders.
            </Body>
            <Body>
              The in-app PDF reader syncs with an active focus timer: open a document while a
              session runs and the HUD keeps counting alongside it, attributing the time to that
              chapter automatically.
            </Body>
            <Body>
              Purchased note packs land in the same library, in your chosen language, ready to read
              inside a timed session.
            </Body>
          </div>
        )}

        {tab === "reports" && (
          <div>
            <SectionTitle>Performance Transcripts &amp; PDF Export</SectionTitle>
            <Body>
              From the Performance screen, export an official multi-page weekly transcript: focus
              totals, rank progression, the full five-tier hierarchy, and your weekly chapter
              revision log.
            </Body>
            <Body>
              Each entry carries chapter logs and session timestamps, so the report is a printable
              record of what you studied and exactly when — not a screenshot of a number.
            </Body>
            <Body>
              It's a real receipt for the work you did — share it with a mentor, a parent, or your
              own future self.
            </Body>
          </div>
        )}
      </Shell>

      {/* ---------------- About the Platform ---------------- */}
      <Shell
        open={active === "about"}
        onOpenChange={set}
        icon={Sparkles}
        eyebrow="About the Platform"
        title="Built in the Shadows of Self-Study"
        subtitle="The manifesto behind From The Last Bench."
      >
        <SectionTitle>Section 1 · The Creator's Story</SectionTitle>
        <Body>
          This platform was built by Devbrat — not from a coaching hub, not with a mentor on speed
          dial, but from a desk with a single lamp and too many unanswered questions. Privilege
          opens doors; execution decides what happens once you are inside. Having faced failed
          attempts, wasted months, and syllabi abandoned halfway despite access to top-tier
          resources, the uncomfortable truth became clear: resources don't win battles, execution
          does. What changed wasn't magic motivation — it was building a system that refused to let
          me lie to myself about the hours actually put in.
        </Body>

        <SectionTitle>Section 2 · Why "From The Last Bench"?</SectionTitle>
        <Body>
          Society has a habit of writing off the person sitting on the last bench. They assume it's
          the place for the distracted, the underachievers, and those who aren't "gifted" enough to
          sit in the front row.
        </Body>
        <Body>We are here to change that narrative completely.</Body>
        <Body>
          This platform was built specifically for the student who doesn't feel like a born genius.
          It's for those who look at the "top scorers" and feel intimidated, wondering if they
          simply lack the raw talent to compete.
        </Body>
        <Body>
          Here is what nobody tells you: Daily, relentless effort beats raw talent every single day.
          Talent might give someone a head start, but unapplied genius always gets overtaken by the
          person who simply refuses to stop showing up. It might feel like you are falling behind
          right now, but consistency compounds in silence. At the end of the road, the last bencher
          who stayed consistent is the one who wins.
        </Body>

        <SectionTitle>Section 3 · The Unforgiving Truth About Solitude</SectionTitle>
        <Body>
          We live in an age of infinite content. You can buy the best lectures, download thousands
          of PDFs, and sit in the most expensive classrooms. But when the screen turns off and the
          door closes, none of that matters.
        </Body>
        <Body>
          What determines your destiny are those quiet, unglamorous, and often painful lonely hours
          of self-study.
        </Body>
        <Body>
          It's just you, your desk, and your willingness to sit in silence when your mind is
          desperate for a distraction. That single daily battle against your own hesitation is the
          ultimate equalizer. Until you master those silent hours, no amount of privilege or content
          can save you.
        </Body>

        <SectionTitle>Section 4 · Why This Platform Exists</SectionTitle>
        <Body>
          I built From The Last Bench to be a companion for anyone sitting alone at 2 AM trying to
          rewrite their story.
        </Body>
        <Body>
          This isn't just a timer or a fancy dashboard — it's an engine designed to enforce
          accountability:
        </Body>
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            • <b className="text-foreground">Sealing Your Focus:</b> Forcing honest recall instead
            of passive reading.
          </li>
          <li>
            • <b className="text-foreground">Earned Mastery:</b> Tracking true deep-work discipline,
            not vanity metrics.
          </li>
          <li>
            • <b className="text-foreground">Unforgiving Metrics:</b> Giving you an honest
            transcript of where your time actually went.
          </li>
        </ul>
        <Body>
          No fluff. No fake motivation. Just a tool built by someone who learned the hard way that
          self-study is where champions are forged.
        </Body>

        <blockquote className="mt-6 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-4 text-center">
          <p className="text-sm font-black italic leading-relaxed text-amber-500">
            "Master the solitude. Outwork the talent. Win the day."
          </p>
          <footer className="mt-2 text-[10px] font-black uppercase tracking-[0.24em] text-muted-foreground">
            — Devbrat
          </footer>
        </blockquote>
      </Shell>

      {/* ---------------- Privacy & Terms ---------------- */}
      <Shell
        open={active === "privacy"}
        onOpenChange={set}
        icon={ShieldCheck}
        eyebrow="Privacy & Terms"
        title="Your data, your desk"
        subtitle="What we store, what stays with you, and the rules of use."
      >
        <SectionTitle>Local-first storage</SectionTitle>
        <Body>
          Your uploaded PDFs, study logs, timers and recall notes are stored on your own device.
          They are not uploaded, mined, or sold. Clearing your browser data clears them too.
        </Body>

        <SectionTitle>Account data</SectionTitle>
        <Body>
          If you sign in, we keep only what's needed to run your account: name, email, profile
          photo and your purchase and rank records. Nothing else leaves your device.
        </Body>

        <SectionTitle>Session privacy</SectionTitle>
        <Body>
          Focus sessions, recall answers and revision logs are personal. No leaderboards expose
          your raw hours, and no session content is shared without your action.
        </Body>

        <SectionTitle>Terms of use</SectionTitle>
        <Body>
          Notes and materials are licensed for your personal study only — no redistribution,
          resale, or reuploading. Misuse or account sharing may end access. The platform is
          provided as-is for study support; your results remain your responsibility.
        </Body>

        <Body>
          Questions or a deletion request? Reach out from the email on your account and we'll
          action it.
        </Body>
      </Shell>
    </>
  );
}
