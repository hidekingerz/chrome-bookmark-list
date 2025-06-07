// TypeScript型定義

interface BookmarkItem {
  title: string;
  url: string;
  favicon: string | null;
}

interface BookmarkFolder {
  id: string;
  title: string;
  bookmarks: BookmarkItem[];
  subfolders: BookmarkFolder[];
  expanded: boolean;
}

interface FaviconCacheData {
  data: Record<string, string>;
  timestamp: number;
}

// Chrome APIのBookmarkTreeNodeと互換性のある型定義
type ChromeBookmarkNode = chrome.bookmarks.BookmarkTreeNode;

export { BookmarkFolder, BookmarkItem, ChromeBookmarkNode, FaviconCacheData };

