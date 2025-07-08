/**
 * イベント関連の型定義
 */

/**
 * ブックマーククリックイベントのデータ
 */
export interface BookmarkClickEventData {
  /** ブックマークのURL */
  url: string;
  /** ブックマークのタイトル */
  title: string;
}

/**
 * フォルダー展開/折りたたみイベントのデータ
 */
export interface FolderToggleEventData {
  /** フォルダーのID */
  folderId: string;
  /** 新しい展開状態 */
  expanded: boolean;
  /** フォルダーの階層レベル */
  level: number;
}

/**
 * ブックマーク編集イベントのデータ
 */
export interface BookmarkEditEventData {
  /** ブックマークのURL */
  url: string;
  /** 現在のタイトル */
  currentTitle: string;
}

/**
 * ブックマーク削除イベントのデータ
 */
export interface BookmarkDeleteEventData {
  /** ブックマークのURL */
  url: string;
  /** ブックマークのタイトル */
  title: string;
}

/**
 * DOM要素に付与される属性のマッピング
 */
export interface BookmarkDataAttributes {
  /** ブックマークのURL */
  'data-bookmark-url': string;
  /** ブックマークのタイトル */
  'data-bookmark-title': string;
  /** フォルダーのID */
  'data-folder-id'?: string;
  /** 階層レベル */
  'data-level'?: string;
}
