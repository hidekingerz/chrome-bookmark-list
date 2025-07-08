/**
 * ブックマークアクション関連のクラスのエクスポート
 */

import { BookmarkEditor } from './BookmarkEditor.js';
import { BookmarkDeleter } from './BookmarkDeleter.js';

export { BookmarkEditor } from './BookmarkEditor.js';
export { BookmarkDeleter } from './BookmarkDeleter.js';

/**
 * ブックマークアクションを統合するクラス
 */
export class BookmarkActions {
  private editor: BookmarkEditor;
  private deleter: BookmarkDeleter;

  constructor() {
    this.editor = new BookmarkEditor();
    this.deleter = new BookmarkDeleter();
  }

  /**
   * ブックマーク編集を実行する
   */
  async handleEdit(editBtn: HTMLElement): Promise<void> {
    return this.editor.handleBookmarkEdit(editBtn);
  }

  /**
   * ブックマーク削除を実行する
   */
  async handleDelete(deleteBtn: HTMLElement): Promise<void> {
    return this.deleter.handleBookmarkDelete(deleteBtn);
  }
}
