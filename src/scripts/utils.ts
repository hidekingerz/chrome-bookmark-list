/**
 * ブックマーク処理・favicon・HTML エスケープの関数 API。
 * コンポーネントとテストはこのモジュールから import する。
 * BookmarkService / FaviconService はここで遅延生成したインスタンスを共有する。
 */

import { BookmarkService } from '../services/BookmarkService.js';
import { FaviconService } from '../services/FaviconService.js';
import type { BookmarkFolder, ChromeBookmarkNode } from '../types/bookmark.js';

let faviconService: FaviconService | null = null;
let bookmarkService: BookmarkService | null = null;

function getFaviconService(): FaviconService {
  if (!faviconService) {
    faviconService = new FaviconService();
  }
  return faviconService;
}

function getBookmarkService(): BookmarkService {
  if (!bookmarkService) {
    bookmarkService = new BookmarkService();
  }
  return bookmarkService;
}

/**
 * ページ URL に対応する favicon URL を返す。
 * FaviconService 自体は同期だが、呼び出し側（およびテストの mock）が
 * Promise を前提にしているため async のまま公開する。
 */
export async function getFavicon(url: string): Promise<string> {
  return getFaviconService().getFavicon(url);
}

export function processBookmarkTree(
  tree: ChromeBookmarkNode[]
): BookmarkFolder[] {
  return getBookmarkService().processBookmarkTree(tree);
}

export function filterBookmarks(
  folders: BookmarkFolder[],
  searchTerm: string
): BookmarkFolder[] {
  return getBookmarkService().filterBookmarks(folders, searchTerm);
}

export function applyExpandedState(
  folders: BookmarkFolder[],
  previous: BookmarkFolder[]
): void {
  getBookmarkService().applyExpandedState(folders, previous);
}

export function findFolderById(
  folders: BookmarkFolder[],
  id: string
): BookmarkFolder | null {
  return getBookmarkService().findFolderById(folders, id);
}

export function getTotalBookmarks(folder: BookmarkFolder): number {
  return getBookmarkService().getTotalBookmarks(folder);
}

export async function getAllFolders(): Promise<ChromeBookmarkNode[]> {
  return getBookmarkService().getAllFolders();
}

/**
 * HTML の特殊文字をエスケープする。
 * textContent→innerHTML 方式は & < > のみをエスケープし " ' を残すため、
 * 属性値に埋め込むと属性インジェクション/属性値破壊が起きる (#96)。
 * & < > " ' をすべて明示的に置換する。
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * URL からホスト名を取り出す。不正な URL は 'localhost' を返す。
 */
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'localhost';
  }
}
