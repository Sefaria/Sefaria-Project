// "Response" / "Responses": one accordion per status (an `h3 > button`, fixing live's `h1`), the first expanded on
// load as live does after hydration, each with its "RESPONSE BODY" schema.
import { useId, useState } from 'react';
import type { OperationResponse } from '../../contracts';
import { sortedResponses } from '../model/responses';
import {
  asSchema,
  description as schemaDescription,
  mergeAllOf,
  objectProperties,
  schemaType,
  typeLabel,
  unionVariants,
  variantLabel,
  type Schema,
} from '../model/schema';
import { useEndpoint } from '../state';
import { Icon } from '../ui/icons';
import { Markdown, StatusDot } from '../ui/primitives';
import { SectionHeader } from './Params';
import styles from './Schema.module.css';

function nestedSchema(schema: Schema): Schema | null {
  const s = mergeAllOf(schema);
  const type = schemaType(s);
  if (type === 'object' && objectProperties(s).length > 0) return s;
  if (type === 'array') {
    const items = mergeAllOf(asSchema(s.items));
    if (unionVariants(items) !== null || schemaType(items) === 'array') return items;
    if (schemaType(items) === 'object' && objectProperties(items).length > 0) return items;
  }
  return null;
}

/** A card listing a schema: its type, its description, then its properties (live's `rm-ParamContainer`). */
function SchemaCard({ schema, depth, nested }: { schema: Schema; depth: number; nested: boolean }) {
  const s = mergeAllOf(schema);
  const props = objectProperties(s);
  const variants = unionVariants(s);
  const text = schemaDescription(s);
  if (variants !== null && nested) {
    // A nameless union (the items of `text array`): live shows only the variant select, full width, then the
    // chosen variant; no "one of" type row.
    return (
      <div className={`${styles.nestedCard} ${styles.namelessCard}`}>
        <UnionBody variants={variants} depth={depth + 1} nameless />
      </div>
    );
  }
  return (
    <div className={nested ? styles.nestedCard : styles.card}>
      <div className={styles.typeRow}>{variants !== null ? 'one of' : typeLabel(s)}</div>
      {text !== '' ? (
        <div className={styles.descriptionRow}>
          <Markdown source={text} />
        </div>
      ) : null}
      {variants !== null ? (
        <div className={styles.propsBlock}>
          <UnionBody variants={variants} depth={depth + 1} />
        </div>
      ) : props.length > 0 ? (
        <div className={styles.propsBlock}>
          {props.map((p) => (
            <PropertyRow key={p.name} name={p.name} schema={p.schema} required={p.required} depth={depth} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function UnionSelect({
  id,
  label,
  variants,
  value,
  onChange,
}: {
  id: string;
  label: string;
  variants: Schema[];
  value: number;
  onChange: (index: number) => void;
}) {
  return (
    <span className={styles.unionWrap}>
      <select
        id={id}
        aria-label={label}
        className={styles.unionSelect}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {variants.map((v, i) => (
          <option key={i} value={i}>
            {variantLabel(v)}
          </option>
        ))}
      </select>
    </span>
  );
}

function UnionBody({ variants, depth, nameless = false }: { variants: Schema[]; depth: number; nameless?: boolean }) {
  const [index, setIndex] = useState(0);
  const selectId = useId();
  const chosen = variants[index] ?? variants[0] ?? {};
  const nested = nestedSchema(chosen);
  if (nameless) {
    return (
      <>
        <div className={styles.namelessHeader}>
          <UnionSelect id={selectId} label={'Schema variant'} variants={variants} value={index} onChange={setIndex} />
        </div>
        <div className={styles.namelessVariant}>
          {nested !== null ? <SchemaCard schema={nested} depth={depth} nested /> : null}
        </div>
      </>
    );
  }
  return (
    <div className={styles.unionBody}>
      <UnionSelect id={selectId} label={'Schema variant'} variants={variants} value={index} onChange={setIndex} />
      {nested !== null ? <SchemaCard schema={nested} depth={depth} nested /> : null}
    </div>
  );
}

function Expander({ name, schema, depth }: { name: string; schema: Schema; depth: number }) {
  const [open, setOpen] = useState(false);
  const label = `${name} ${schemaType(schema) === 'array' ? 'array' : 'object'}`;
  const nested = nestedSchema(schema);
  return (
    <section
      className={[styles.expand, open ? styles.expandOpen : ''].filter(Boolean).join(' ')}
      data-visual-region={open ? 'schemaArrayExpander' : undefined}
    >
      <button type="button" className={styles.expandButton} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={styles.expandLabel}>{label}</span>
        <Icon name={open ? 'x' : 'plus'} className={styles.expandIcon} />
      </button>
      {open && nested !== null ? (
        <div className={styles.expandChildren}>
          <SchemaCard schema={nested} depth={depth + 1} nested />
        </div>
      ) : null}
    </section>
  );
}

function PropertyRow({
  name,
  schema,
  required,
  depth,
}: {
  name: string;
  schema: Schema;
  required: boolean;
  depth: number;
}) {
  const variants = unionVariants(schema);
  const [variantIndex, setVariantIndex] = useState(0);
  const selectId = useId();
  const shown = variants !== null ? (variants[variantIndex] ?? schema) : schema;
  const nested = nestedSchema(shown);
  const text = schemaDescription(schema);
  // Live draws a union of plain types ("priority: string | number") as a small select beside the name, and a union
  // with an array or object among its variants ("text") as a full-width select under the description, followed by
  // the chosen variant's expander.
  const blockUnion = variants !== null && variants.some((v) => nestedSchema(v) !== null);
  // An object without declared properties allows any: live says so in a box shaped like a closed expander.
  const openObject =
    nested === null && schemaType(shown) === 'object' && mergeAllOf(shown).additionalProperties !== false;
  const children =
    nested !== null ? (
      depth === 0 ? (
        <SchemaCard schema={nested} depth={depth + 1} nested />
      ) : (
        <Expander name={name} schema={shown} depth={depth} />
      )
    ) : openObject ? (
      <div className={`${styles.expand} ${styles.additionalFields}`}>
        <div className={styles.expandButton}>Has additional fields</div>
      </div>
    ) : null;
  return (
    <div
      className={[
        styles.propRow,
        children === null && !blockUnion && schemaType(shown) !== 'array' ? styles.propRowLeaf : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={[
          styles.propHeader,
          // Live keeps a lone header as tall as a type select, except for arrays ("toSections array").
          text === '' && children === null && !blockUnion && schemaType(shown) !== 'array'
            ? styles.propHeaderAlone
            : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className={styles.propName}>{name}</span>
        {blockUnion ? null : variants !== null ? (
          <UnionSelect
            id={selectId}
            label={`${name} type`}
            variants={variants}
            value={variantIndex}
            onChange={setVariantIndex}
          />
        ) : (
          <span className={styles.propType}>{typeLabel(schema)}</span>
        )}
        {required ? <span className={styles.propRequired}>required</span> : null}
      </div>
      {text !== '' ? (
        <div className={styles.propDescription}>
          <Markdown source={text} />
        </div>
      ) : null}
      {blockUnion && variants !== null ? (
        <div className={`${styles.propChildren} ${styles.unionBody}`}>
          <UnionSelect
            id={selectId}
            label={`${name} type`}
            variants={variants}
            value={variantIndex}
            onChange={setVariantIndex}
          />
          {children}
        </div>
      ) : children !== null ? (
        <div
          className={[styles.propChildren, openObject || (nested !== null && depth > 0) ? styles.propChildrenBox : '']
            .filter(Boolean)
            .join(' ')}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}

function ResponsePanel({
  response,
  open,
  onToggle,
  position,
}: {
  response: OperationResponse;
  open: boolean;
  onToggle: () => void;
  position: 'only' | 'first' | 'middle' | 'last';
}) {
  const id = useId();
  const media = Object.values(response.content)[0];
  const schema = media === undefined ? null : mergeAllOf(media.schema);
  const hasBody = schema !== null && Object.keys(schema).length > 0;
  return (
    <div className={[styles.panel, styles[position], open ? styles.panelOpen : ''].filter(Boolean).join(' ')}>
      <h3 className={styles.toggleHeading}>
        <button
          type="button"
          className={styles.toggle}
          data-visual="respToggle"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
        >
          <span className={styles.toggleContent}>
            <span className={styles.statusLabel}>
              <span className={styles.statusCode}>
                <StatusDot status={response.status} visual="statusChit" />
              </span>
              {response.status}
            </span>
            {response.description !== '' ? (
              <Markdown source={response.description} className={styles.responseDescription} />
            ) : null}
          </span>
          <span className={styles.chevron}>
            <Icon name="chevron-right" className={styles.chevronIcon} />
          </span>
        </button>
      </h3>
      {open ? (
        <div
          id={id}
          role="region"
          aria-label={`${response.status} ${response.description}`.trim()}
          className={styles.panelContent}
        >
          {hasBody && schema !== null ? (
            <div className={styles.body}>
              <div className={styles.bodyHeader}>Response body</div>
              <SchemaCard schema={schema} depth={0} nested={false} />
            </div>
          ) : (
            <div className={styles.body}>
              <div className={styles.bodyHeader}>Response body</div>
              <div className={styles.card}>
                <div className={styles.typeRow}>No response body</div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function Responses() {
  const { op } = useEndpoint();
  const responses = sortedResponses(op);
  const [open, setOpen] = useState<Set<string>>(() => new Set(responses[0] === undefined ? [] : [responses[0].status]));
  if (responses.length === 0) return null;
  const toggle = (status: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(status)) next.delete(status);
      else next.add(status);
      return next;
    });
  return (
    <div className={styles.responses}>
      <SectionHeader id="response-schemas" title={responses.length === 1 ? 'Response' : 'Responses'} />
      <section className={styles.accordion} data-visual="respPicker" data-visual-region="responseAccordion">
        {responses.map((response, i) => {
          const position =
            responses.length === 1 ? 'only' : i === 0 ? 'first' : i === responses.length - 1 ? 'last' : 'middle';
          return (
            <ResponsePanel
              key={response.status}
              response={response}
              open={open.has(response.status)}
              onToggle={() => toggle(response.status)}
              position={position}
            />
          );
        })}
      </section>
    </div>
  );
}
