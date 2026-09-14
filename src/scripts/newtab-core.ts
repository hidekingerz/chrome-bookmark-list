/**
 * newtab.ts とテストから使う薄い関数 API。
 * BookmarkFolderRenderer / BookmarkFolderEvents / BookmarkActions への委譲のみを行う。
 */

import { BookmarkActions } from '../components/BookmarkActions/index.js';
import { BookmarkFolderEvents } from '../components/BookmarkFolder/BookmarkFolderEvents.js';
import { BookmarkFolderRenderer } from '../components/BookmarkFolder/BookmarkFolderRenderer.js';
import type { BookmarkFolder } from '../types/bookmark.js';

const folderRenderer = new BookmarkFolderRenderer();
const folderEvents = new BookmarkFolderEvents();
const bookmarkActions = new BookmarkActions();

/**
 * フォルダを HTML に変換する
 */
export function renderFolder(folder: BookmarkFolder, level = 0): string {
  return folderRenderer.renderFolder(folder, level);
}

/**
 * フォルダクリックのイベントハンドラーを設定する
 */
export function setupFolderClickHandler(
  container: HTMLElement,
  allBookmarks: BookmarkFolder[]
): void {
  folderEvents.setupFolderClickHandler(container, allBookmarks);
}

/**
 * ブックマークを指定コンテナに表示する（テストから使う）
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

  container.innerHTML = folderRenderer.renderFolders(folders);
  folderEvents.setupFolderClickHandler(container, folders);
}

/**
 * ブックマーク削除の処理を行う
 */
export async function handleBookmarkDelete(
  deleteBtn: HTMLElement
): Promise<void> {
  return bookmarkActions.handleDelete(deleteBtn);
}

/**
 * ブックマーク編集の処理を行う
 */
export async function handleBookmarkEdit(editBtn: HTMLElement): Promise<void> {
  return bookmarkActions.handleEdit(editBtn);
}
