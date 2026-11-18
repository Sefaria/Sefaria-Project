// The page tree of a section (PLAN §2.11): nesting, drag to reorder (mouse and keyboard, @dnd-kit), "+ New" and
// "+ add child" on each row. Moves are validated by the server; the tree here only proposes them.
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';
import type { EditorTree, EditorTreeNode } from '../../contracts';
import { flatten, projectMove, type FlatNode, type Projection } from './flatten';
import styles from './PageTree.module.css';

const INDENT = 20;

export interface PageTreeProps {
  tree: EditorTree;
  selectedId: number | null;
  onSelect(id: number): void;
  onCreate(parentId: number | null, kind: 'page' | 'category' | 'link'): void;
  onMove(id: number, projection: Projection): void;
  onDelete(id: number): void;
}

const CAN_HAVE_CHILDREN = new Set(['category', 'page']);
const DELETABLE = new Set(['category', 'page', 'link']);

function Row({
  item,
  selected,
  onSelect,
  onCreate,
  onDelete,
}: {
  item: FlatNode;
  selected: boolean;
  onSelect(): void;
  onCreate(): void;
  onDelete(): void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const node = item.node;
  return (
    <li
      ref={(el) => {
        setNodeRef(el);
        // dnd-kit positions the dragged row with a transform (the editor's CSP allows style attributes).
        if (el) {
          el.style.transform = CSS.Transform.toString(transform) ?? '';
          el.style.transition = transition ?? '';
          el.style.paddingLeft = `${item.depth * INDENT}px`;
        }
      }}
      className={`${styles.row} ${node.kind === 'category' ? styles.category : ''} ${selected ? styles.selected : ''} ${isDragging ? styles.dragging : ''}`}
      data-kind={node.kind}
    >
      <button type="button" className={styles.handle} aria-label={`Move ${node.title}`} {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <button type="button" className={styles.title} aria-current={selected ? 'page' : undefined} onClick={onSelect}>
        {node.method && (
          <span
            className={`${styles.method} ${styles[`method${node.method.charAt(0).toUpperCase()}${node.method.slice(1)}`] ?? ''}`}
          >
            {node.method.toUpperCase()}
          </span>
        )}
        <span>{node.title}</span>
        {node.hidden && <span className={styles.badge}>Hidden</span>}
        {node.hasDraft && <span className={styles.badge}>Draft</span>}
        {!node.isPublished && node.kind !== 'category' && <span className={styles.badge}>Unpublished</span>}
        {node.deprecated && <span className={styles.badge}>Deprecated</span>}
      </button>
      {CAN_HAVE_CHILDREN.has(node.kind) && (
        <button
          type="button"
          className={styles.action}
          aria-label={`Add a page under ${node.title}`}
          title="Add child"
          onClick={onCreate}
        >
          + add child
        </button>
      )}
      {DELETABLE.has(node.kind) && node.children.length === 0 && (
        <button type="button" className={styles.action} aria-label={`Delete ${node.title}`} onClick={onDelete}>
          Delete
        </button>
      )}
    </li>
  );
}

export function PageTree({ tree, selectedId, onSelect, onCreate, onMove, onDelete }: PageTreeProps) {
  const flat = useMemo(() => flatten(tree.nodes), [tree]);
  const [offset, setOffset] = useState(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const isCustom = tree.section === 'page';
  const titleOf = (id: string | number) => flat.find((f) => f.id === Number(id))?.node.title ?? 'the page';

  function onDragEnd(event: DragEndEvent) {
    setOffset(0);
    if (!event.over) return;
    const projection = projectMove(flat, Number(event.active.id), Number(event.over.id), event.delta.x, INDENT);
    if (projection) onMove(Number(event.active.id), projection);
  }

  return (
    <nav className={styles.tree} aria-label="Pages">
      <div className={styles.header}>
        <button type="button" className={styles.new} onClick={() => onCreate(null, isCustom ? 'page' : 'category')}>
          + New {isCustom ? 'page' : 'category'}
        </button>
        {!isCustom && (
          <button type="button" className={styles.new} onClick={() => onCreate(null, 'link')}>
            + New link
          </button>
        )}
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragMove={(event: DragMoveEvent) => setOffset(event.delta.x)}
        onDragEnd={onDragEnd}
        onDragCancel={() => setOffset(0)}
        accessibility={{
          announcements: {
            onDragStart: ({ active }) => `Picked up ${titleOf(active.id)}.`,
            onDragOver: ({ active, over }) =>
              over ? `${titleOf(active.id)} is over ${titleOf(over.id)}.` : `${titleOf(active.id)} is not over a page.`,
            onDragEnd: ({ active, over }) =>
              over ? `${titleOf(active.id)} was dropped at ${titleOf(over.id)}.` : `${titleOf(active.id)} was dropped.`,
            onDragCancel: ({ active }) => `Moving ${titleOf(active.id)} was cancelled.`,
          },
          screenReaderInstructions: {
            draggable:
              'To move a page, press space or enter. Use the arrow keys to move it, then space or enter to drop it, or escape to cancel.',
          },
        }}
      >
        <SortableContext items={flat.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          <ul className={styles.list} data-offset={offset}>
            {flat.map((item) => (
              <Row
                key={item.id}
                item={item}
                selected={item.id === selectedId}
                onSelect={() => onSelect(item.id)}
                onCreate={() => onCreate(item.id, 'page')}
                onDelete={() => onDelete(item.id)}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      {flat.length === 0 && <p className={styles.empty}>No pages yet.</p>}
    </nav>
  );
}

export type { EditorTreeNode };
