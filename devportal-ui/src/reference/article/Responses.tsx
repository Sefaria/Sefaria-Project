// "Response" / "Responses": one accordion per status (an `h3 > button`, fixing live's `h1`), the first expanded on
// load as live does after hydration, each with its "RESPONSE BODY" schema.
import { useId, useState, type ReactNode } from 'react';
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

/** An object with declared properties: live lists them straight in a box, with no "object" type row. */
function isPropertyObject(schema: Schema): boolean {
  const s = mergeAllOf(schema);
  return schemaType(s) === 'object' && objectProperties(s).length > 0;
}

/** An array of objects with declared properties: live always shows its item card open. */
function isObjectArray(schema: Schema): boolean {
  const s = mergeAllOf(schema);
  return schemaType(s) === 'array' && isPropertyObject(asSchema(s.items));
}

/**
 * The items of an array of documented scalars (a `$ref` to `ref`: a string with a description). Live labels such an
 * array "array of objects" and appends the items' description to the property's (`refs`, `includedRefs`).
 */
function describedScalarItems(schema: Schema): Schema | null {
  const s = mergeAllOf(schema);
  if (schemaType(s) !== 'array') return null;
  const items = mergeAllOf(asSchema(s.items));
  const type = schemaType(items);
  if (type === null || type === 'object' || type === 'array' || unionVariants(items) !== null) return null;
  return schemaDescription(items) !== '' ? items : null;
}

/** Live's type label of a property; a nullable schema ends in "| null" ("string | null"). */
function propertyTypeLabel(schema: Schema): string {
  const s = mergeAllOf(schema);
  const label = describedScalarItems(s) !== null ? 'array of objects' : typeLabel(s);
  return s.nullable === true ? `${label} | null` : label;
}

const STRUCTURED = ['array', 'object'];

function isStructured(schema: Schema): boolean {
  return STRUCTURED.includes(schemaType(schema) ?? '');
}

/** An `anyOf` with an array or object among its variants: live lists the variants as closed options. */
function anyOfOptions(schema: Schema): Schema[] | null {
  const s = mergeAllOf(schema);
  if (!Array.isArray(s.anyOf)) return null;
  const variants = unionVariants(s) ?? [];
  return variants.some(isStructured) ? variants : null;
}

/** "string | array": the variants' types, once each. */
function anyOfTypeLabel(variants: Schema[]): string {
  return [...new Set(variants.map((v) => schemaType(v) ?? 'string'))].join(' | ');
}

/** Live's option labels: the variant's title, else its type, arrays numbered ("string", "Array 1", "Array 2"). */
function anyOfOptionLabels(variants: Schema[]): string[] {
  let arrays = 0;
  return variants.map((v) => {
    const title = mergeAllOf(v).title;
    if (typeof title === 'string' && title !== '') return title;
    const type = schemaType(v) ?? 'string';
    if (type === 'array') {
      arrays += 1;
      return `Array ${arrays}`;
    }
    return type;
  });
}

/** Live alternates nested boxes between white (even depth) and grey (odd depth). */
function toneClass(depth: number): string {
  return (depth % 2 === 0 ? styles.toneEven : styles.toneOdd) ?? '';
}

/** A card listing a schema: its type, its description, then its properties (live's `rm-ParamContainer`). */
function SchemaCard({
  schema,
  depth,
  nested,
  tone,
}: {
  schema: Schema;
  depth: number;
  nested: boolean;
  tone?: string;
}) {
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
    <div className={[nested ? styles.nestedCard : styles.card, tone ?? ''].filter(Boolean).join(' ')}>
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
          <PropertyRows schema={s} depth={depth} />
        </div>
      ) : null}
    </div>
  );
}

function PropertyRows({ schema, depth }: { schema: Schema; depth: number }) {
  return (
    <>
      {objectProperties(schema).map((p) => (
        <PropertyRow key={p.name} name={p.name} schema={p.schema} required={p.required} depth={depth} />
      ))}
    </>
  );
}

