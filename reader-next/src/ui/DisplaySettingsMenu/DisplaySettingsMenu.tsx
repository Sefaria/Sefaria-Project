import type { KeyboardEvent, ReactNode } from "react";
import {
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  stepFontSize,
  type BiLayout,
  type ContentLanguage,
  type DisplayMenuAvailability,
  type Layout,
  type LayoutKey,
  type ReaderSettings,
  type Vowels,
} from "~/lib/reader/settings";
import { InterfaceText } from "../InterfaceText/InterfaceText";
import { SegmentedControl } from "../SegmentedControl/SegmentedControl";
import { Switch } from "../Switch/Switch";
import styles from "./DisplaySettingsMenu.module.css";

export interface DisplaySettingsMenuProps {
  settings: ReaderSettings;
  /** Which controls apply to the text being read (see `displayMenuAvailability`). */
  availability: DisplayMenuAvailability;
  /** Which stored layout this book uses (Tanakh and Talmud have their own). */
  layoutKey: LayoutKey;
  onChange: (patch: Partial<ReaderSettings>) => void;
  /** Directions of the shown primary and translation texts: they choose the layout icons and options, as the old LayoutButtons. */
  directions?: { primary?: "rtl" | "ltr"; translation?: "rtl" | "ltr" };
  /** "Record session": start recording the reading session (features/reader-state/recording). Omitted, the entry is not shown. */
  onRecordSession?: () => void;
  /** "Load recording…", shown beside it: open a recording file to replay. */
  onLoadRecording?: () => void;
}

type LayoutOption = Layout | BiLayout;
/** The old constants.js layoutOptions, by the old calculateLayoutState: one text; two texts in one direction; two that differ. */
const LAYOUT_OPTIONS: Record<"mono" | "bi-rtl" | "bi-ltr" | "mixed", LayoutOption[]> = {
  mono: ["continuous", "segmented"],
  "bi-rtl": ["stacked", "heRight"],
  "bi-ltr": ["stacked", "heLeft"],
  mixed: ["stacked", "heLeft", "heRight"],
};
const LAYOUT_LABELS: Record<LayoutOption, string> = {
  continuous: "Show Text as a Paragraph",
  segmented: "Show Text Segmented",
  stacked: "Show Source & Translation Stacked",
  heLeft: "Show RTL Text Left of LTR Text",
  heRight: "Show RTL Text Right of LTR Text",
};
/** The old LayoutButtons getPath: the icon shows which side goes where. */
function layoutIcon(option: LayoutOption, state: keyof typeof LAYOUT_OPTIONS, dirs: { primary: string; translation: string }) {
  if (state !== "mixed") return `/icons/${state}-${option}.svg`;
  const order = option === "heLeft" ? dirs.primary + dirs.translation : dirs.translation + dirs.primary;
  return `/icons/mixed-${option === "stacked" ? "stacked" : "beside"}-${order}.svg`;
}

const t = (en: string, he: string): ReactNode => <InterfaceText en={en} he={he} />;

/**
 * The "Aa" menu: language, layout, font size, vowels, cantillation, aliyot and Talmud punctuation. Only
 * the options that apply to the text on screen are shown (the rules live in `displayMenuAvailability`).
 * Replaces ReaderDisplayOptionsMenu, SourceTranslationsButtons, LayoutButtons and FontSizeButtons.
 *
 * @feature SHL-017 @feature TXD-031 @feature TXD-033 @feature TXD-034 @feature TXD-036 @feature TXD-037 @feature TXD-038
 * @feature TXD-041 @feature SHL-019 @feature SHL-020
 */
