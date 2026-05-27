import { escapeHtml } from '../../scripts/utils.js';
import type { BookmarkItem } from '../../types/bookmark.js';

/**
 * ブックマークアイテムのレンダリングを担当するクラス
 */
export class BookmarkItemRenderer {
  /**
   * 単一のブックマークアイテムをHTMLとして生成する
   */
  renderBookmarkItem(bookmark: BookmarkItem): string {
    const safeTitle = escapeHtml(bookmark.title);
    const safeUrl = escapeHtml(bookmark.url);
    return `
      <li class="bookmark-item" tabindex="0" role="treeitem" aria-label="${safeTitle}" data-bookmark-url="${safeUrl}" data-bookmark-title="${safeTitle}">
        <a href="#" class="bookmark-link" data-url="${safeUrl}" tabindex="-1">
          <div class="bookmark-favicon-container" aria-hidden="true">
            <div class="favicon-placeholder">🔗</div>
            <img class="bookmark-favicon hidden" alt="" data-bookmark-url="${safeUrl}">
          </div>
          <span class="bookmark-title">${safeTitle}</span>
        </a>
        ${this.renderBookmarkActions(bookmark)}
      </li>
    `;
  }

  /**
   * ブックマークのアクション（編集・削除）ボタンを生成する
   */
  renderBookmarkActions(bookmark: BookmarkItem): string {
    const safeTitle = escapeHtml(bookmark.title);
    const safeUrl = escapeHtml(bookmark.url);
    return `
      <div class="bookmark-actions">
        <button class="bookmark-edit-btn"
                type="button"
                data-bookmark-url="${safeUrl}"
                data-bookmark-title="${safeTitle}"
                title="編集"
                aria-label="「${safeTitle}」を編集">
          <span aria-hidden="true">✏️</span>
        </button>
        <button class="bookmark-delete-btn"
                type="button"
                data-bookmark-url="${safeUrl}"
                data-bookmark-title="${safeTitle}"
                title="削除"
                aria-label="「${safeTitle}」を削除">
          <span aria-hidden="true">🗑️</span>
        </button>
      </div>
    `;
  }

  /**
   * ブックマークリスト全体をHTMLとして生成する
   */
  renderBookmarkList(bookmarks: BookmarkItem[], expanded: boolean): string {
    if (bookmarks.length === 0) {
      return '';
    }

    const bookmarkItems = bookmarks
      .map((bookmark) => this.renderBookmarkItem(bookmark))
      .join('');

    return `
      <ul class="bookmark-list ${expanded ? 'expanded' : 'collapsed'}"
          role="group"
          style="display: ${expanded ? 'block' : 'none'}">
        ${bookmarkItems}
      </ul>
    `;
  }
}
