import type { vi } from 'vitest';

type ChromeNode = chrome.bookmarks.BookmarkTreeNode;

/** 並び順を持つ代役に最初に入れるノード。children があればフォルダ。 */
export interface SeedNode {
  id: string;
  title: string;
  url?: string;
  children?: SeedNode[];
}

interface StoredNode {
  id: string;
  title: string;
  url?: string;
  parentId?: string;
  /** フォルダのときだけ持つ、子の id の並び */
  children?: string[];
}

export interface FakeBookmarks {
  /** フォルダ直下の並びをタイトルで返す（フォルダは `[名前]`）。 */
  titles(parentId: string): string[];
  /** フォルダ直下の並びを id で返す。 */
  ids(parentId: string): string[];
  /** id のノードが今もあるか。 */
  has(id: string): boolean;
  /** 画面の外（別のウィンドウなど）で削除されたことにする。 */
  removeBehindTheScenes(id: string): void;
}

/**
 * 並び順を持つ `chrome.bookmarks` の代役を、test/setup.ts のモックに載せる。
 *
 * 呼び出しの列ではなく「操作の後にどう並んでいるか」を確かめるためのもの。
 * 実際の Chrome と同じく、次のように振る舞う。
 *
 * - `move` の `index` は、同じフォルダの中では「動かす前の並びでの位置」。
 *   今の位置より後ろを指すと、最終的な位置は `index - 1` になる
 * - `move` / `create` の `index` が子の数を超えると `Index out of bounds.` で失敗する
 * - `index` を省くと末尾に入る
 * - `get` / `move` / `remove` は、id が無ければ `Can't find bookmark for id.` で失敗する
 * - 返すノードの `index` は、その時点の並びでの位置
 */
export function installFakeBookmarks(roots: SeedNode[]): FakeBookmarks {
  const nodes = new Map<string, StoredNode>();
  let nextId = 1000;

  const ROOT = '0';
  nodes.set(ROOT, { id: ROOT, title: '', children: [] });

  const seed = (node: SeedNode, parentId: string): void => {
    nodes.set(node.id, {
      id: node.id,
      title: node.title,
      url: node.url,
      parentId,
      children: node.children ? [] : undefined,
    });
    (nodes.get(parentId) as StoredNode).children?.push(node.id);
    for (const child of node.children ?? []) seed(child, node.id);
  };
  for (const root of roots) seed(root, ROOT);

  const must = (id: string): StoredNode => {
    const node = nodes.get(id);
    if (!node) throw new Error("Can't find bookmark for id.");
    return node;
  };
  const folder = (id: string): StoredNode & { children: string[] } => {
    const node = must(id);
    if (!node.children) throw new Error("Can't find parent bookmark for id.");
    return node as StoredNode & { children: string[] };
  };

  const view = (id: string, deep: boolean): ChromeNode => {
    const node = must(id);
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    const out: ChromeNode = {
      id: node.id,
      title: node.title,
      parentId: node.parentId,
      index: parent?.children?.indexOf(id),
    } as ChromeNode;
    if (node.url !== undefined) out.url = node.url;
    if (node.children && deep) {
      out.children = node.children.map((childId) => view(childId, true));
    }
    return out;
  };

  const detach = (id: string): void => {
    const node = must(id);
    const siblings = node.parentId
      ? nodes.get(node.parentId)?.children
      : undefined;
    siblings?.splice(siblings.indexOf(id), 1);
  };

  const removeRecursively = (id: string): void => {
    for (const childId of [...(must(id).children ?? [])]) {
      removeRecursively(childId);
    }
    detach(id);
    nodes.delete(id);
  };

  const api = chrome.bookmarks as unknown as Record<
    string,
    ReturnType<typeof vi.fn>
  >;

  api.get.mockImplementation(async (idOrIds: string | string[]) =>
    (Array.isArray(idOrIds) ? idOrIds : [idOrIds]).map((id) => view(id, false))
  );
  api.getChildren.mockImplementation(async (id: string) =>
    folder(id).children.map((childId) => view(childId, false))
  );
  api.getSubTree.mockImplementation(async (id: string) => [view(id, true)]);
  api.getTree.mockImplementation(async () => [view(ROOT, true)]);
  api.search.mockImplementation(
    async (query: string | { url?: string; title?: string }) =>
      [...nodes.values()]
        .filter((node) => {
          if (node.url === undefined) return false;
          if (typeof query === 'string') {
            return node.url.includes(query) || node.title.includes(query);
          }
          if (query.url !== undefined && node.url !== query.url) return false;
          if (query.title !== undefined && node.title !== query.title) {
            return false;
          }
          return true;
        })
        .map((node) => view(node.id, false))
  );
  api.move.mockImplementation(
    async (id: string, destination: { parentId?: string; index?: number }) => {
      const node = must(id);
      const destinationId = destination.parentId ?? (node.parentId as string);
      const siblings = folder(destinationId).children;
      const sameParent = destinationId === node.parentId;
      const oldIndex = sameParent ? siblings.indexOf(id) : -1;
      const { index } = destination;
      if (index !== undefined && (index < 0 || index > siblings.length)) {
        throw new Error('Index out of bounds.');
      }
      detach(id);
      node.parentId = destinationId;
      if (index === undefined) {
        siblings.push(id);
      } else {
        siblings.splice(
          sameParent && oldIndex < index ? index - 1 : index,
          0,
          id
        );
      }
      return view(id, false);
    }
  );
  api.create.mockImplementation(
    async (details: {
      parentId?: string;
      index?: number;
      title?: string;
      url?: string;
    }) => {
      const parentId = details.parentId ?? ROOT;
      const siblings = folder(parentId).children;
      const { index } = details;
      if (index !== undefined && (index < 0 || index > siblings.length)) {
        throw new Error('Index out of bounds.');
      }
      const id = String(nextId++);
      nodes.set(id, {
        id,
        title: details.title ?? '',
        url: details.url,
        parentId,
        children: details.url === undefined ? [] : undefined,
      });
      siblings.splice(index ?? siblings.length, 0, id);
      return view(id, false);
    }
  );
  api.update.mockImplementation(
    async (id: string, changes: { title?: string; url?: string }) => {
      const node = must(id);
      if (changes.title !== undefined) node.title = changes.title;
      if (changes.url !== undefined) node.url = changes.url;
      return view(id, false);
    }
  );
  api.remove.mockImplementation(async (id: string) => {
    if ((must(id).children?.length ?? 0) > 0) {
      throw new Error(
        "Can't remove non-empty folder (use recursive to force)."
      );
    }
    removeRecursively(id);
  });
  api.removeTree.mockImplementation(async (id: string) => {
    must(id);
    removeRecursively(id);
  });

  return {
    titles: (parentId) =>
      folder(parentId).children.map((id) => {
        const node = must(id);
        return node.children ? `[${node.title}]` : node.title;
      }),
    ids: (parentId) => [...folder(parentId).children],
    has: (id) => nodes.has(id),
    removeBehindTheScenes: (id) => removeRecursively(id),
  };
}
