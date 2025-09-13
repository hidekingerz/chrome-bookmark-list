/**
 * アプリケーション全体で使用する定数
 */

// Favicon関連
export const FAVICON_CACHE_KEY = 'bookmark_favicon_cache';
export const FAVICON_CACHE_EXPIRY_DAYS = 7;
export const FAVICON_TIMEOUT_MS = 1000;

// UI関連
export const BOOKMARK_ANIMATION_DURATION_MS = 200;
export const SEARCH_DEBOUNCE_MS = 300;

// Chrome API関連
export const CHROME_EXTENSION_SCHEME = 'chrome-extension://';
export const EXCLUDED_BOOKMARK_FOLDERS = ['Mobile bookmarks'];

// エラーメッセージ
export const ERROR_MESSAGES = {
  BOOKMARK_NOT_FOUND: 'ブックマークが見つかりません',
  PERMISSION_DENIED: '必要な権限がありません',
  NETWORK_ERROR: 'ネットワークエラーが発生しました',
  GENERIC_ERROR: '予期しないエラーが発生しました',
  FAVICON_LOAD_FAILED: 'ファビコンの読み込みに失敗しました',
  BOOKMARK_LOAD_FAILED: 'ブックマークの読み込みに失敗しました',
} as const;

// CSS クラス名
export const CSS_CLASSES = {
  HIDDEN: 'hidden',
  EXPANDED: 'expanded',
  COLLAPSED: 'collapsed',
  DRAGGING: 'dragging',
  DROP_TARGET_HIGHLIGHT: 'drop-target-highlight',
  LOADING: 'loading',
  ERROR: 'error',
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
