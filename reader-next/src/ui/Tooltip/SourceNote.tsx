import { Tooltip } from "./Tooltip";
import styles from "./SourceNote.module.css";

export interface SourceNoteProps {
  /** Why this topic is here: 'This topic is connected to "Genesis 1:2" by Aspaklaria.' */
  note: string;
}

/**
 * The grey round button with three solid dots beside a topic's name; hovering or focusing it shows who
 * connected the topic to the passage. Its accessible name is the note. The old
 * `<ToolTipped classes="saveButton tooltip-toggle three-dots-button"><img src="three-dots.svg"></ToolTipped>`.
 *
 * @feature CON-046 Topics for this ref
 * @feature CON-045 Named entity popup in sidebar
 */
export function SourceNote({ note }: SourceNoteProps) {
  return (
    <Tooltip content={note} side="start" labels>
      {(props) => (
        <button type="button" className={styles.dots} {...props}>
          {/* static/img/three-dots.svg: three filled circles */}
          <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true" focusable="false">
            <circle cx="3" cy="12" r="3" />
            <circle cx="12" cy="12" r="3" />
            <circle cx="21" cy="12" r="3" />
          </svg>
        </button>
      )}
    </Tooltip>
  );
}
