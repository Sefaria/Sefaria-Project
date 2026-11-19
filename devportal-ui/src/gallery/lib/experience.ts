export type ExperienceLevel = 'none' | 'beginner' | 'intermediate' | 'advanced';

/** Ordinal order, lightest to darkest in the chart. */
export const EXPERIENCE_LEVELS: readonly ExperienceLevel[] = ['none', 'beginner', 'intermediate', 'advanced'];

export const EXPERIENCE_LABELS: Record<ExperienceLevel, string> = {
  none: 'No experience',
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

const RAW_TO_LEVEL: Record<string, ExperienceLevel> = {
  None: 'none',
  '<5 years': 'beginner',
  '5-10 years': 'intermediate',
  '10+ years': 'advanced',
};

/** Null for blank, unspecified or unrecognised values. */
export function parseExperience(raw: string | null | undefined): ExperienceLevel | null {
  return (raw ? RAW_TO_LEVEL[raw.trim()] : undefined) ?? null;
}
