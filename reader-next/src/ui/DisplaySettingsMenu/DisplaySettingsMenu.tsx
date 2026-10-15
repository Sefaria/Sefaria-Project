import type { ReactNode } from "react";
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
import { Icon } from "../Icon/Icon";
import { Switch } from "../Switch/Switch";
import styles from "./DisplaySettingsMenu.module.css";

export interface DisplaySettingsMenuProps {
  settings: ReaderSettings;
  /** Which controls apply to the text being read (see `displayMenuAvailability`). */
  availability: DisplayMenuAvailability;
  /** Which stored layout this book uses (Tanakh and Talmud have their own). */
  layoutKey: LayoutKey;
  onChange: (patch: Partial<ReaderSettings>) => void;
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
export function DisplaySettingsMenu({ settings, availability: a, layoutKey, onChange }: DisplaySettingsMenuProps) {
  const bilingual = settings.language === "bilingual";
  const layoutValue: Layout | BiLayout = bilingual ? settings.biLayout : settings[layoutKey];

  const layoutSection = a.layout ? (
    <section className={styles.line} aria-label="Layout">
      <span className={styles.lineLabel}>{t("Layout", "פריסה")}</span>
      {bilingual ? (
        <SegmentedControl<BiLayout>
          iconOnly
          appearance="tiles"
          label="Layout"
          value={layoutValue as BiLayout}
          onValueChange={(biLayout) => onChange({ biLayout })}
          options={[
            { value: "stacked", label: "Stacked", icon: "layout-stacked" },
            { value: "heLeft", label: "Hebrew on the left", icon: "layout-he-left" },
            { value: "heRight", label: "Hebrew on the right", icon: "layout-he-right" },
          ]}
        />
      ) : (
        <SegmentedControl<Layout>
          iconOnly
          appearance="tiles"
          label="Layout"
          value={layoutValue as Layout}
          onValueChange={(layout) => onChange({ [layoutKey]: layout })}
          options={[
            { value: "segmented", label: "Verse by verse", icon: "layout-segmented" },
            { value: "continuous", label: "Continuous", icon: "layout-continuous" },
          ]}
        />
      )}
    </section>
  ) : null;

  const aliyot = a.aliyot ? <Switch label={t("Aliyot", "עליות")} checked={settings.aliyotTorah} onCheckedChange={(aliyotTorah) => onChange({ aliyotTorah })} /> : null;

  // The order sefaria.org uses (VERIFIED 2026-10-05): language, layout, aliyot, font size, vowels, cantillation (Talmud's punctuation with the aliyot)
  return (
    <div className={styles.menu}>
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
              <Icon name="circle-minus" size="24px" />
            </button>
            <span className={styles.lineLabel}>{t("Font Size", "גודל גופן")}</span>
            <button type="button" className={styles.round} aria-label="Larger text" disabled={settings.fontSize >= MAX_FONT_SIZE - 0.01} onClick={() => onChange({ fontSize: stepFontSize(settings.fontSize, "larger") })}>
              <Icon name="circle-plus" size="24px" />
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
    </div>
  );
}
