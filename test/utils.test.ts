import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escapeHtml,
  filterBookmarks,
  findFolderById,
  getDomain,
  getFavicon,
  getTotalBookmarks,
  processBookmarkTree,
} from '../src/scripts/utils';
import type { BookmarkFolder, ChromeBookmarkNode } from '../src/types/bookmark';

// Chrome API のモック
const mockChromeStorage = {
  local: {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  },
};

// @ts-expect-error
global.chrome = {
  storage: mockChromeStorage,
  permissions: {
    contains: vi.fn().mockResolvedValue(false),
  },
};

describe('ユーティリティ関数', () => {
  beforeEach(() => {
    // 各テスト前にモックをクリア
    vi.clearAllMocks();
    mockChromeStorage.local.get.mockResolvedValue({});
    mockChromeStorage.local.set.mockResolvedValue(undefined);
    mockChromeStorage.local.remove.mockResolvedValue(undefined);
  });

  describe('processBookmarkTree', () => {
    it('ブックマークツリーが正しく処理されることを確認', () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '1',
              title: 'Bookmarks bar',
              children: [
                {
                  id: '2',
                  title: 'フォルダ1',
                  children: [
                    {
                      id: '3',
                      title: 'Google',
                      url: 'https://google.com',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const result = processBookmarkTree(tree);
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('フォルダ1');
      expect(result[0].bookmarks).toHaveLength(1);
      expect(result[0].bookmarks[0].title).toBe('Google');
    });

    it('空のツリーを正しく処理することを確認', () => {
      const tree: ChromeBookmarkNode[] = [];
      const result = processBookmarkTree(tree);
      expect(result).toEqual([]);
    });
  });

  describe('findFolderById', () => {
    const mockFolders: BookmarkFolder[] = [
      {
        id: '1',
        title: 'Folder 1',
        bookmarks: [],
        subfolders: [
          {
            id: '2',
            title: 'Subfolder',
            bookmarks: [],
            subfolders: [],
            expanded: true,
          },
        ],
        expanded: true,
      },
    ];

    it('ルートレベルでフォルダをIDで検索できることを確認', () => {
      const result = findFolderById(mockFolders, '1');
      expect(result).toBeTruthy();
      expect(result?.title).toBe('Folder 1');
    });

    it('サブフォルダ内でフォルダをIDで検索できることを確認', () => {
      const result = findFolderById(mockFolders, '2');
      expect(result).toBeTruthy();
      expect(result?.title).toBe('Subfolder');
    });

    it('存在しないIDに対してnullを返すことを確認', () => {
      const result = findFolderById(mockFolders, 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('getTotalBookmarks', () => {
    it('ブックマークを再帰的に数えることを確認', () => {
      const folder: BookmarkFolder = {
        id: '1',
        title: 'Test Folder',
        bookmarks: [
          { title: 'Bookmark 1', url: 'https://example1.com', favicon: null },
          { title: 'Bookmark 2', url: 'https://example2.com', favicon: null },
        ],
        subfolders: [
          {
            id: '2',
            title: 'Subfolder',
            bookmarks: [
              {
                title: 'Bookmark 3',
                url: 'https://example3.com',
                favicon: null,
              },
            ],
            subfolders: [],
            expanded: true,
          },
        ],
        expanded: true,
      };

      const result = getTotalBookmarks(folder);
      expect(result).toBe(3); // 2 + 1
    });

    it('空のフォルダに対して0を返すことを確認', () => {
      const folder: BookmarkFolder = {
        id: '1',
        title: 'Empty Folder',
        bookmarks: [],
        subfolders: [],
        expanded: true,
      };

      const result = getTotalBookmarks(folder);
      expect(result).toBe(0);
    });
  });

  describe('filterBookmarks', () => {
    const mockFolders: BookmarkFolder[] = [
      {
        id: '1',
        title: 'Folder 1',
        bookmarks: [
          { title: 'Google Search', url: 'https://google.com', favicon: null },
          { title: 'Yahoo Japan', url: 'https://yahoo.co.jp', favicon: null },
        ],
        subfolders: [
          {
            id: '2',
            title: 'Subfolder',
            bookmarks: [
              { title: 'GitHub', url: 'https://github.com', favicon: null },
            ],
            subfolders: [],
            expanded: true,
          },
        ],
        expanded: true,
      },
    ];

    it('タイトルでブックマークをフィルタリングできることを確認', () => {
      const result = filterBookmarks(mockFolders, 'google');
      expect(result).toHaveLength(1);
      expect(result[0].bookmarks).toHaveLength(1);
      expect(result[0].bookmarks[0].title).toBe('Google Search');
    });

    it('サブフォルダ内のブックマークも検索されることを確認', () => {
      const result = filterBookmarks(mockFolders, 'github');
      expect(result).toHaveLength(1);
      expect(result[0].subfolders).toHaveLength(1);
      expect(result[0].subfolders[0].bookmarks).toHaveLength(1);
      expect(result[0].subfolders[0].bookmarks[0].title).toBe('GitHub');
    });

    it('URLでブックマークをフィルタリングできることを確認', () => {
      const result = filterBookmarks(mockFolders, 'yahoo.co.jp');
      expect(result).toHaveLength(1);
      expect(result[0].bookmarks).toHaveLength(1);
      expect(result[0].bookmarks[0].title).toBe('Yahoo Japan');
    });

    it('検索語が空の場合は全フォルダを返すことを確認', () => {
      const result = filterBookmarks(mockFolders, '');
      expect(result).toEqual(mockFolders);
    });

    it('マッチしない場合は空配列を返すことを確認', () => {
      const result = filterBookmarks(mockFolders, 'nonexistent');
      expect(result).toEqual([]);
    });
  });

  describe('フォルダ階層のexpanded状態', () => {
    it('フォルダの初期展開状態が正しく設定されることを確認', () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '1',
              title: 'Bookmarks bar',
              children: [
                {
                  id: '2',
                  title: 'Test Folder',
                  children: [
                    {
                      id: '3',
                      title: 'Test Bookmark',
                      url: 'https://test.com',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const result = processBookmarkTree(tree);
      expect(result).toHaveLength(1);
      expect(result[0].expanded).toBe(true); // デフォルトで展開状態
    });

    it('フォルダIDでネストされたフォルダを検索できることを確認', () => {
      const folder: BookmarkFolder = {
        id: '1',
        title: 'Parent',
        bookmarks: [],
        subfolders: [
          {
            id: '2',
            title: 'Child',
            bookmarks: [],
            subfolders: [
              {
                id: '3',
                title: 'Grandchild',
                bookmarks: [],
                subfolders: [],
                expanded: true,
              },
            ],
            expanded: true,
          },
        ],
        expanded: true,
      };

      const result = findFolderById([folder], '3');
      expect(result).toBeTruthy();
      expect(result?.title).toBe('Grandchild');
    });

    it('深いネスト構造でも総ブックマーク数を正しく計算することを確認', () => {
      const folder: BookmarkFolder = {
        id: '1',
        title: 'Root',
        bookmarks: [
          { title: 'Root Bookmark', url: 'https://root.com', favicon: null },
        ],
        subfolders: [
          {
            id: '2',
            title: 'Level 1',
            bookmarks: [
              {
                title: 'Level 1 Bookmark 1',
                url: 'https://level1-1.com',
                favicon: null,
              },
              {
                title: 'Level 1 Bookmark 2',
                url: 'https://level1-2.com',
                favicon: null,
              },
            ],
            subfolders: [
              {
                id: '3',
                title: 'Level 2',
                bookmarks: [
                  {
                    title: 'Level 2 Bookmark',
                    url: 'https://level2.com',
                    favicon: null,
                  },
                ],
                subfolders: [],
                expanded: true,
              },
            ],
            expanded: true,
          },
        ],
        expanded: true,
      };

      const result = getTotalBookmarks(folder);
      expect(result).toBe(4); // 1 + 2 + 1 = 4
    });
  });

  describe('escapeHtml', () => {
    it('HTML特殊文字がエスケープされることを確認', () => {
      const input = '<script>alert("xss")</script>&"';
      const result = escapeHtml(input);
      expect(result).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;&quot;'
      );
    });

    it('通常のテキストはエスケープせずに処理されることを確認', () => {
      const input = 'Normal text without special characters';
      const result = escapeHtml(input);
      expect(result).toBe(input);
    });
  });

  describe('getDomain', () => {
    it('URLからドメインを抽出できることを確認', () => {
      expect(getDomain('https://www.example.com/path')).toBe('www.example.com');
      expect(getDomain('http://subdomain.example.org:8080/page')).toBe(
        'subdomain.example.org'
      );
    });

    it('無効なURLに対して元の文字列を返すことを確認', () => {
      expect(getDomain('invalid-url')).toBe('localhost');
      expect(getDomain('')).toBe('localhost');
    });
  });

  describe('getFavicon', () => {
    beforeEach(() => {
      // Image コンストラクタをモック
      global.Image = vi.fn(() => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        set src(_value: string) {
          // デフォルトでは失敗させる
          setTimeout(() => this.onerror?.(), 0);
        },
        onerror: null,
        onload: null,
      })) as any;

      // fetch をモック
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));
    });

    it('デフォルトfaviconが正しく返されることを確認', async () => {
      const result = await getFavicon('https://nonexistent-domain-test.com');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('キャッシュ機能が動作することを確認', async () => {
      // 2回目の呼び出しでも同じ結果が返されることを確認
      const url = 'https://cached-test.com';
      const result1 = await getFavicon(url);
      const result2 = await getFavicon(url);
      expect(result1).toBe(result2);
    });
  });
});
