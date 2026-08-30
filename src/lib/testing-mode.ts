// Global demo / testing switch.
//
// While IS_TESTING_MODE is true every user is treated as Premium: the
// Discipline subscription gate never locks, payment modals are skipped and
// every note pack, tier badge, custom shield and Math Alarm option is
// available. Flip to `false` to restore real paywalls.
export const IS_TESTING_MODE = false;

/** True when the app should treat the current user as fully unlocked. */
export function isUnlockedForTesting(): boolean {
  return IS_TESTING_MODE;
}
