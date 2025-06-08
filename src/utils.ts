import { BookmarkFolder, ChromeBookmarkNode, FaviconCacheData } from './types.js';

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
            const isExpired = Date.now() - timestamp > (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
            
            if (!isExpired) {
                Object.entries(data).forEach(([url, favicon]) => {
                    faviconCache.set(url, favicon);
                });
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
            timestamp: Date.now()
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
        img.src = faviconUrl;
        
        // タイムアウト設定（2秒）
        setTimeout(() => resolve(false), 2000);
    });
}

// Favicon を取得する
export async function getFavicon(url: string): Promise<string> {
    // キャッシュから確認
    if (faviconCache.has(url)) {
        return faviconCache.get(url)!;
    }
    
    try {
        const domain = new URL(url).hostname;
        const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=16`;
        
        // Favicon の有効性をチェック
        const isValid = await checkFaviconValidity(faviconUrl);
        
        if (isValid) {
            faviconCache.set(url, faviconUrl);
            saveFaviconCache();
            return faviconUrl;
        }
    } catch (error) {
        console.warn('Favicon 取得エラー:', url, error);
    }
    
    // デフォルトのfavicon
    const defaultFavicon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855-.143.268-.276.56-.395.872.705.157 1.472.257 2.282.287V1.077zM4.249 3.539c.142-.384.304-.744.481-1.078a6.7 6.7 0 0 1 .597-.933A7.01 7.01 0 0 0 2.255 3.131c.43.16.865.345 1.994.408zM3.509 7.5c.036-1.07.188-2.087.436-3.008a9.124 9.124 0 0 1-1.565-.667A6.964 6.964 0 0 0 1.018 7.5h2.49zm1.4-2.741a12.344 12.344 0 0 0-.4 2.741H7.5V5.091c-.91-.03-1.783-.145-2.591-.332zM8.5 5.09V7.5h2.99a12.342 12.342 0 0 0-.399-2.741c-.808.187-1.681.301-2.591.332zM4.51 8.5c.035.987.176 1.914.399 2.741A13.612 13.612 0 0 1 7.5 10.91V8.5H4.51zm3.99 0v2.409c.91.03 1.783.145 2.591.332.223-.827.364-1.754.4-2.741H8.5zm-3.282 3.696c.12.312.252.604.395.872.552 1.035 1.218 1.65 1.887 1.855V11.91c-.81.03-1.577.13-2.282.287zm.11 2.276a6.696 6.696 0 0 1-.598-.933 8.853 8.853 0 0 1-.481-1.079 8.38 8.38 0 0 0-1.198.49 7.01 7.01 0 0 0 2.276 1.522zm-1.383-2.964A13.36 13.36 0 0 1 3.508 8.5h-2.49a6.963 6.963 0 0 0 1.362 3.675c.47-.258.995-.482 1.565-.667zm6.728 2.964a7.009 7.009 0 0 0 2.275-1.521 8.376 8.376 0 0 0-1.197-.49 8.853 8.853 0 0 1-.481 1.078 6.688 6.688 0 0 1-.597.933zM8.5 11.909v3.014c.67-.204 1.335-.82 1.887-1.855.143-.268.276-.56.395-.872A12.63 12.63 0 0 0 8.5 11.91zm3.555-.401c.57.185 1.095.409 1.565.667A6.963 6.963 0 0 0 14.982 8.5h-2.49a13.36 13.36 0 0 1-.437 3.008zM14.982 7.5a6.963 6.963 0 0 0-1.362-3.675c-.47.258-.995.482-1.565.667.248.92.4 1.938.437 3.008h2.49zM11.27 2.461c.177.334.339.694.482 1.078a8.368 8.368 0 0 0 1.196-.49 7.01 7.01 0 0 0-2.275-1.52c.218.283.418.597.597.932zm-.488 1.343a7.765 7.765 0 0 0-.395-.872C9.835 1.897 9.17 1.282 8.5 1.077V4.09c.81-.03 1.577-.13 2.282-.287z"/></svg>';
    
    faviconCache.set(url, defaultFavicon);
    saveFaviconCache();
    return defaultFavicon;
}

// ブックマークツリーを処理してフォルダ別に整理
export function processBookmarkTree(tree: ChromeBookmarkNode[]): BookmarkFolder[] {
    const folders: BookmarkFolder[] = [];
    
    function buildFolderStructure(node: ChromeBookmarkNode, level: number = 0): BookmarkFolder {
        const folder: BookmarkFolder = {
            id: node.id,
            title: node.title,
            bookmarks: [],
            subfolders: [],
            expanded: true // 仮の初期値、後で調整
        };
        
        if (node.children) {
            node.children.forEach(child => {
                if (child.url) {
                    // ブックマーク（URL）の場合
                    folder.bookmarks.push({
                        title: child.title,
                        url: child.url,
                        favicon: null // 後で非同期で取得
                    });
                } else if (child.children) {
                    // サブフォルダの場合
                    const subfolder = buildFolderStructure(child, level + 1);
                    folder.subfolders.push(subfolder);
                }
            });
        }
        
        // すべてのフォルダを初期展開（ネストしたブックマークも見え、テストの期待にも合致）
        folder.expanded = true;
        
        return folder;
    }
    
    // ルートから開始、ブックマークバーレベルはスキップ
    tree.forEach(rootNode => {
        if (rootNode.children) {
            rootNode.children.forEach(topLevelNode => {
                if (topLevelNode.children && topLevelNode.children.length > 0) {
                    // ブックマークバーの直下の各フォルダを処理
                    topLevelNode.children.forEach(child => {
                        if (child.children) {
                            // フォルダの場合（level 0として開始）
                            const folder = buildFolderStructure(child, 0);
                            folders.push(folder);
                        } else if (child.url) {
                            // ブックマークバー直下のブックマークがある場合
                            if (!folders.find(f => f.title === 'ブックマークバー直下')) {
                                folders.push({
                                    id: 'bookmark-bar-direct',
                                    title: 'ブックマークバー直下',
                                    bookmarks: [],
                                    subfolders: [],
                                    expanded: true // ブックマークバー直下は開いておく
                                });
                            }
                            const directFolder = folders.find(f => f.title === 'ブックマークバー直下');
                            if (directFolder) {
                                directFolder.bookmarks.push({
                                    title: child.title,
                                    url: child.url,
                                    favicon: null // 後で非同期で取得
                                });
                            }
                        }
                    });
                }
            });
        }
    });
    
    return folders;
}

// フォルダIDでフォルダを検索するヘルパー関数
export function findFolderById(folders: BookmarkFolder[], id: string): BookmarkFolder | null {
    for (const folder of folders) {
        if (folder.id === id) {
            console.log('DEBUG: findFolderById found folder:', {
                id: id,
                title: folder.title,
                expanded: folder.expanded
            });
            return folder;
        }
        const found = findFolderById(folder.subfolders, id);
        if (found) return found;
    }
    console.log('DEBUG: findFolderById - folder not found:', id);
    return null;
}

// 総ブックマーク数を計算するヘルパー関数
export function getTotalBookmarks(folder: BookmarkFolder): number {
    return folder.bookmarks.length + folder.subfolders.reduce((sum, sub) => sum + getTotalBookmarks(sub), 0);
}

// ブックマークを検索でフィルタリング
export function filterBookmarks(folders: BookmarkFolder[], searchTerm: string): BookmarkFolder[] {
    if (!searchTerm) return folders;
    
    function filterFolder(folder: BookmarkFolder): BookmarkFolder {
        const filteredBookmarks = folder.bookmarks.filter(bookmark => 
            bookmark.title.toLowerCase().includes(searchTerm) ||
            bookmark.url.toLowerCase().includes(searchTerm)
        );
        
        const filteredSubfolders = folder.subfolders
            .map(subfolder => filterFolder(subfolder))
            .filter(subfolder => subfolder.bookmarks.length > 0 || subfolder.subfolders.length > 0);
        
        return {
            ...folder,
            bookmarks: filteredBookmarks,
            subfolders: filteredSubfolders,
            expanded: searchTerm ? true : folder.expanded // 検索時は自動展開
        };
    }
    
    return folders
        .map(folder => filterFolder(folder))
        .filter(folder => folder.bookmarks.length > 0 || folder.subfolders.length > 0);
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
