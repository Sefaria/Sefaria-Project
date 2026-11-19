/**
 * `sefaria.settings` (personal): the reader's display settings. The settings provider owns them and registers this slice
 * (features/reader/settings-context.tsx), so nothing here touches cookies: `apply` with `persist: false` — a replay, someone being
 * followed — shows the settings without making them the person's own.
 */
import type { ApplyContext, StateSlice } from "~/lib/reader-state/core/types";
import { MAX_FONT_SIZE, MIN_FONT_SIZE, type ReaderSettings } from "~/lib/reader/settings";

export const SETTINGS_SLICE_ID = "sefaria.settings";
export const SETTINGS_SLICE_VERSION = 1;

/** Allowed values of every enumerated setting; booleans and the font size are checked apart. Kept beside the type so a new setting fails here. */
const CHOICES: { [K in keyof ReaderSettings]: ReaderSettings[K] extends string ? readonly ReaderSettings[K][] : "boolean" | "fontSize" } = {
  language: ["hebrew", "english", "bilingual"],
  layoutDefault: ["segmented", "continuous"],
  layoutTalmud: ["segmented", "continuous"],
  layoutTanakh: ["segmented", "continuous"],
  biLayout: ["stacked", "heLeft", "heRight"],
  vowels: ["all", "partial", "none"],
  punctuationTalmud: "boolean",
  aliyotTorah: "boolean",
  fontSize: "fontSize",
  color: ["light", "sepia", "dark"],
};

const KEYS = Object.keys(CHOICES) as (keyof ReaderSettings)[];

/** Every setting present with an allowed value. Extra keys (a newer client's) are tolerated here and dropped by {@link pickSettings}. */
export function isReaderSettings(x: unknown): x is ReaderSettings {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return KEYS.every((k) => {
    if (!Object.prototype.hasOwnProperty.call(o, k)) return false;
    const v = o[k];
    const rule = CHOICES[k];
    if (rule === "boolean") return typeof v === "boolean";
    if (rule === "fontSize") return typeof v === "number" && Number.isFinite(v) && v >= MIN_FONT_SIZE - 1e-9 && v <= MAX_FONT_SIZE + 1e-9;
    return typeof v === "string" && (rule as readonly string[]).includes(v);
  });
}

/** Only the known settings, so nothing from outside rides along into state. */
export function pickSettings(s: ReaderSettings): ReaderSettings {
  const out = {} as Record<keyof ReaderSettings, unknown>;
  for (const k of KEYS) out[k] = s[k];
  return out as ReaderSettings;
}

export interface SettingsSliceSource {
  get(): ReaderSettings;
  apply(settings: ReaderSettings, ctx: ApplyContext): void;
  subscribe(onChange: () => void): () => void;
}

export function createSettingsSlice(source: SettingsSliceSource): StateSlice<ReaderSettings> {
  return {
    id: SETTINGS_SLICE_ID,
    version: SETTINGS_SLICE_VERSION,
    scope: "personal",
    get: () => source.get(),
    apply: (value, ctx) => source.apply(pickSettings(value), ctx),
    subscribe: (cb) => source.subscribe(cb),
    validate: isReaderSettings,
  };
}
