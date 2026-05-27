import { escapeHtml, getTotalBookmarks } from '../../scripts/utils.js';
import type { BookmarkFolder } from '../../types/bookmark.js';
import { BookmarkItemRenderer } from '../BookmarkItem/BookmarkItemRenderer.js';

/**
 * ブックマークフォルダーのレンダリングを担当するクラス
 */
export class BookmarkFolderRenderer {
  private bookmarkItemRenderer: BookmarkItemRenderer;

  constructor() {
    this.bookmarkItemRenderer = new BookmarkItemRenderer();
  }

  /**
   * フォルダをHTMLに変換する関数
   */
  renderFolder(folder: BookmarkFolder, level = 0): string {
    const hasSubfolders = folder.subfolders.length > 0;
    const hasBookmarks = folder.bookmarks.length > 0;
    const totalBookmarks = this.calculateTotalBookmarks(folder);

    // レベル1以上のサブフォルダなしフォルダは、親フォルダが折りたたまれていても表示を維持
    const shouldHide = level > 0 && hasSubfolders && !folder.expanded;

    return `
      <div class="bookmark-folder ${shouldHide ? 'hidden' : ''}"
           data-level="${level}"
           data-folder-id="${folder.id}"
           role="${level === 0 ? 'tree' : 'group'}">
        ${this.renderFolderHeader(folder, hasSubfolders, hasBookmarks, totalBookmarks)}
        ${this.renderFolderContent(folder, level)}
      </div>
    `;
  }

  /**
   * フォルダヘッダーを生成する
   */
  private renderFolderHeader(
    folder: BookmarkFolder,
    hasSubfolders: boolean,
    hasBookmarks: boolean,
    totalBookmarks: number
  ): string {
    const headerClass = hasSubfolders
      ? 'has-subfolders'
      : hasBookmarks
        ? 'has-bookmarks'
        : '';

    // Chrome のパーマネントフォルダ (id=1/2/3) はドラッグ不可
    const isPermanent =
      folder.id === '1' || folder.id === '2' || folder.id === '3';
    const draggableAttr = isPermanent ? '' : 'draggable="true"';

    const safeTitle = escapeHtml(folder.title);
    return `
      <div class="folder-header ${headerClass}" tabindex="0" role="treeitem" aria-expanded="${folder.expanded ? 'true' : 'false'}" aria-label="フォルダ「${safeTitle}」 ${totalBookmarks}件" ${draggableAttr}>
        <div class="folder-info">
          ${this.renderFolderIcon(hasSubfolders, hasBookmarks, folder.expanded)}
          <h2 class="folder-title">${safeTitle}</h2>
          ${hasSubfolders ? `<span class="subfolder-count">${folder.subfolders.length}個のフォルダ</span>` : ''}
        </div>
        <span class="bookmark-count" aria-hidden="true">${totalBookmarks}</span>
      </div>
    `;
  }

  /**
   * フォルダアイコンを生成する
   */
  private renderFolderIcon(
    hasSubfolders: boolean,
    hasBookmarks: boolean,
    expanded: boolean
  ): string {
    if (hasSubfolders || hasBookmarks) {
      return `<span class="expand-icon ${expanded ? 'expanded' : ''}">${expanded ? '📂' : '📁'}</span>`;
    }
    return '<span class="folder-icon">📄</span>';
  }

  /**
   * フォルダコンテンツ（ブックマークとサブフォルダ）を生成する
   */
  private renderFolderContent(folder: BookmarkFolder, level: number): string {
    const bookmarkListHtml = this.renderBookmarkSection(folder);
    const subfoldersHtml = this.renderSubfoldersSection(folder, level);

    return bookmarkListHtml + subfoldersHtml;
  }

  /**
   * ブックマークセクションを生成する
   */
  private renderBookmarkSection(folder: BookmarkFolder): string {
    if (folder.bookmarks.length === 0) {
      return '';
    }

    return this.bookmarkItemRenderer.renderBookmarkList(
      folder.bookmarks,
      folder.expanded
    );
  }

  /**
   * サブフォルダセクションを生成する
   */
  private renderSubfoldersSection(
    folder: BookmarkFolder,
    level: number
  ): string {
    if (folder.subfolders.length === 0) {
      return '';
    }

    const subfoldersHtml = folder.subfolders
      .map((subfolder) => this.renderFolder(subfolder, level + 1))
      .join('');

    // サブフォルダが 2 個以上の場合は 2 カラム表示にして縦長を抑える
    const multiColumnClass =
      folder.subfolders.length >= 2 ? ' multi-column' : '';

    return `
      <div class="subfolders-container ${folder.expanded ? 'expanded' : 'collapsed'}${multiColumnClass}"
           style="display: ${folder.expanded ? 'block' : 'none'};">
        ${subfoldersHtml}
      </div>
    `;
  }

  /**
   * フォルダ内の総ブックマーク数を計算する
   */
  private calculateTotalBookmarks(folder: BookmarkFolder): number {
    return (
      folder.bookmarks.length +
      folder.subfolders.reduce((sum, sub) => sum + getTotalBookmarks(sub), 0)
    );
  }

  /**
   * 複数のフォルダをレンダリングする
   */
  renderFolders(folders: BookmarkFolder[]): string {
    return folders.map((folder) => this.renderFolder(folder)).join('');
  }
}
