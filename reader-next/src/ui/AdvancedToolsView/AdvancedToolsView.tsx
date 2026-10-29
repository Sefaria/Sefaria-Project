import { FilterRow } from "../ConnectionsPanel/FilterRow";

export interface AdvancedToolsViewProps {
  onAddTranslation: () => void;
  onAddConnection: () => void;
  /** Signed in, on a version that may be edited: "Edit Text" (the old AdvancedToolsList's editText). */
  onEditText?: () => void;
}

/**
 * Advanced: Add Translation and Add Connection — what a reader who is not signed in sees (VERIFIED on sefaria.org);
 * both open the sign-up modal. Signed in, Edit Text follows when the shown version may be edited. Linker Admin stays in Django.
 *
 * @feature CON-062 Add translation
 * @feature CON-065 Create connection between two texts
 * @feature CON-011 Sign-in gating across sidebar tools
 */
export function AdvancedToolsView({ onAddTranslation, onAddConnection, onEditText }: AdvancedToolsViewProps) {
  return (
    <div>
      <FilterRow label={{ en: "Add Translation", he: "הוספת תרגום" }} icon="translate" color="var(--sefaria-color-text-secondary)" href="#add-translation" onNavigate={onAddTranslation} />
      <FilterRow label={{ en: "Add Connection", he: "הוספת קישור לטקסט אחר" }} icon="link" color="var(--sefaria-color-text-secondary)" href="#add-connection" onNavigate={onAddConnection} />
      {onEditText ? <FilterRow label={{ en: "Edit Text", he: "עריכת טקסט" }} icon="pencil" color="var(--sefaria-color-text-secondary)" href="#edit-text" onNavigate={onEditText} /> : null}
    </div>
  );
}
