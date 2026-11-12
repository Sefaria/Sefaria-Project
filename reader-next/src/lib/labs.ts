/**
 * Labs: features that are built but not yet on for everyone (follow me, recording). Off unless switched on, two ways:
 *  - PUBLIC_LABS on the server: the deployment's default, a comma-separated list of lab names ("follow_me,recording") — a cauldron or
 *    a local dev server turns its labs on here.
 *  - Remote config (Django admin, /admin/remote_config/remoteconfigentry/): a bool entry `feature.reader.labs.<name>`, active, overrides
 *    the deployment's default either way — on for staging or production without a deploy, or off at once (the kill switch).
 * Pure, so it can be tested; useLab (src/features/reader-state/labs.ts) reads it in components.
 */
export const LABS = ["follow_me", "recording"] as const;
export type LabName = (typeof LABS)[number];

/** The remote-config key that switches a lab: "feature.reader.labs.follow_me". */
export const labKey = (name: LabName) => `feature.reader.labs.${name}`;

/** PUBLIC_LABS → the known lab names it lists (unknown names and blanks are dropped). */
export function parseLabs(raw: string | undefined): LabName[] {
  const names = (raw ?? "").split(",").map((s) => s.trim());
  return LABS.filter((l) => names.includes(l));
}

/** Is this lab on? A remote-config bool wins; otherwise the deployment's default. */
export function labEnabled(name: LabName, remote: Record<string, unknown> | undefined, deploymentDefault: readonly string[] | undefined): boolean {
  const v = remote?.[labKey(name)];
  if (typeof v === "boolean") return v;
  return !!deploymentDefault?.includes(name);
}
