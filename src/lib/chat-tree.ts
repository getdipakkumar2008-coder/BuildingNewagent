// Pure helpers for the message tree. Edit/regenerate create siblings under the same parent;
// the UI shows one root-to-leaf path at a time.

export type TreeMsg = {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  createdAt: string | number;
};

const ts = (m: TreeMsg) => new Date(m.createdAt).getTime();

/** Messages that share `msg`'s parent (including itself), oldest first. */
export function siblingsOf<T extends TreeMsg>(all: T[], msg: T): T[] {
  return all
    .filter((m) => m.parentId === msg.parentId && m.role === msg.role)
    .sort((a, b) => ts(a) - ts(b) || a.id.localeCompare(b.id));
}

/** Newest descendant leaf under `id` (the message itself if it has no children). */
export function newestLeafUnder<T extends TreeMsg>(all: T[], id: string): string {
  const children = new Map<string | null, T[]>();
  for (const m of all) {
    const list = children.get(m.parentId) ?? [];
    list.push(m);
    children.set(m.parentId, list);
  }
  let cursor = id;
  for (let guard = 0; guard < all.length + 1; guard++) {
    const kids = children.get(cursor);
    if (!kids || kids.length === 0) return cursor;
    kids.sort((a, b) => ts(a) - ts(b) || a.id.localeCompare(b.id));
    cursor = kids[kids.length - 1]!.id;
  }
  return cursor;
}

/**
 * The visible path: root → leaf. If `leafId` is missing/unknown, the most recently created
 * message is the leaf. Cycle-safe.
 */
export function activePath<T extends TreeMsg>(all: T[], leafId: string | null): T[] {
  if (all.length === 0) return [];
  const byId = new Map(all.map((m) => [m.id, m]));
  let leaf = leafId ? byId.get(leafId) : undefined;
  if (!leaf) {
    leaf = [...all].sort((a, b) => ts(a) - ts(b) || a.id.localeCompare(b.id)).at(-1)!;
  }
  const path: T[] = [];
  const seen = new Set<string>();
  let cursor: T | undefined = leaf;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    path.push(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return path.reverse();
}
