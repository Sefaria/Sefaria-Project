// The request form: "Path Params", "Query Params", "Header Params", "Body Params" cards, one row per parameter.
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { FormField } from '../model/fields';
import { useEndpoint } from '../state';
import { Icon } from '../ui/icons';
import { CopyButton, Markdown } from '../ui/primitives';
import styles from './Article.module.css';

// The pixel harness frames states on these section headers (regions.ts anchors).
const VISUAL_ANCHORS: Record<string, string> = {
  'path-params': 'pathParams',
  'query-params': 'queryParams',
  'body-params': 'bodyParams',
  'response-schemas': 'responseSection',
};

export function SectionHeader({ id, title, deviation }: { id?: string; title: string; deviation?: string }) {
  return (
    <header
      id={id}
      className={styles.sectionHeader}
      data-visual-region={id === undefined ? undefined : VISUAL_ANCHORS[id]}
    >
      <h2 className={styles.sectionTitle} data-visual="sectionHeader" data-visual-deviation={deviation}>
        {title}
      </h2>
      {id !== undefined ? (
        <a href={`#${id}`} className={styles.sectionAnchor} aria-label={`Skip link to ${title}`}>
          <Icon name="anchor" className={styles.anchorIcon} />
        </a>
      ) : null}
    </header>
  );
}

/**
 * Moves focus among the menu's entries with the arrow keys (they are out of the Tab order, as on live); false when
 * there is nowhere to go (ArrowUp on the first entry, or from the input).
 */
