import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkService } from '../src/services/BookmarkService.js';
import type { ChromeBookmarkNode } from '../src/types/bookmark.js';

describe('BookmarkService', () => {
  let service: BookmarkService;

  beforeEach(() => {
    service = new BookmarkService();
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getBookmarkTree', () => {
    it('Chrome API のツリーを内部形式へ変換して返す', async () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '2',
              title: 'Other bookmarks',
              children: [
                { id: '5', title: 'Example', url: 'https://example.com' },
              ],
            },
          ],
        },
      ];
      (chrome.bookmarks.getTree as ReturnType<typeof vi.fn>).mockResolvedValue(
        tree
      );

      const result = await service.getBookmarkTree();

      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Other bookmarks');
      expect(result[0].bookmarks).toEqual([
        {
          id: '5',
          title: 'Example',
          url: 'https://example.com',
          favicon: null,
        },
      ]);
    });

    it('取得に失敗した場合は専用エラーを投げる', async () => {
      (chrome.bookmarks.getTree as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom')
      );

      await expect(service.getBookmarkTree()).rejects.toThrow(
        'ブックマークの取得に失敗しました'
      );
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('processBookmarkTree', () => {
    it('ブックマークバー直下のルートブックマークを専用フォルダとして先頭に追加し、サブフォルダも展開する', () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '1',
              title: 'Bookmarks bar',
              children: [
                { id: '10', title: 'Root Link', url: 'https://root.example' },
                {
                  id: '11',
                  title: 'Sub',
                  children: [
                    { id: '12', title: 'Child', url: 'https://child.example' },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const folders = service.processBookmarkTree(tree);

      // 先頭はルートブックマーク用の「ブックマークバー」フォルダ
      expect(folders[0].title).toBe('ブックマークバー');
      expect(folders[0].id).toBe('1');
      expect(folders[0].bookmarks).toEqual([
        {
          id: '10',
          title: 'Root Link',
          url: 'https://root.example',
          favicon: null,
        },
      ]);
      // サブフォルダはその後ろに展開される
      expect(folders[1].title).toBe('Sub');
      expect(folders[1].bookmarks[0].url).toBe('https://child.example');
    });

    it('ブックマークバーにルートブックマークが無い場合は専用フォルダを作らない', () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '1',
              title: 'ブックマーク バー',
              children: [
                {
                  id: '11',
                  title: 'OnlySub',
                  children: [
                    { id: '12', title: 'C', url: 'https://c.example' },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const folders = service.processBookmarkTree(tree);

      expect(folders).toHaveLength(1);
      expect(folders[0].title).toBe('OnlySub');
      expect(folders.some((f) => f.title === 'ブックマークバー')).toBe(false);
    });

    it('Mobile bookmarks は無視し、その他のフォルダは直接追加する', () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '3',
              title: 'Mobile bookmarks',
              children: [
                { id: '30', title: 'Mob', url: 'https://mobile.example' },
              ],
            },
            {
              id: '2',
              title: 'Other bookmarks',
              children: [
                { id: '20', title: 'Other', url: 'https://other.example' },
              ],
            },
          ],
        },
      ];

      const folders = service.processBookmarkTree(tree);

      expect(folders).toHaveLength(1);
      expect(folders[0].title).toBe('Other bookmarks');
      expect(folders.some((f) => f.title === 'Mobile bookmarks')).toBe(false);
    });

    it('children を持たないルート要素は無視する', () => {
      const tree: ChromeBookmarkNode[] = [{ id: '0', title: '' }];
      expect(service.processBookmarkTree(tree)).toEqual([]);
    });

    it('title が無いフォルダは Untitled になる', () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '2',
              title: '',
              children: [
                {
                  id: '21',
                  title: '',
                  children: [
                    { id: '22', title: 'X', url: 'https://x.example' },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const folders = service.processBookmarkTree(tree);
      expect(folders[0].title).toBe('Untitled');
    });
  });

  // #103: ルート判定はロケール依存のタイトル比較ではなく Chrome の
  // パーマネントルート ID(1=バー / 2=その他 / 3=モバイル)で行う。
  describe('ロケール非依存のルート判定 (#103)', () => {
    it('日本語ロケールのモバイルフォルダ「モバイルのブックマーク」(id=3) を除外する', () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '3',
              title: 'モバイルのブックマーク',
              children: [
                { id: '30', title: 'Mob', url: 'https://mobile.example' },
              ],
            },
            {
              id: '2',
              title: 'その他のブックマーク',
              children: [
                { id: '20', title: 'Other', url: 'https://other.example' },
              ],
            },
          ],
        },
      ];

      const folders = service.processBookmarkTree(tree);

      // モバイル(id=3)はタイトルが英語名でなくても除外される
      expect(folders.some((f) => f.id === '3')).toBe(false);
      expect(folders.some((f) => f.title === 'モバイルのブックマーク')).toBe(
        false
      );
      // その他(id=2)は残る
      expect(folders).toHaveLength(1);
      expect(folders[0].id).toBe('2');
    });

    it('非英日ロケールのブックマークバー(id=1) でも平坦化処理が発動する', () => {
      const tree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              // スペイン語ロケールのブックマークバー
              id: '1',
              title: 'Barra de marcadores',
              children: [
                { id: '10', title: 'Root Link', url: 'https://root.example' },
                {
                  id: '11',
                  title: 'Sub',
                  children: [
                    { id: '12', title: 'Child', url: 'https://child.example' },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const folders = service.processBookmarkTree(tree);

      // 先頭にルートブックマーク用「ブックマークバー」フォルダが平坦化される
      expect(folders[0].title).toBe('ブックマークバー');
      expect(folders[0].id).toBe('1');
      expect(folders[0].bookmarks).toEqual([
        {
          id: '10',
          title: 'Root Link',
          url: 'https://root.example',
          favicon: null,
        },
      ]);
      // サブフォルダは平坦化されて続く
      expect(folders[1].title).toBe('Sub');
      // ローカライズ名のフォルダがそのまま残っていない
      expect(folders.some((f) => f.title === 'Barra de marcadores')).toBe(
        false
      );
    });
  });

  describe('findFolderById', () => {
    const folders = [
      {
        id: 'a',
        title: 'A',
        bookmarks: [],
        subfolders: [
          {
            id: 'b',
            title: 'B',
            bookmarks: [],
            subfolders: [],
            expanded: true,
          },
        ],
        expanded: true,
      },
    ];

    it('ネストしたサブフォルダを再帰的に探索する', () => {
      expect(service.findFolderById(folders, 'b')?.title).toBe('B');
    });

    it('該当 ID が無ければ null を返す', () => {
      expect(service.findFolderById(folders, 'zzz')).toBeNull();
    });
  });

  describe('getTotalBookmarks', () => {
    it('サブフォルダを含めた総数を再帰的に数える', () => {
      const folder = {
        id: 'a',
        title: 'A',
        bookmarks: [
          { title: 't1', url: 'u1', favicon: null },
          { title: 't2', url: 'u2', favicon: null },
        ],
        subfolders: [
          {
            id: 'b',
            title: 'B',
            bookmarks: [{ title: 't3', url: 'u3', favicon: null }],
            subfolders: [],
            expanded: true,
          },
        ],
        expanded: true,
      };
      expect(service.getTotalBookmarks(folder)).toBe(3);
    });
  });

  describe('filterBookmarks', () => {
    const folders = [
      {
        id: 'a',
        title: 'A',
        bookmarks: [
          { title: 'GitHub', url: 'https://github.com', favicon: null },
          { title: 'Google', url: 'https://google.com', favicon: null },
        ],
        subfolders: [
          {
            id: 'b',
            title: 'B',
            bookmarks: [
              { title: 'Example', url: 'https://example.com', favicon: null },
            ],
            subfolders: [],
            expanded: false,
          },
        ],
        expanded: false,
      },
    ];

    it('空の検索語ではそのまま返す', () => {
      expect(service.filterBookmarks(folders, '   ')).toBe(folders);
    });

    it('タイトル一致でフィルタし、検索時は展開状態にする', () => {
      const result = service.filterBookmarks(folders, 'github');
      expect(result).toHaveLength(1);
      expect(result[0].bookmarks).toHaveLength(1);
      expect(result[0].bookmarks[0].title).toBe('GitHub');
      expect(result[0].expanded).toBe(true);
    });

    it('サブフォルダ内 URL 一致のみでも親フォルダごと含める', () => {
      const result = service.filterBookmarks(folders, 'example.com');
      expect(result).toHaveLength(1);
      expect(result[0].bookmarks).toHaveLength(0);
      expect(result[0].subfolders[0].bookmarks[0].title).toBe('Example');
    });

    it('一致が無いフォルダは除外する', () => {
      expect(service.filterBookmarks(folders, 'nomatch')).toEqual([]);
    });
  });

  describe('moveBookmark', () => {
    it('検索した先頭ブックマークを対象フォルダへ移動する', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '99', title: 'B', url: 'https://b.example' },
      ]);
      (chrome.bookmarks.move as ReturnType<typeof vi.fn>).mockResolvedValue({});

      await service.moveBookmark('https://b.example', 'folder-1');

      expect(chrome.bookmarks.search).toHaveBeenCalledWith({
        url: 'https://b.example',
      });
      expect(chrome.bookmarks.move).toHaveBeenCalledWith('99', {
        parentId: 'folder-1',
      });
    });

    it('対象が見つからない場合はエラーを投げ、move は呼ばない', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        []
      );

      await expect(
        service.moveBookmark('https://missing', 'folder-1')
      ).rejects.toThrow('移動するブックマークが見つかりません');
      expect(chrome.bookmarks.move).not.toHaveBeenCalled();
    });

    it('move が失敗した場合はそのまま再スローする', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '99', title: 'B', url: 'https://b.example' },
      ]);
      (chrome.bookmarks.move as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('move failed')
      );

      await expect(
        service.moveBookmark('https://b.example', 'folder-1')
      ).rejects.toThrow('move failed');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('updateBookmark', () => {
    it('検索した先頭ブックマークのタイトルと URL を更新する', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '7', title: 'Old', url: 'https://old.example' },
      ]);
      (chrome.bookmarks.update as ReturnType<typeof vi.fn>).mockResolvedValue(
        {}
      );

      await service.updateBookmark(
        'https://old.example',
        'New',
        'https://new.example'
      );

      expect(chrome.bookmarks.update).toHaveBeenCalledWith('7', {
        title: 'New',
        url: 'https://new.example',
      });
    });

    it('対象が見つからない場合はエラーを投げ、update は呼ばない', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        []
      );

      await expect(
        service.updateBookmark('https://missing', 'N', 'https://n')
      ).rejects.toThrow('更新するブックマークが見つかりません');
      expect(chrome.bookmarks.update).not.toHaveBeenCalled();
    });

    it('update が失敗した場合はそのまま再スローする', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '7', title: 'Old', url: 'https://old.example' },
      ]);
      (chrome.bookmarks.update as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('update failed')
      );

      await expect(
        service.updateBookmark('https://old.example', 'N', 'https://n')
      ).rejects.toThrow('update failed');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('deleteBookmark', () => {
    it('検索した先頭ブックマークを削除する', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '42', title: 'Del', url: 'https://del.example' },
      ]);
      (chrome.bookmarks.remove as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined
      );

      await service.deleteBookmark('https://del.example');

      expect(chrome.bookmarks.remove).toHaveBeenCalledWith('42');
    });

    it('対象が見つからない場合はエラーを投げ、remove は呼ばない', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue(
        []
      );

      await expect(service.deleteBookmark('https://missing')).rejects.toThrow(
        '削除するブックマークが見つかりません'
      );
      expect(chrome.bookmarks.remove).not.toHaveBeenCalled();
    });

    it('remove が失敗した場合はそのまま再スローする', async () => {
      (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: '42', title: 'Del', url: 'https://del.example' },
      ]);
      (chrome.bookmarks.remove as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('remove failed')
      );

      await expect(
        service.deleteBookmark('https://del.example')
      ).rejects.toThrow('remove failed');
      expect(console.error).toHaveBeenCalled();
    });
  });

  describe('展開状態の引き継ぎ (#104)', () => {
    const tree: ChromeBookmarkNode[] = [
      {
        id: '0',
        title: '',
        children: [
          {
            id: '2',
            title: 'Other bookmarks',
            children: [
              {
                id: '100',
                title: 'FolderA',
                children: [{ id: '101', title: 'a', url: 'https://a.example' }],
              },
              {
                id: '200',
                title: 'FolderB',
                children: [{ id: '201', title: 'b', url: 'https://b.example' }],
              },
            ],
          },
        ],
      },
    ];

    it('再描画で作り直しても以前の折りたたみ状態を保持し、他フォルダは展開のまま', () => {
      const first = service.processBookmarkTree(tree);
      // ユーザーが FolderB を折りたたむ
      for (const folder of first[0].subfolders) {
        if (folder.id === '200') {
          folder.expanded = false;
        }
      }

      // 再描画: 同じツリーから作り直すと全て expanded=true にリセットされる
      const reloaded = service.processBookmarkTree(tree);
      expect(reloaded[0].subfolders.find((f) => f.id === '200')?.expanded).toBe(
        true
      );

      // 展開状態を引き継ぐと、折りたたみが保持される
      service.applyExpandedState(reloaded, first);

      expect(reloaded[0].subfolders.find((f) => f.id === '200')?.expanded).toBe(
        false
      );
      // 折りたたんでいないフォルダ・親は展開のまま
      expect(reloaded[0].subfolders.find((f) => f.id === '100')?.expanded).toBe(
        true
      );
      expect(reloaded[0].expanded).toBe(true);
    });

    it('新しく追加されたフォルダはデフォルトで展開のまま', () => {
      const first = service.processBookmarkTree(tree);
      // 親 (Other bookmarks) を折りたたむ
      first[0].expanded = false;

      // FolderC を追加したツリーで再描画
      const treeWithNew: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: '',
          children: [
            {
              id: '2',
              title: 'Other bookmarks',
              children: [
                {
                  id: '100',
                  title: 'FolderA',
                  children: [
                    { id: '101', title: 'a', url: 'https://a.example' },
                  ],
                },
                {
                  id: '200',
                  title: 'FolderB',
                  children: [
                    { id: '201', title: 'b', url: 'https://b.example' },
                  ],
                },
                {
                  id: '300',
                  title: 'FolderC',
                  children: [
                    { id: '301', title: 'c', url: 'https://c.example' },
                  ],
                },
              ],
            },
          ],
        },
      ];

      const reloaded = service.processBookmarkTree(treeWithNew);
      service.applyExpandedState(reloaded, first);

      // 既存の親は折りたたみ復元、新規 FolderC はデフォルト展開
      expect(reloaded[0].expanded).toBe(false);
      expect(reloaded[0].subfolders.find((f) => f.id === '300')?.expanded).toBe(
        true
      );
    });
  });
});
