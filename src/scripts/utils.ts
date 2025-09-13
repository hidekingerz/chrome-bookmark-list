/**
 * レガシー互換性のためのユーティリティ関数
 * 新しいコードでは、各種Serviceクラスを使用することを推奨
 */

import type { BookmarkFolder, ChromeBookmarkNode } from '../types/bookmark.js';
import { FaviconService } from '../services/FaviconService.js';
import { BookmarkService } from '../services/BookmarkService.js';
import { HtmlUtils } from '../utils/HtmlUtils.js';

// サービスインスタンス（シングルトン）
let faviconService: FaviconService | null = null;
let bookmarkService: BookmarkService | null = null;

/**
 * FaviconServiceのインスタンスを取得
 */
function getFaviconService(): FaviconService {
  if (!faviconService) {
    faviconService = new FaviconService();
  }
  return faviconService;
}

/**
 * BookmarkServiceのインスタンスを取得
 */
function getBookmarkService(): BookmarkService {
  if (!bookmarkService) {
    bookmarkService = new BookmarkService();
  }
  return bookmarkService;
}

// === レガシー互換関数（既存コードとの互換性のため） ===

/**
 * @deprecated FaviconService.initCache() を使用してください
 */
export async function initFaviconCache(): Promise<void> {
  await getFaviconService().initCache();
}

/**
 * @deprecated FaviconService.getFavicon() を使用してください
 */
export async function getFavicon(url: string): Promise<string> {
  return getFaviconService().getFavicon(url);
}

/**
 * @deprecated BookmarkService.processBookmarkTree() を使用してください
 */
export function processBookmarkTree(
  tree: ChromeBookmarkNode[]
): BookmarkFolder[] {
  return getBookmarkService().processBookmarkTree(tree);
}

/**
 * @deprecated BookmarkService.filterBookmarks() を使用してください
 */
export function filterBookmarks(
  folders: BookmarkFolder[],
  searchTerm: string
): BookmarkFolder[] {
  return getBookmarkService().filterBookmarks(folders, searchTerm);
}

/**
 * @deprecated BookmarkService.findFolderById() を使用してください
 */
export function findFolderById(
  folders: BookmarkFolder[],
  id: string
): BookmarkFolder | null {
  return getBookmarkService().findFolderById(folders, id);
}

/**
 * @deprecated BookmarkService.getTotalBookmarks() を使用してください
 */
export function getTotalBookmarks(folder: BookmarkFolder): number {
  return getBookmarkService().getTotalBookmarks(folder);
}

/**
 * @deprecated HtmlUtils.escapeHtml() を使用してください
 */
export function escapeHtml(text: string): string {
  return HtmlUtils.escapeHtml(text);
}

/**
 * @deprecated HtmlUtils.getDomain() を使用してください
 */
export function getDomain(url: string): string {
  return HtmlUtils.getDomain(url);
}

// === 新しいサービスクラスへのエクスポート ===

export { FaviconService } from '../services/FaviconService.js';
export { BookmarkService } from '../services/BookmarkService.js';
export { ErrorHandler } from '../services/ErrorHandler.js';
export { HtmlUtils } from '../utils/HtmlUtils.js';
