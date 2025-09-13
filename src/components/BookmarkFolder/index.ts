/**
 * ブックマークフォルダー関連のクラスのエクスポート
 */

import { BookmarkFolderEvents } from './BookmarkFolderEvents.js';
import { BookmarkFolderRenderer } from './BookmarkFolderRenderer.js';

export { BookmarkFolderEvents } from './BookmarkFolderEvents.js';
export { BookmarkFolderRenderer } from './BookmarkFolderRenderer.js';

/**
 * ブックマークフォルダー機能を統合するクラス
 */
export class BookmarkFolder {
  private renderer: BookmarkFolderRenderer;
  private events: BookmarkFolderEvents;

  constructor() {
    this.renderer = new BookmarkFolderRenderer();
    this.events = new BookmarkFolderEvents();
  }

  /**
   * フォルダーをレンダリングする
   */
  renderFolder(
    folder: import('../../types/bookmark.js').BookmarkFolder,
    level = 0
  ): string {
    return this.renderer.renderFolder(folder, level);
  }

  /**
   * 複数のフォルダーをレンダリングする
   */
  renderFolders(
    folders: import('../../types/bookmark.js').BookmarkFolder[]
  ): string {
    return this.renderer.renderFolders(folders);
  }

  /**
   * イベントハンドラーを設定する
   */
  setupEventHandlers(
    container: HTMLElement,
    allBookmarks: import('../../types/bookmark.js').BookmarkFolder[]
  ): void {
    this.events.setupFolderClickHandler(container, allBookmarks);
  }
}
