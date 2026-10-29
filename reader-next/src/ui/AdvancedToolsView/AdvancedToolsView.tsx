import { FilterRow } from "../ConnectionsPanel/FilterRow";

export interface AdvancedToolsViewProps {
  onAddTranslation: () => void;
  onAddConnection: () => void;
  /** Signed in, on a version that may be edited: "Edit Text" (the old AdvancedToolsList's editText). */
  onEditText?: () => void;
  /** Moderators on a dictionary: "Change Lexicon Headword" and "Edit Lexicon Content" (#3730). */
  onLexiconHeadword?: () => void;
  onLexiconContent?: () => void;
}

/**
 * Advanced: Add Translation and Add Connection — what a reader who is not signed in sees (VERIFIED on sefaria.org);
 * both open the sign-up modal. Signed in, Edit Text follows when the shown version may be edited. Linker Admin stays in Django.
 *
 * @feature CON-062 Add translation
 * @feature CON-065 Create connection between two texts
 * @feature CON-011 Sign-in gating across sidebar tools
 * @feature CON-063 Edit text
 * @feature CON-072 Edit a dictionary entry (moderator)
 */
export function AdvancedToolsView({ onAddTranslation, onAddConnection, onEditText, onLexiconHeadword, onLexiconContent }: AdvancedToolsViewProps) {
  return (
    <div>
      <FilterRow label={{ en: "Add Translation", he: "הוספת תרגום" }} icon="translate" color="var(--sefaria-color-text-secondary)" href="#add-translation" onNavigate={onAddTranslation} />
      <FilterRow label={{ en: "Add Connection", he: "הוספת קישור לטקסט אחר" }} icon="link" color="var(--sefaria-color-text-secondary)" href="#add-connection" onNavigate={onAddConnection} />
      {onEditText ? <FilterRow label={{ en: "Edit Text", he: "עריכת טקסט" }} icon="pencil" color="var(--sefaria-color-text-secondary)" href="#edit-text" onNavigate={onEditText} /> : null}
      {onLexiconHeadword ? <FilterRow label={{ en: "Change Lexicon Headword", he: "שינוי ערך ראשי במילון" }} icon="pencil" color="var(--sefaria-color-text-secondary)" href="#lexicon-headword" onNavigate={onLexiconHeadword} /> : null}
      {onLexiconContent ? <FilterRow label={{ en: "Edit Lexicon Content", he: "עריכת תוכן ערך מילוני" }} icon="pencil" color="var(--sefaria-color-text-secondary)" href="#lexicon-content" onNavigate={onLexiconContent} /> : null}
    </div>
  );
}