function moveInMenu(event: KeyboardEvent<HTMLElement>, menu: HTMLElement | null, from: 'input' | 'item') {
  if (menu === null || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return false;
  const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
  if (items.length === 0) return false;
  const at = from === 'input' ? -1 : items.indexOf(event.currentTarget);
  const next = event.key === 'ArrowDown' ? Math.min(at + 1, items.length - 1) : at - 1;
  const target = items[next];
  if (next < 0 || target === undefined) return false;
  event.preventDefault();
  target.focus();
  return true;
}

function ExampleMenu({
  field,
  onUse,
  onItemKeyDown,
}: {
  field: FormField;
  onUse: (value: string) => void;
  onItemKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <>
      <div className={styles.comboType}>
        <Icon name="help-circle" className={styles.comboTypeIcon} />
        <span className={styles.comboTypeKey}>type:</span>
        <span className={styles.comboTypeValue}>{field.typeLabel}</span>
      </div>
      <div className={styles.comboDivider} role="separator" />
      {field.examples.map((example, i) => (
        <button
          key={`${example.value}-${i}`}
          type="button"
          role="menuitem"
          // Live's entries are not Tab stops: Tab from the input goes on to the next field and closes the list.
          tabIndex={-1}
          className={styles.comboItem}
          onClick={() => onUse(example.value)}
          onKeyDown={onItemKeyDown}
        >
          <span className={styles.comboItemTitle}>Use example value</span>
          <span className={styles.comboItemValue}>{example.value}</span>
        </button>
      ))}
    </>
  );
}

function TextInput({ field }: { field: FormField }) {
  const { values, setValue } = useEndpoint();
  const value = values[field.key] ?? '';
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = `${field.inputId}__examples`;
  // Focus back on the input from the list without reopening it (Escape), or keeping it open (ArrowUp).
  const reopen = useRef(true);
  const backToInput = (keepOpen: boolean) => {
    reopen.current = keepOpen;
    inputRef.current?.focus();
    reopen.current = true;
    if (!keepOpen) setOpen(false);
  };
  return (
    <div
      className={styles.inputWrap}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <input
        ref={inputRef}
        id={field.inputId}
        className={styles.input}
        data-visual="paramInput"
        type="text"
        role="combobox"
        aria-labelledby={field.labelId}
        aria-expanded={open && field.examples.length > 0}
        aria-controls={listId}
        aria-haspopup="dialog"
        aria-autocomplete="none"
        autoComplete="off"
        spellCheck={false}
        placeholder={field.placeholder}
        value={value}
        // Focus opens the list, by click or by keyboard (live: focus and click both open it); Tab moves on.
        onFocus={() => {
          if (reopen.current) setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          else if (!open && event.key === 'ArrowDown') setOpen(true);
          else if (open) moveInMenu(event, menuRef.current, 'input');
        }}
        onChange={(event) => setValue(field.key, event.target.value)}
      />
      {open && field.examples.length > 0 ? (
        <div className={styles.comboFrame} data-visual-region="popover">
          <div
            ref={menuRef}
            id={listId}
            role="menu"
            aria-label={`Examples for ${field.name}`}
            className={styles.comboPanel}
          >
            <ExampleMenu
              field={field}
              onUse={(v) => {
                setValue(field.key, v);
                setOpen(false);
              }}
              onItemKeyDown={(event) => {
                if (event.key === 'Escape') backToInput(false);
                else if (!moveInMenu(event, menuRef.current, 'item') && event.key === 'ArrowUp') {
                  event.preventDefault();
                  backToInput(true);
                }
              }}
            />
          </div>
        </div>
      ) : (
        <span id={listId} hidden />
      )}
    </div>
  );
}

const PLACEHOLDER = '__placeholder__';

function SelectInput({ field }: { field: FormField }) {
  const { values, setValue } = useEndpoint();
  const value = values[field.key] ?? '';
  const showPlaceholder = value === '' && field.placeholder !== '';
  return (
    <div className={styles.selectWrap}>
      <select
        id={field.inputId}
        aria-labelledby={field.labelId}
        data-visual="paramSelect"
        className={[styles.select, showPlaceholder ? styles.selectPlaceholder : ''].filter(Boolean).join(' ')}
        value={showPlaceholder ? PLACEHOLDER : value}
        onChange={(event) => setValue(field.key, event.target.value === PLACEHOLDER ? '' : event.target.value)}
      >
        {/* As live: a hidden, disabled first option shows the example while nothing is chosen. */}
        {field.placeholder !== '' ? (
          <option value={PLACEHOLDER} hidden disabled>
            {field.placeholder}
          </option>
        ) : null}
        <option value="" />
        {(field.enumValues ?? []).map((v) => (
          <option key={v} value={v}>
            {v}
          </option>
        ))}
      </select>
      <Icon name="chevron-up-down" className={styles.selectCaret} />
    </div>
  );
}

function AllowedValues({ values }: { values: string[] }) {
  return (
    <div className={styles.enumSection}>
      <span className={styles.enumLabel}>Allowed:</span>
      <div className={styles.enumValues}>
        {values.map((v) => (
          <CopyButton key={v} text={v} className={styles.enumChip} label={v} visual="enumChip">
            <code className={styles.enumValue} title={v}>
              {v}
            </code>
          </CopyButton>
        ))}
      </div>
    </div>
  );
}

function FieldHeader({ field }: { field: FormField }) {
  const Name = field.children === null ? 'label' : 'span';
  return (
    <div className={styles.paramHeader} id={field.anchorId ?? undefined}>
      <Name
        id={field.labelId}
        data-visual="paramName"
        className={styles.paramName}
        {...(field.children === null ? { htmlFor: field.inputId } : {})}
      >
        {field.name}
      </Name>
      <div className={styles.paramType} data-visual="paramType">
        {field.typeLabel}
      </div>
      {field.enumValues !== null ? <div className={styles.paramType}>enum</div> : null}
      {field.required ? (
        <div className={styles.paramRequired} data-visual="paramRequired">
          required
        </div>
      ) : null}
      {field.deprecated ? <div className={styles.paramDeprecated}>deprecated</div> : null}
      {field.defaultValue !== null ? (
        <div className={styles.paramDefault} data-visual="paramDefault">
          Defaults to {field.defaultValue}
        </div>
      ) : null}
      {field.anchorId !== null ? (
        <a href={`#${field.anchorId}`} className={styles.paramAnchor} aria-label={`Skip link to ${field.name}`}>
          <Icon name="anchor" className={styles.anchorIcon} />
        </a>
      ) : null}
    </div>
  );
}

function ObjectExpander({ field, odd }: { field: FormField; odd: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section
      className={[styles.expand, open ? styles.expandOpen : '', odd ? styles.expandOdd : ''].filter(Boolean).join(' ')}
    >
      <button type="button" className={styles.expandButton} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={styles.expandLabel}>{`${field.name} ${field.typeLabel}`}</span>
        <Icon name={open ? 'x' : 'plus'} className={styles.expandIcon} />
      </button>
      {open && field.children !== null ? (
        <div className={styles.expandChildren}>
          <FieldList fields={field.children} depth={1} />
        </div>
      ) : null}
    </section>
  );
}

function FieldRow({ field, depth }: { field: FormField; depth: number }) {
  let control: ReactNode = null;
  if (field.children === null) {
    control = field.enumValues !== null ? <SelectInput field={field} /> : <TextInput field={field} />;
  }
  return (
    <div className={styles.paramRow}>
      <div className={styles.paramContent}>
        <div className={styles.paramLeft}>
          <FieldHeader field={field} />
          {field.description !== '' ? (
            <div className={styles.paramDescription}>
              <Markdown source={field.description} id={`${field.inputId}__description`} visual="paramDesc" />
            </div>
          ) : null}
          {field.children !== null ? <ObjectExpander field={field} odd={depth % 2 === 0} /> : null}
        </div>
        {control !== null ? <div className={styles.paramForm}>{control}</div> : null}
      </div>
      {field.enumValues !== null ? <AllowedValues values={field.enumValues} /> : null}
    </div>
  );
}

export function FieldList({ fields, depth = 0 }: { fields: FormField[]; depth?: number }) {
  return (
    <div className={styles.paramList}>
      {fields.map((field) => (
        <FieldRow key={field.key} field={field} depth={depth} />
      ))}
    </div>
  );
}

const SECTIONS = [
  ['path', 'Path Params'],
  ['query', 'Query Params'],
  ['header', 'Headers'],
  ['cookie', 'Cookies'],
] as const;

/** The request form, live's `form#api-request-form`. */
export function Params() {
  const { form, language } = useEndpoint();
  return (
    <form className={styles.form} id="api-request-form" name="Parameters" onSubmit={(e) => e.preventDefault()}>
      {SECTIONS.map(([location, title]) =>
        form[location].length > 0 ? (
          <div key={location}>
            <SectionHeader
              id={`${location}-params`}
              title={title}
              // D-4: live relabels "Path Params" as "Metadata" for its Node `api` SDK; the portal does not.
              deviation={location === 'path' && language.id === 'node' ? 'D-4' : undefined}
            />
            <div className={styles.paramContainer} data-visual="paramContainer" data-visual-region="paramCard">
              <FieldList fields={form[location]} />
            </div>
          </div>
        ) : null
      )}
      {form.body.length > 0 ? (
        <div>
          <SectionHeader id="body-params" title="Body Params" />
          <div className={styles.paramContainer} data-visual="paramContainer" data-visual-region="paramCard">
            {form.bodyDescription !== '' ? (
              <div className={styles.bodyDescription}>
                <Markdown source={form.bodyDescription} visual="paramDesc" />
              </div>
            ) : null}
            <div className={form.bodyDescription !== '' ? styles.bodyFields : undefined}>
              <FieldList fields={form.body} />
            </div>
          </div>
        </div>
      ) : null}
    </form>
  );
}
