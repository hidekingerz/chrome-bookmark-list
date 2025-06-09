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

interface ChromeBookmarkNode {
  id: string;
  title: string;
  url?: string;
  children?: ChromeBookmarkNode[];
}

// Chrome API拡張
declare global {
  interface Window {
    chrome: typeof chrome;
  }
}

export type {
  BookmarkFolder,
  BookmarkItem,
  ChromeBookmarkNode,
  FaviconCacheData,
};
