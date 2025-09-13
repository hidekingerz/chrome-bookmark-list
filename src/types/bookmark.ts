/**
 * ブックマークアイテムの型定義
 */
export interface BookmarkItem {
  /** ブックマークのタイトル */
  title: string;
  /** ブックマークのURL */
  url: string;
  /** ファビコンのデータURL、取得失敗時はnull */
  favicon: string | null;
}

/**
 * ブックマークフォルダの型定義
 */
export interface BookmarkFolder {
  /** フォルダのID */
  id: string;
  /** フォルダのタイトル */
  title: string;
  /** フォルダ内のブックマーク一覧 */
  bookmarks: BookmarkItem[];
  /** サブフォルダ一覧 */
  subfolders: BookmarkFolder[];
  /** 展開状態 */
  expanded: boolean;
}

/**
 * ブックマーク更新用のデータ型
 */
export interface BookmarkUpdateData {
  /** 新しいタイトル */
  title: string;
  /** 新しいURL */
  url: string;
}

/**
 * ブックマーク移動用のデータ型
 */
export interface BookmarkMoveData {
  /** 移動先の親フォルダID */
  parentId: string;
}

/**
 * Chrome Bookmarks API のノード型を拡張
 */
export interface ChromeBookmarkNode extends chrome.bookmarks.BookmarkTreeNode {
  /** 子ノード（フォルダの場合） */
  children?: ChromeBookmarkNode[];
}

/**
 * Faviconキャッシュのデータ型
 */
export interface FaviconCacheData {
  /** ドメインとファビコンURLのマップ */
  data: Record<string, string>;
  /** キャッシュのタイムスタンプ */
  timestamp: number;
}
