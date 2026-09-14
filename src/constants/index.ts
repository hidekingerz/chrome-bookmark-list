/**
 * アプリケーション全体で使用する定数
 */

// UI関連
export const SEARCH_DEBOUNCE_MS = 300;

// Chrome のパーマネントルートフォルダ ID は固定でロケール非依存。
// タイトル文字列比較は多言語で壊れるため ID で判定する (#103)。
export const BOOKMARK_ROOT_IDS = {
  /** ブックマークバー */
  BOOKMARKS_BAR: '1',
  /** その他のブックマーク */
  OTHER: '2',
  /** モバイルのブックマーク */
  MOBILE: '3',
} as const;

// DOM セレクター
export const SELECTORS = {
  BOOKMARK_CONTAINER: '#bookmarkContainer',
  SEARCH_INPUT: '#searchInput',
  BOOKMARK_LINK: '.bookmark-link',
  FOLDER_HEADER: '.folder-header',
  BOOKMARK_FOLDER: '.bookmark-folder',
  BOOKMARK_ITEM: '.bookmark-item',
  FAVICON: '.bookmark-favicon',
  FAVICON_PLACEHOLDER: '.favicon-placeholder',
} as const;
