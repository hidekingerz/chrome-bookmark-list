/**
 * 型定義のエクスポート
 */

// ブックマーク関連の型
export type {
  BookmarkItem,
  BookmarkFolder,
  BookmarkUpdateData,
  BookmarkMoveData,
  ChromeBookmarkNode,
} from './bookmark.js';

// イベント関連の型
export type {
  BookmarkClickEventData,
  FolderToggleEventData,
  BookmarkEditEventData,
  BookmarkDeleteEventData,
  BookmarkDataAttributes,
} from './events.js';

// 既存のtypes.tsからの再エクスポート（後方互換性のため）
export type { BookmarkFolder as LegacyBookmarkFolder } from '../scripts/types.js';
