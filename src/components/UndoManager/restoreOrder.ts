import { moveBackForUndo } from './moveBack.js';

/** 親フォルダ ID → 操作前の子の並び (ノード ID) */
export type ChildOrderSnapshot = Map<string, string[]>;

/**
 * 複数のノードをまとめて動かす前に、関係する親フォルダの子の並びを控える。
 *
 * 1 件ずつ動かしながら index を読むと、先に動かした分だけ後ろの項目の index が
 * ずれ、Undo で元の並びに戻せない。操作の前に並びを丸ごと控えておく。
 */
export async function snapshotChildOrder(
  parentIds: Iterable<string | undefined>
): Promise<ChildOrderSnapshot> {
  const snapshot: ChildOrderSnapshot = new Map();
  for (const parentId of parentIds) {
    if (parentId === undefined || snapshot.has(parentId)) continue;
    const children = await chrome.bookmarks.getChildren(parentId);
    snapshot.set(
      parentId,
      children.map((child) => child.id)
    );
  }
  return snapshot;
}

/**
 * 控えておいた並びへ戻す。前から順に、控えた位置へ 1 件ずつ置き直す。
 * 既に無くなったノードは飛ばす。
 */
export async function restoreChildOrder(
  snapshot: ChildOrderSnapshot
): Promise<void> {
  for (const [parentId, ids] of snapshot) {
    let position = 0;
    for (const id of ids) {
      let node: chrome.bookmarks.BookmarkTreeNode | undefined;
      try {
        [node] = await chrome.bookmarks.get(id);
      } catch {
        node = undefined;
      }
      if (!node) continue;
      if (node.parentId !== parentId || node.index !== position) {
        await moveBackForUndo(id, parentId, position);
      }
      position++;
    }
  }
}
