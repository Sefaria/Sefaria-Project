// The "/" menu's list: a listbox the caret's text controls (combobox pattern: focus stays in the canvas).
import type { SlashItem } from './slash';
import styles from './Canvas.module.css';

export interface SlashMenuProps {
  id: string;
  items: readonly SlashItem[];
  active: number;
  position: { top: number; left: number } | null;
  onPick(item: SlashItem): void;
  onHover(index: number): void;
}

export function SlashMenu({ id, items, active, position, onPick, onHover }: SlashMenuProps) {
  return (
    <div
      className={styles.slash}
      data-top={position?.top}
      ref={(el) => {
        // Placed next to the caret. The editor's CSP allows style attributes (style-src-attr), not <style>.
        if (el && position) {
          el.style.top = `${position.top}px`;
          el.style.left = `${position.left}px`;
        }
      }}
    >
      {items.length === 0 ? (
        <p className={styles.slashEmpty}>No matching blocks</p>
      ) : (
        <ul id={id} role="listbox" aria-label="Insert a block">
          {items.map((item, index) => (
            <li
              key={item.id}
              id={`${id}-${item.id}`}
              role="option"
              aria-selected={index === active}
              className={index === active ? styles.slashActive : undefined}
              onMouseDown={(e) => {
                e.preventDefault();
                onPick(item);
              }}
              onMouseEnter={() => onHover(index)}
            >
              <span className={styles.slashLabel}>{item.label}</span>
              <span className={styles.slashDescription}>{item.description}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
