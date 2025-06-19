import type {
  BookmarkFolder,
  ChromeBookmarkNode,
  FaviconCacheData,
} from './types.js';

// Favicon キャッシュ管理
export const faviconCache = new Map<string, string>();
export const FAVICON_CACHE_KEY = 'bookmark_favicon_cache';
export const CACHE_EXPIRY_DAYS = 7;

// Favicon キャッシュの初期化
export async function initFaviconCache(): Promise<void> {
  try {
    const stored = localStorage.getItem(FAVICON_CACHE_KEY);
    if (stored) {
      const { data, timestamp }: FaviconCacheData = JSON.parse(stored);
      const isExpired =
        Date.now() - timestamp > CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

      if (!isExpired) {
        for (const [url, favicon] of Object.entries(data)) {
          faviconCache.set(url, favicon);
        }
      } else {
        localStorage.removeItem(FAVICON_CACHE_KEY);
      }
    }
  } catch (error) {
    console.error('Favicon キャッシュの初期化に失敗しました:', error);
  }
}

// Favicon キャッシュを保存
export function saveFaviconCache(): void {
  try {
    const data: Record<string, string> = {};
    faviconCache.forEach((value, key) => {
      data[key] = value;
    });

    const cacheData: FaviconCacheData = {
      data,
      timestamp: Date.now(),
    };

    localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Favicon キャッシュの保存に失敗しました:', error);
  }
}

// Favicon の有効性チェック
export function checkFaviconValidity(faviconUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);

    // CORS対応のためcrossOriginを設定しない（Chrome拡張機能では不要）
    img.src = faviconUrl;

    // タイムアウト設定（1秒に短縮）
    setTimeout(() => resolve(false), 1000);
  });
}

// 必要な権限を確認・リクエストする
async function ensureHostPermission(url: string): Promise<boolean> {
  try {
    const urlObj = new URL(url);
    const origin = urlObj.origin;

    // 既に権限があるかチェック
    const hasPermission = await chrome.permissions.contains({
      origins: [`${origin}/*`],
    });

    if (hasPermission) {
      return true;
    }

    // 権限をリクエスト（ユーザーの操作が必要）
    // ただし、自動的にリクエストしないでGoogle Favicon APIを使用
    return false;
  } catch (error) {
    console.warn('権限チェックエラー:', error);
    return false;
  }
}

// Favicon を取得する
export async function getFavicon(url: string): Promise<string> {
  // ステップ1: キャッシュから確認
  if (faviconCache.has(url)) {
    const cached = faviconCache.get(url);
    if (cached) {
      return cached;
    }
  }

  try {
    const urlObj = new URL(url);
    const domain = getDomain(url);
    const protocol = urlObj.protocol;

    // ステップ2: 標準パス試行
    const faviconUrls = [
      `${protocol}//${domain}/favicon.ico`,
      `${protocol}//${domain}/favicon.png`,
      `${protocol}//${domain}/favicon.svg`,
    ];

    // 並列でfavicon URLをチェック（最初に成功したものを使用）
    try {
      const validityPromises = faviconUrls.map(async (faviconUrl) => {
        const isValid = await checkFaviconValidity(faviconUrl);
        if (isValid) {
          return faviconUrl;
        }
        throw new Error(`Invalid favicon: ${faviconUrl}`);
      });

      // Promise.any を使用して最初に成功したfaviconを取得
      const validFaviconUrl = await Promise.any(validityPromises);
      faviconCache.set(url, validFaviconUrl);
      saveFaviconCache();
      return validFaviconUrl;
    } catch {
      // すべてのfavicon URLが失敗した場合、次のステップへ
    }

    // ステップ3: HTML解析
    try {
      const htmlFaviconUrl = await getFaviconFromHtml(url);
      if (htmlFaviconUrl) {
        const isValid = await checkFaviconValidity(htmlFaviconUrl);
        if (isValid) {
          faviconCache.set(url, htmlFaviconUrl);
          saveFaviconCache();
          return htmlFaviconUrl;
        }
      }
    } catch (error) {
      console.warn('HTMLからのfavicon取得エラー:', url, error);
    }
  } catch (error) {
    console.warn('Favicon 取得エラー:', url, error);
  }

  // ステップ4: デフォルト表示（SVGプレースホルダー）
  const defaultFavicon =
    'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="none" stroke="%23666" stroke-width="1.5"/><path d="M6 8h4M8 6v4" stroke="%23666" stroke-width="1.5" stroke-linecap="round"/></svg>';

  faviconCache.set(url, defaultFavicon);
  saveFaviconCache();
  return defaultFavicon;
}

