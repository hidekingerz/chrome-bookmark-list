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
    return `
      <li class="bookmark-item" tabindex="0" role="treeitem" data-bookmark-url="${escapeHtml(bookmark.url)}" data-bookmark-title="${escapeHtml(bookmark.title)}">
        <a href="#" class="bookmark-link" data-url="${escapeHtml(bookmark.url)}" tabindex="-1">
          <div class="bookmark-favicon-container">
            <div class="favicon-placeholder">🔗</div>
            <img class="bookmark-favicon hidden" alt="" data-bookmark-url="${escapeHtml(bookmark.url)}">
          </div>
          <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
        </a>
        ${this.renderBookmarkActions(bookmark)}
      </li>
    `;
  }

  /**
   * ブックマークのアクション（編集・削除）ボタンを生成する
   */
  renderBookmarkActions(bookmark: BookmarkItem): string {
    return `
      <div class="bookmark-actions">
        <button class="bookmark-edit-btn" 
                data-bookmark-url="${escapeHtml(bookmark.url)}" 
                data-bookmark-title="${escapeHtml(bookmark.title)}" 
                title="編集">
          ✏️
        </button>
        <button class="bookmark-delete-btn" 
                data-bookmark-url="${escapeHtml(bookmark.url)}" 
                data-bookmark-title="${escapeHtml(bookmark.title)}" 
                title="削除">
          🗑️
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
          style="display: ${expanded ? 'block' : 'none'}">
        ${bookmarkItems}
      </ul>
    `;
  }
}
