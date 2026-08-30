import { IS_TESTING_MODE } from "@/lib/testing-mode";

// 5-day trial + rolling 30-day paid subscription gate for the Discipline hub.

const TRIAL_KEY = "ftlb.sub.trialStartedAt";
const PAID_KEY = "ftlb.sub.paidUntil";
const TRIAL_MS = 5 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

function readNum(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

export function getTrialStartedAt(): number {
  const existing = readNum(TRIAL_KEY);
  if (existing) return existing;
  const now = Date.now();
  try { localStorage.setItem(TRIAL_KEY, String(now)); } catch {}
  return now;
}

export function getPaidUntil(): number | null {
  return readNum(PAID_KEY);
}

export function trialRemainingMs(now: number = Date.now()): number {
  const started = getTrialStartedAt();
  return Math.max(0, started + TRIAL_MS - now);
}

export function trialDaysRemaining(now: number = Date.now()): number {
  return Math.ceil(trialRemainingMs(now) / (24 * 60 * 60 * 1000));
}

export function isSubscriptionActive(now: number = Date.now()): boolean {
  // Demo mode: everyone is Premium, no payment ever required.
  if (IS_TESTING_MODE) return true;
  if (trialRemainingMs(now) > 0) return true;
  const paidUntil = getPaidUntil();
  return !!paidUntil && paidUntil > now;
}

export function isTrialActive(now: number = Date.now()): boolean {
  if (IS_TESTING_MODE) return false;
  return trialRemainingMs(now) > 0;
}

/** Simulate a successful payment — extends 30 days from now. */
export function simulatePayment(): number {
  const until = Date.now() + MONTH_MS;
  try { localStorage.setItem(PAID_KEY, String(until)); } catch {}
  return until;
}

export function paidDaysRemaining(now: number = Date.now()): number {
  const paid = getPaidUntil();
  if (!paid || paid <= now) return 0;
  return Math.ceil((paid - now) / (24 * 60 * 60 * 1000));
}

/** True while a paid 30-day window is still running. */
export function isPaidActive(now: number = Date.now()): boolean {
  const paidUntil = getPaidUntil();
  return !!paidUntil && paidUntil > now;
}

/**
 * Account-anchored trial: 5 free days counted from the user's account
 * `created_at` timestamp (works across devices, unlike the local fallback).
 */
export function accountTrialRemainingMs(createdAtMs: number | null, now: number = Date.now()): number {
  if (!createdAtMs || !Number.isFinite(createdAtMs)) return 0;
  return Math.max(0, createdAtMs + TRIAL_MS - now);
}

export function accountTrialDaysRemaining(createdAtMs: number | null, now: number = Date.now()): number {
  return Math.ceil(accountTrialRemainingMs(createdAtMs, now) / (24 * 60 * 60 * 1000));
}
