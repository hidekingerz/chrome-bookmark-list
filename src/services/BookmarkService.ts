import type {
  BookmarkFolder,
  BookmarkItem,
  ChromeBookmarkNode,
} from '../types/bookmark.js';

/**
 * ブックマークの処理とChrome API操作を担当するサービス
 */
export class BookmarkService {
  /**
   * Chrome APIからブックマークツリーを取得して処理する
   */
  async getBookmarkTree(): Promise<BookmarkFolder[]> {
    try {
      const chromeBookmarks = await chrome.bookmarks.getTree();
      return this.processBookmarkTree(chromeBookmarks);
    } catch (error) {
      console.error('ブックマーク取得エラー:', error);
      throw new Error('ブックマークの取得に失敗しました');
    }
  }

  /**
   * Chromeブックマークツリーを内部形式に変換する
   */
  processBookmarkTree(tree: ChromeBookmarkNode[]): BookmarkFolder[] {
    const folders: BookmarkFolder[] = [];

    for (const rootNode of tree) {
      if (rootNode.children) {
        for (const child of rootNode.children) {
          // ブックマークバー、その他のブックマーク、モバイルブックマークを処理
          if (child.children && child.title !== 'Mobile bookmarks') {
            // "Bookmarks Bar"の場合は、その子フォルダを直接追加し、ルートブックマークも含める
            if (
              child.title === 'Bookmarks bar' ||
              child.title === 'Bookmarks Bar' ||
              child.title === 'ブックマーク バー'
            ) {
              // ルートブックマークがある場合は、専用フォルダを作成
              const rootBookmarks: BookmarkItem[] = [];
              const subfolders: BookmarkFolder[] = [];

              for (const grandChild of child.children) {
                if (grandChild.children) {
                  // サブフォルダ
                  const subfolder = this.convertNodeToFolder(grandChild);
                  if (subfolder) {
                    subfolders.push(subfolder);
                  }
                } else if (grandChild.url && grandChild.title) {
                  // ルートブックマーク
                  rootBookmarks.push({
                    title: grandChild.title,
                    url: grandChild.url,
                    favicon: null,
                  });
                }
              }

              // サブフォルダを追加
              folders.push(...subfolders);

              // ルートブックマークがある場合は、「ブックマークバー」フォルダとして追加
              if (rootBookmarks.length > 0) {
                folders.unshift({
                  id: child.id,
                  title: 'ブックマークバー',
                  bookmarks: rootBookmarks,
                  subfolders: [],
                  expanded: true,
                });
              }
            } else {
              // その他のブックマークフォルダは直接追加
              const folder = this.convertNodeToFolder(child);
              if (folder) {
                folders.push(folder);
              }
            }
          }
        }
      }
    }

    return folders;
  }

  /**
   * ChromeBookmarkNodeを内部のBookmarkFolder形式に変換する
   */
  private convertNodeToFolder(node: ChromeBookmarkNode): BookmarkFolder | null {
    if (!node.children) {
      return null;
    }

    const bookmarks: BookmarkItem[] = [];
    const subfolders: BookmarkFolder[] = [];

    for (const child of node.children) {
      if (child.children) {
        // サブフォルダ
        const subfolder = this.convertNodeToFolder(child);
        if (subfolder) {
          subfolders.push(subfolder);
        }
      } else if (child.url && child.title) {
        // ブックマークアイテム
        bookmarks.push({
          title: child.title,
          url: child.url,
          favicon: null, // 後でFaviconServiceが設定
        });
      }
    }

    return {
      id: node.id,
      title: node.title || 'Untitled',
      bookmarks,
      subfolders,
      expanded: true, // デフォルトで展開状態にする
    };
  }

  /**
   * IDでフォルダを検索する
   */
  findFolderById(folders: BookmarkFolder[], id: string): BookmarkFolder | null {
    for (const folder of folders) {
      if (folder.id === id) {
        return folder;
      }

      // サブフォルダを再帰的に検索
      const found = this.findFolderById(folder.subfolders, id);
      if (found) {
        return found;
      }
    }

    return null;
  }

  /**
   * フォルダ内の総ブックマーク数を計算する
   */
  getTotalBookmarks(folder: BookmarkFolder): number {
    return (
      folder.bookmarks.length +
      folder.subfolders.reduce(
        (sum, sub) => sum + this.getTotalBookmarks(sub),
        0
      )
    );
  }

  /**
   * ブックマークを検索条件でフィルタリングする
   */
  filterBookmarks(
    folders: BookmarkFolder[],
    searchTerm: string
  ): BookmarkFolder[] {
    if (!searchTerm.trim()) {
      return folders;
    }

    const filteredFolders: BookmarkFolder[] = [];
    const lowerSearchTerm = searchTerm.toLowerCase();

    for (const folder of folders) {
      const filteredBookmarks = folder.bookmarks.filter(
        (bookmark) =>
          bookmark.title.toLowerCase().includes(lowerSearchTerm) ||
          bookmark.url.toLowerCase().includes(lowerSearchTerm)
      );

      const filteredSubfolders = this.filterBookmarks(
        folder.subfolders,
        searchTerm
      );

      // フィルタリング結果がある場合、このフォルダを含める
      if (filteredBookmarks.length > 0 || filteredSubfolders.length > 0) {
        filteredFolders.push({
          ...folder,
          bookmarks: filteredBookmarks,
          subfolders: filteredSubfolders,
          expanded: true, // 検索時は展開
        });
      }
    }

    return filteredFolders;
  }

  /**
   * ブックマークを移動する
   */
  async moveBookmark(
    bookmarkUrl: string,
    targetFolderId: string
  ): Promise<void> {
    try {
      const bookmarks = await chrome.bookmarks.search({ url: bookmarkUrl });

      if (bookmarks.length === 0) {
        throw new Error('移動するブックマークが見つかりません');
      }

      const bookmark = bookmarks[0];

      await chrome.bookmarks.move(bookmark.id, {
        parentId: targetFolderId,
      });

      console.log('ブックマーク移動完了:', {
        bookmarkId: bookmark.id,
        title: bookmark.title,
        newParentId: targetFolderId,
      });
    } catch (error) {
      console.error('ブックマーク移動エラー:', error);
      throw error;
    }
  }

  /**
   * ブックマークを更新する
   */
  async updateBookmark(
    url: string,
    newTitle: string,
    newUrl: string
  ): Promise<void> {
    try {
      const bookmarks = await chrome.bookmarks.search({ url });

      if (bookmarks.length === 0) {
        throw new Error('更新するブックマークが見つかりません');
      }

      const bookmark = bookmarks[0];

      await chrome.bookmarks.update(bookmark.id, {
        title: newTitle,
        url: newUrl,
      });

      console.log('ブックマーク更新完了:', {
        bookmarkId: bookmark.id,
        oldTitle: bookmark.title,
        newTitle,
        newUrl,
      });
    } catch (error) {
      console.error('ブックマーク更新エラー:', error);
      throw error;
    }
  }

  /**
   * ブックマークを削除する
   */
  async deleteBookmark(url: string): Promise<void> {
    try {
      const bookmarks = await chrome.bookmarks.search({ url });

      if (bookmarks.length === 0) {
        throw new Error('削除するブックマークが見つかりません');
      }

      const bookmark = bookmarks[0];

      await chrome.bookmarks.remove(bookmark.id);

      console.log('ブックマーク削除完了:', {
        bookmarkId: bookmark.id,
        title: bookmark.title,
        url,
      });
    } catch (error) {
      console.error('ブックマーク削除エラー:', error);
      throw error;
    }
  }
}
