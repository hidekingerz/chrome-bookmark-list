/**
 * ブックマークの変更を newtab.ts に通知するイベント。
 * newtab.ts はこれを受けてブックマーク一覧を再読み込みする。
 */

export type BookmarksChangedAction =
  | 'edit'
  | 'delete'
  | 'move'
  | 'bulk-delete'
  | 'bulk-move'
  | 'folder-create'
  | 'folder-rename'
  | 'folder-delete'
  | 'folder-move'
  | `undo-${string}`;

export function dispatchBookmarksChanged(action: BookmarksChangedAction): void {
  document.dispatchEvent(
    new CustomEvent('bookmarks-changed', { detail: { action } })
  );
}