export function DisplaySettingsMenu({ settings, availability: a, layoutKey, onChange, directions, onRecordSession, onLoadRecording }: DisplaySettingsMenuProps) {
  const bilingual = settings.language === "bilingual";
  const layoutValue: Layout | BiLayout = bilingual ? settings.biLayout : settings[layoutKey];

  const primary = directions?.primary ?? "rtl";
  const translation = directions?.translation ?? (primary === "rtl" ? "ltr" : "rtl");
  const state = !bilingual ? "mono" : primary !== translation ? "mixed" : primary === "rtl" ? "bi-rtl" : "bi-ltr";
  const layoutSection = a.layout ? (
    <section className={styles.line} aria-label="Layout">
      <span className={styles.lineLabel}>{t("Layout", "פריסה")}</span>
      <SegmentedControl<LayoutOption>
        iconOnly
        appearance="tiles"
        label="text layout toggle"
        value={layoutValue}
        onValueChange={(v) => onChange(bilingual ? { biLayout: v as BiLayout } : { [layoutKey]: v as Layout })}
        options={LAYOUT_OPTIONS[state].map((value) => ({ value, label: LAYOUT_LABELS[value], iconUrl: layoutIcon(value, state, { primary, translation }) }))}
      />
    </section>
  ) : null;

  const aliyot = a.aliyot ? <Switch label={t("Aliyot", "עליות")} checked={settings.aliyotTorah} onCheckedChange={(aliyotTorah) => onChange({ aliyotTorah })} /> : null;

  // The order sefaria.org uses (VERIFIED 2026-10-05): language, layout, aliyot, font size, vowels, cantillation (Talmud's punctuation with the aliyot)
  return (
    <div className={styles.menu} onKeyDown={wrapTab}>
      <section className={styles.languages}>
        <SegmentedControl<ContentLanguage>
          block
          appearance="rows"
          label="Source-translation toggle"
          value={settings.language}
          onValueChange={(language) => onChange({ language })}
          options={[
            { value: "hebrew", label: t("Source", "מקור"), ariaLabel: "Source" },
            { value: "english", label: t("Translation", "תרגום"), ariaLabel: "Translation" },
            { value: "bilingual", label: t("Source with Translation", "מקור ותרגום"), ariaLabel: "Source with Translation" },
          ]}
        />
      </section>

      {layoutSection ? <><hr className={styles.divider} />{layoutSection}</> : null}
      {aliyot}
      {a.punctuation ? (
        <Switch label={t("Punctuation", "פיסוק")} checked={settings.punctuationTalmud} onCheckedChange={(punctuationTalmud) => onChange({ punctuationTalmud })} />
      ) : null}

      {a.fontSize ? (
        <>
          <hr className={styles.divider} />
          <section className={styles.fontSize} aria-label="Font size">
            <button type="button" className={styles.round} aria-label="Smaller text" disabled={settings.fontSize <= MIN_FONT_SIZE + 0.01} onClick={() => onChange({ fontSize: stepFontSize(settings.fontSize, "smaller") })}>
              <img src="/icons/reduce_font.svg" alt="" width={24} height={24} />
            </button>
            <span className={styles.lineLabel}>{t("Font Size", "גודל גופן")}</span>
            <button type="button" className={styles.round} aria-label="Larger text" disabled={settings.fontSize >= MAX_FONT_SIZE - 0.01} onClick={() => onChange({ fontSize: stepFontSize(settings.fontSize, "larger") })}>
              <img src="/icons/enlarge_font.svg" alt="" width={24} height={24} />
            </button>
          </section>
        </>
      ) : null}

      {a.vowels || a.cantillation ? <hr className={styles.divider} /> : null}
      {a.vowels ? (
        <Switch
          label={t("Vowels", "ניקוד")}
          checked={settings.vowels !== "none"}
          // Old behaviour: turning vowels on shows nikud only; cantillation is a separate switch.
          onCheckedChange={(on) => onChange({ vowels: (on ? "partial" : "none") as Vowels })}
        />
      ) : null}
      {a.cantillation ? (
        <Switch
          label={t("Cantillation", "טעמי מקרא")}
          checked={settings.vowels === "all"}
          disabled={!a.cantillationEnabled}
          disabledReason={t("Turn on vowels first", "יש להפעיל ניקוד תחילה")}
          onCheckedChange={(on) => onChange({ vowels: (on ? "all" : "partial") as Vowels })}
        />
      ) : null}

      {/* Not on sefaria.org: the reader state API's recording (docs/READER_STATE_API.md), last so the old menu above stays as measured */}
      {onRecordSession ? (
        <>
          <hr className={styles.divider} />
          <section className={styles.session} aria-label="Session recording">
            <button type="button" className={styles.sessionButton} onClick={onRecordSession}>
              <span className={styles.recordDot} aria-hidden="true" />
              {t("Record session", "הקלטת מפגש")}
            </button>
            {onLoadRecording ? (
              <button type="button" className={styles.sessionLink} onClick={onLoadRecording}>
                {t("Load recording…", "טעינת הקלטה…")}
              </button>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

const TABBABLE = 'a[href], button, input, select, textarea, [tabindex]';

/**
 * Tab stays inside the menu while it is open, wrapping from its last control to its first and back, as legacy's (I18-004): before, Tab
 * went on into the text behind it with the menu still covering it (a11y S9). Escape (the Popover's) closes it and returns focus.
 */
function wrapTab(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Tab" || e.altKey || e.ctrlKey || e.metaKey) return;
  const stops = [...e.currentTarget.querySelectorAll<HTMLElement>(TABBABLE)].filter(
    (el) => el.tabIndex >= 0 && !(el as HTMLButtonElement).disabled && el.getAttribute("aria-disabled") !== "true" && el.getClientRects().length > 0,
  );
  if (!stops.length) return;
  const first = stops[0]!, last = stops.at(-1)!;
  const at = document.activeElement;
  if (e.shiftKey ? at === first || !e.currentTarget.contains(at) : at === last) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
}
