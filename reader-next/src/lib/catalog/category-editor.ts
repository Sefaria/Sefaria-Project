/**
 * Moderators editing the library's categories, as the old CategoryEditor / ReorderEditor (static/js/CategoryEditor.jsx):
 * `POST /api/category/<path>` with the category (JSON body; `?update=1` for an existing one, `&reorder=1` when its
 * children were reordered), `DELETE /api/category/<path>` for an empty one, and `POST /api/category?reorder=1` for the
 * library's top level. category_api checks staff on POST.
 *
 * @feature LIB-002 Library home header and edit buttons
 */
import { deleteRequest, postJson } from "~/lib/auth/http";
import type { TocNode } from "./toc";

export interface CategoryDraft {
  enTitle: string;
  heTitle: string;
  enDescription: string;
  heDescription: string;
  enShortDescription: string;
  heShortDescription: string;
  isPrimary: boolean;
  /** The parent's path ([] for a top-level category). */
  path: string[];
  /** The children's titles, in order (an existing category). */
  children: string[];
}

export interface CategoryOriginal {
  /** "" for a new category. */
  enTitle: string;
  path: string[];
  children: string[];
}

/** displayOptions.cats: a child's name (a book's title, a category's name). */
export const childTitle = (n: TocNode) => ("category" in n ? n.category : n.title);

/** The old validate. The message to alert, or null. */
export function validateCategory(d: CategoryDraft, changed: boolean): string | null {
  if (!changed) return "Please change one of the fields before saving.";
  if (!d.enTitle) return "Title must be provided.";
  return null;
}

/** The old save(): the URL and body. */
export function categoryRequest(orig: CategoryOriginal, d: CategoryDraft): { url: string; body: Record<string, unknown> } {
  const isNew = orig.enTitle === "";
  const fullPath = [...d.path, d.enTitle];
  const body: Record<string, unknown> = {
    isPrimary: d.isPrimary,
    enDesc: d.enDescription,
    heDesc: d.heDescription,
    enShortDesc: d.enShortDescription,
    heShortDesc: d.heShortDescription,
    heSharedTitle: d.heTitle,
    sharedTitle: d.enTitle,
    path: fullPath,
  };
  const params: string[] = [];
  if (!isNew) {
    params.push("update=1");
    body.origPath = [...orig.path, orig.enTitle];
  }
  // only an existing category's children are reordered
  if (!isNew && orig.children.some((c, i) => c !== d.children[i])) {
    body.subcategoriesAndBooks = d.children;
    params.push("reorder=1");
  }
  return { url: `/api/category/${fullPath.join("/")}${params.length ? `?${params.join("&")}` : ""}`, body };
}

async function send(p: Promise<{ ok: boolean; status: number; data: Record<string, unknown> }>): Promise<void> {
  const res = await p;
  const error = (res.data as { error?: string }).error;
  if (error || !res.ok) throw new Error(error ?? `HTTP ${res.status}`);
}

export const saveCategory = (orig: CategoryOriginal, d: CategoryDraft) => {
  const { url, body } = categoryRequest(orig, d);
  return send(postJson(url, body));
};

export const deleteCategory = (fullPath: readonly string[]) => send(deleteRequest(`/api/category/${fullPath.join("/")}`));

/** The library's top level in a new order (ReorderEditor type "cats"). */
export const saveTopLevelOrder = (titles: readonly string[]) => send(postJson("/api/category?reorder=1", { subcategoriesAndBooks: titles, path: [] }));

/** The old Reorder's arrows: move item `i` one place up (-1) or down (+1); the same list when it can't move. */
export function move<T>(items: readonly T[], i: number, dir: -1 | 1): T[] {
  const j = i + dir;
  if (j < 0 || j >= items.length) return [...items];
  const next = [...items];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}