// HTMLからfaviconのURLを検出する
export async function getFaviconFromHtml(url: string): Promise<string | null> {
  try {
    // 権限チェック
    const hasPermission = await ensureHostPermission(url);
    if (!hasPermission) {
      console.warn('HTMLからのfavicon検出には権限が必要です:', url);
      return null;
    }

    // Chrome拡張機能のコンテキストではCORSの制限が緩い
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BookmarkExtension/1.0)',
      },
    });

    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // 複数のfavicon形式を優先順位で検索
    const selectors = [
      'link[rel="icon"][type="image/svg+xml"]',
      'link[rel="icon"][type="image/png"]',
      'link[rel="icon"][type="image/x-icon"]',
      'link[rel="shortcut icon"]',
      'link[rel="apple-touch-icon"]',
      'link[rel="apple-touch-icon-precomposed"]',
      'link[rel="icon"]',
    ];

    for (const selector of selectors) {
      const link = doc.querySelector(selector) as HTMLLinkElement;
      if (link?.href) {
        // 相対URLを絶対URLに変換
        const faviconUrl = new URL(link.href, url).href;
        return faviconUrl;
      }
    }

    return null;
  } catch (error) {
    console.warn('HTMLからのfavicon検出エラー:', url, error);
    return null;
  }
}

// ブックマークツリーを処理してフォルダ別に整理
export function processBookmarkTree(
  tree: ChromeBookmarkNode[]
): BookmarkFolder[] {
  const folders: BookmarkFolder[] = [];

  function buildFolderStructure(
    node: ChromeBookmarkNode,
    level = 0
  ): BookmarkFolder {
    const folder: BookmarkFolder = {
      id: node.id,
      title: node.title,
      bookmarks: [],
      subfolders: [],
      expanded: true, // 仮の初期値、後で調整
    };

    if (node.children) {
      for (const child of node.children) {
        if (child.url) {
          // ブックマーク（URL）の場合
          folder.bookmarks.push({
            title: child.title,
            url: child.url,
            favicon: null, // 後で非同期で取得
          });
        } else if (child.children) {
          // サブフォルダの場合
          const subfolder = buildFolderStructure(child, level + 1);
          folder.subfolders.push(subfolder);
        }
      }
    }

    // すべてのフォルダを初期展開（ネストしたブックマークも見え、テストの期待にも合致）
    folder.expanded = true;

    return folder;
  }

  // ルートから開始、ブックマークバーレベルはスキップ
  for (const rootNode of tree) {
    if (rootNode.children) {
      for (const topLevelNode of rootNode.children) {
        if (topLevelNode.children && topLevelNode.children.length > 0) {
          // ブックマークバーの直下の各フォルダを処理
          for (const child of topLevelNode.children) {
            if (child.children) {
              // フォルダの場合（level 0として開始）
              const folder = buildFolderStructure(child, 0);
              folders.push(folder);
            } else if (child.url) {
              // ブックマークバー直下のブックマークがある場合
              if (!folders.find((f) => f.title === 'ブックマークバー直下')) {
                folders.push({
                  id: 'bookmark-bar-direct',
                  title: 'ブックマークバー直下',
                  bookmarks: [],
                  subfolders: [],
                  expanded: true, // ブックマークバー直下は開いておく
                });
              }
              const directFolder = folders.find(
                (f) => f.title === 'ブックマークバー直下'
              );
              if (directFolder) {
                directFolder.bookmarks.push({
                  title: child.title,
                  url: child.url,
                  favicon: null, // 後で非同期で取得
                });
              }
            }
          }
        }
      }
    }
  }

  return folders;
}

// フォルダIDでフォルダを検索するヘルパー関数
export function findFolderById(
  folders: BookmarkFolder[],
  id: string
): BookmarkFolder | null {
  for (const folder of folders) {
    if (folder.id === id) {
      return folder;
    }
    const found = findFolderById(folder.subfolders, id);
    if (found) return found;
  }
  return null;
}

// 総ブックマーク数を計算するヘルパー関数
export function getTotalBookmarks(folder: BookmarkFolder): number {
  return (
    folder.bookmarks.length +
    folder.subfolders.reduce((sum, sub) => sum + getTotalBookmarks(sub), 0)
  );
}

// ブックマークを検索でフィルタリング
export function filterBookmarks(
  folders: BookmarkFolder[],
  searchTerm: string
): BookmarkFolder[] {
  if (!searchTerm) return folders;

  function filterFolder(folder: BookmarkFolder): BookmarkFolder {
    const filteredBookmarks = folder.bookmarks.filter(
      (bookmark) =>
        bookmark.title.toLowerCase().includes(searchTerm) ||
        bookmark.url.toLowerCase().includes(searchTerm)
    );

    const filteredSubfolders = folder.subfolders
      .map((subfolder) => filterFolder(subfolder))
      .filter(
        (subfolder) =>
          subfolder.bookmarks.length > 0 || subfolder.subfolders.length > 0
      );

    return {
      ...folder,
      bookmarks: filteredBookmarks,
      subfolders: filteredSubfolders,
      expanded: searchTerm ? true : folder.expanded, // 検索時は自動展開
    };
  }

  return folders
    .map((folder) => filterFolder(folder))
    .filter(
      (folder) => folder.bookmarks.length > 0 || folder.subfolders.length > 0
    );
}

// HTMLエスケープ
export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// URLからドメインを取得
export function getDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