/** A top-level object's properties in an open box of their own (live's expanded `Param-expand` fieldset). */
function ObjectBox({ schema, depth }: { schema: Schema; depth: number }) {
  return (
    <div className={`${styles.objectBox} ${toneClass(depth)}`}>
      <div className={styles.objectProps}>
        <PropertyRows schema={schema} depth={depth + 1} />
      </div>
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

/** The open content of an expander: an object's properties, an array's item card, or a scalar array's item type. */
function ExpandedContent({ schema, depth }: { schema: Schema; depth: number }) {
  const s = mergeAllOf(schema);
  if (isPropertyObject(s)) {
    return (
      <div className={styles.objectProps}>
        <PropertyRows schema={s} depth={depth + 1} />
      </div>
    );
  }
  const nested = nestedSchema(s);
  const items = schemaType(s) === 'array' ? mergeAllOf(asSchema(s.items)) : s;
  return (
    <div className={styles.expandChildren}>
      {nested !== null ? (
        <SchemaCard schema={nested} depth={depth + 1} nested />
      ) : (
        <div className={`${styles.nestedCard} ${toneClass(depth + 1)}`}>
          <div className={styles.typeRow}>{typeLabel(items)}</div>
        </div>
      )}
    </div>
  );
}

function Expander({ name, schema, depth }: { name: string; schema: Schema; depth: number }) {
  const [open, setOpen] = useState(false);
  const s = mergeAllOf(schema);
  // Live names the box after the schema's title when it has one ("Root Type for RawIndexNodesJSON object").
  const title = typeof s.title === 'string' && s.title !== '' ? s.title : name;
  const label = `${title} ${schemaType(s) === 'object' ? 'object' : typeLabel(s)}`;
  return (
    <section
      className={[styles.expand, toneClass(depth), open ? styles.expandOpen : ''].filter(Boolean).join(' ')}
      data-visual-region={open ? 'schemaArrayExpander' : undefined}
    >
      <button type="button" className={styles.expandButton} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span className={styles.expandLabel}>{label}</span>
        <Icon name={open ? 'x' : 'plus'} className={styles.expandIcon} />
      </button>
      {open ? <ExpandedContent schema={s} depth={depth} /> : null}
    </section>
  );
}

/** An `anyOf` with structured variants: each variant a closed option that opens to its type and contents. */
function AnyOfList({ variants, depth }: { variants: Schema[]; depth: number }) {
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set());
  const labels = anyOfOptionLabels(variants);
  const toggle = (i: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  return (
    <div className={styles.anyOfList}>
      {variants.map((variant, i) => {
        const isOpen = open.has(i);
        const nested = nestedSchema(variant);
        return (
          <section
            key={i}
            className={[styles.anyOfOption, toneClass(depth), isOpen ? styles.anyOfOptionOpen : '']
              .filter(Boolean)
              .join(' ')}
          >
            <button type="button" className={styles.anyOfButton} aria-expanded={isOpen} onClick={() => toggle(i)}>
              <span className={styles.anyOfLabel}>{labels[i]}</span>
              <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} className={styles.expandIcon} />
            </button>
            {isOpen ? (
              <div className={styles.anyOfDetails}>
                <div className={styles.typeRow}>{typeLabel(variant)}</div>
                {isPropertyObject(variant) ? (
                  <div className={styles.propsBlock}>
                    <PropertyRows schema={mergeAllOf(variant)} depth={depth + 1} />
                  </div>
                ) : nested !== null ? (
                  <div className={styles.anyOfNested}>
                    <SchemaCard schema={nested} depth={depth + 1} nested tone={toneClass(depth + 1)} />
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
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
  const options = anyOfOptions(schema);
  const variants = options === null ? unionVariants(schema) : null;
  const [variantIndex, setVariantIndex] = useState(0);
  const selectId = useId();
  const shown = variants !== null ? (variants[variantIndex] ?? schema) : schema;
  const nested = nestedSchema(shown);
  const scalarItems = describedScalarItems(schema);
  const text = [schemaDescription(schema), scalarItems === null ? '' : schemaDescription(scalarItems)]
    .filter((t) => t !== '')
    .join('\n\n');
  // Live draws a union of plain types ("priority: string | number") as a small select beside the name, and a union
  // with an array or object among its variants ("text", "he") as a full-width select under the description, followed
  // by the chosen variant's expander.
  const blockUnion = variants !== null && variants.some(isStructured);
  // An object without declared properties allows any: live says so in a box shaped like a closed expander.
  const openObject =
    nested === null && schemaType(shown) === 'object' && mergeAllOf(shown).additionalProperties !== false;
  let children: ReactNode = null;
  let boxed = false;
  if (options !== null) {
    children = <AnyOfList variants={options} depth={depth} />;
    boxed = true;
  } else if (blockUnion) {
    children = isStructured(shown) ? <Expander name={name} schema={shown} depth={depth} /> : null;
  } else if (isPropertyObject(shown)) {
    // Live opens the objects of the top level and closes the deeper ones.
    children =
      depth === 0 ? <ObjectBox schema={shown} depth={depth} /> : <Expander name={name} schema={shown} depth={depth} />;
    boxed = true;
  } else if (nested !== null && (depth === 0 || isObjectArray(shown))) {
    children = <SchemaCard schema={nested} depth={depth + 1} nested tone={toneClass(depth)} />;
  } else if (nested !== null) {
    children = <Expander name={name} schema={shown} depth={depth} />;
    boxed = true;
  } else if (openObject) {
    children = (
      <div className={`${styles.expand} ${styles.additionalFields}`}>
        <div className={styles.expandButton}>Has additional fields</div>
      </div>
    );
    boxed = true;
  }
  const isArray = schemaType(shown) === 'array';
  return (
    <div
      className={[styles.propRow, children === null && !blockUnion && !isArray ? styles.propRowLeaf : '']
        .filter(Boolean)
        .join(' ')}
    >
      <div
        className={[
          styles.propHeader,
          // Live keeps a lone header as tall as a type select, except for arrays ("toSections array").
          text === '' && children === null && !blockUnion && !isArray ? styles.propHeaderAlone : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span className={styles.propName}>{name}</span>
        {blockUnion ? null : options !== null ? (
          <span className={styles.propType}>{anyOfTypeLabel(options)}</span>
        ) : variants !== null ? (
          <UnionSelect
            id={selectId}
            label={`${name} type`}
            variants={variants}
            value={variantIndex}
            onChange={setVariantIndex}
          />
        ) : (
          <span className={styles.propType}>{propertyTypeLabel(schema)}</span>
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
        <div className={[styles.propChildren, boxed ? styles.propChildrenBox : ''].filter(Boolean).join(' ')}>
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
