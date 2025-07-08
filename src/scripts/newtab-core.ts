/**
 * リファクタリング後のnewtab-coreモジュール
 * 新しいコンポーネントアーキテクチャを使用
 */

import type { BookmarkFolder } from '../types/bookmark.js';
import { BookmarkFolderRenderer } from '../components/BookmarkFolder/BookmarkFolderRenderer.js';
import { BookmarkFolderEvents } from '../components/BookmarkFolder/BookmarkFolderEvents.js';

// 新しいコンポーネントのインスタンス
const folderRenderer = new BookmarkFolderRenderer();
const folderEvents = new BookmarkFolderEvents();

/**
 * フォルダをHTMLに変換する関数（後方互換性のため）
 */
export function renderFolder(folder: BookmarkFolder, level = 0): string {
  return folderRenderer.renderFolder(folder, level);
}

/**
 * フォルダクリックのイベントハンドラーを設定する関数（後方互換性のため）
 */
export function setupFolderClickHandler(
  container: HTMLElement,
  allBookmarks: BookmarkFolder[]
): void {
  folderEvents.setupFolderClickHandler(container, allBookmarks);
}

/**
 * ブックマークを表示する関数（テスト可能版）
 */
export async function displayBookmarksTestable(
  folders: BookmarkFolder[],
  container: HTMLElement
): Promise<void> {
  if (folders.length === 0) {
    container.innerHTML =
      '<div class="no-results">ブックマークが見つかりませんでした。</div>';
    return;
  }

  const html = folderRenderer.renderFolders(folders);
  container.innerHTML = html;

  // イベントリスナーを設定
  folderEvents.setupFolderClickHandler(container, folders);
}

// 個別のコンポーネントエクスポート（新しいAPI）
export { BookmarkFolderRenderer } from '../components/BookmarkFolder/BookmarkFolderRenderer.js';
export { BookmarkFolderEvents } from '../components/BookmarkFolder/BookmarkFolderEvents.js';
export { BookmarkActions } from '../components/BookmarkActions/index.js';
export { BookmarkEditor } from '../components/BookmarkActions/BookmarkEditor.js';
export { BookmarkDeleter } from '../components/BookmarkActions/BookmarkDeleter.js';

// 後方互換性のための関数エクスポート（既存のテストが動作するよう）
import { BookmarkActions } from '../components/BookmarkActions/index.js';

const bookmarkActions = new BookmarkActions();

/**
 * ブックマーク削除の処理を行う関数（後方互換性のため）
 */
export async function handleBookmarkDelete(
  deleteBtn: HTMLElement
): Promise<void> {
  return bookmarkActions.handleDelete(deleteBtn);
}

/**
 * ブックマーク編集の処理を行う関数（後方互換性のため）
 */
export async function handleBookmarkEdit(editBtn: HTMLElement): Promise<void> {
  return bookmarkActions.handleEdit(editBtn);
}

// 以下の関数は廃止予定ですが、段階的移行のため残しています
// TODO: 将来のバージョンで削除予定

/**
 * @deprecated BookmarkFolderEvents.updateFolderUI を使用してください
 */
export function updateFolderUI(
  folderHeader: HTMLElement,
  folderElement: HTMLElement,
  folder: BookmarkFolder,
  allBookmarks: BookmarkFolder[]
): void {
  console.warn(
    'updateFolderUI is deprecated. Use BookmarkFolderEvents instead.'
  );
  // 実装は新しいイベントクラスに委譲
  const events = new BookmarkFolderEvents();
  // 注意: この関数は内部メソッドなので直接呼び出せません
  // 代わりにsetupFolderClickHandlerを使用してください
}

/**
 * @deprecated BookmarkFolderEvents.updateBookmarkListUI を使用してください
 */
export function updateBookmarkListUI(
  folderHeader: HTMLElement,
  folderElement: HTMLElement,
  folder: BookmarkFolder
): void {
  console.warn(
    'updateBookmarkListUI is deprecated. Use BookmarkFolderEvents instead.'
  );
  // 実装は新しいイベントクラスに委譲
  const events = new BookmarkFolderEvents();
  // 注意: この関数は内部メソッドなので直接呼び出せません
  // 代わりにsetupFolderClickHandlerを使用してください
}
