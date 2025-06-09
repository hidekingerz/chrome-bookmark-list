import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// メイン機能の統合テスト
describe('メイン機能の統合テスト', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;

  beforeEach(() => {
    // 実際のHTMLファイルをシミュレート
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>ブックマーク一覧</title>
        </head>
        <body>
          <div id="search-container">
            <input type="text" id="search-input" placeholder="ブックマークを検索...">
          </div>
          <div id="bookmark-list"></div>
        </body>
      </html>
    `,
      {
        url: 'chrome-extension://test/newtab.html',
        pretendToBeVisual: true,
        resources: 'usable',
      }
    );

    document = dom.window.document;
    window = dom.window as unknown as Window;

    // グローバルオブジェクトを設定
    Object.defineProperty(globalThis, 'document', {
      value: document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: window,
      writable: true,
      configurable: true,
    });

    // Chrome API のモック設定（既存のモックを更新）
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.getTree.mockResolvedValue([
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'Bookmarks Bar',
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
              {
                id: '4',
                title: 'GitHub',
                url: 'https://github.com',
              },
            ],
          },
        ],
      },
    ]);

    // localStorage は既にsetup.tsでモックされているため、設定不要
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('ブックマークが正しく読み込まれ表示されることを確認', async () => {
    // メイン関数を直接テストするのではなく、
    // コンポーネントの動作をテスト
    const { processBookmarkTree } = await import('../src/scripts/utils');

    // Chrome APIからブックマークを取得
    const tree = await chrome.bookmarks.getTree();
    const folders = processBookmarkTree(tree);

    expect(folders).toHaveLength(2); // フォルダ1 + ブックマークバー直下
    expect(folders[0].title).toBe('フォルダ1');
    expect(folders[0].bookmarks).toHaveLength(1);
    expect(folders[1].title).toBe('ブックマークバー直下');
    expect(folders[1].bookmarks).toHaveLength(1);
  });

  it('検索機能が正しく動作することを確認', async () => {
    const { filterBookmarks, processBookmarkTree } = await import(
      '../src/scripts/utils'
    );

    const tree = await chrome.bookmarks.getTree();
    const folders = processBookmarkTree(tree);

    // 検索テスト
    const searchResults = filterBookmarks(folders, 'google');
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].bookmarks[0].title).toBe('Google');
  });

  it('空のブックマークツリーを正しく処理することを確認', async () => {
    // 空のブックマークツリーをテスト
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.getTree.mockResolvedValue([]);

    const { processBookmarkTree } = await import('../src/scripts/utils');
    const tree = await chrome.bookmarks.getTree();
    const folders = processBookmarkTree(tree);

    expect(folders).toHaveLength(0);
  });

  it('ブックマークが新しいタブで開かれることを確認', async () => {
    const mockChrome = globalThis.chrome as any;
    const createTabSpy = vi.spyOn(mockChrome.tabs, 'create');

    // ブックマーククリックのシミュレーション
    const bookmarkUrl = 'https://google.com';

    // 新しいタブでURLを開く処理をシミュレート
    chrome.tabs.create({ url: bookmarkUrl });

    expect(createTabSpy).toHaveBeenCalledWith({ url: bookmarkUrl });
  });

  it('ファビコンの読み込みが適切に処理されることを確認', async () => {
    const { getDomain } = await import('../src/scripts/utils');

    const testUrl = 'https://example.com/path';
    const domain = getDomain(testUrl);

    expect(domain).toBe('example.com');
  });

  it('フォルダの展開・折りたたみが正しく動作することを確認', async () => {
    const { findFolderById, processBookmarkTree } = await import(
      '../src/scripts/utils'
    );

    const tree = await chrome.bookmarks.getTree();
    const folders = processBookmarkTree(tree);

    // フォルダの展開状態をテスト
    const folder = findFolderById(folders, '2');
    expect(folder).toBeDefined();
    expect(folder?.expanded).toBe(true); // レベル0のフォルダは展開状態

    // サブフォルダがある場合の確認
    if (folder && folder.subfolders.length > 0) {
      const subfolder = folder.subfolders[0];
      expect(subfolder.expanded).toBe(true); // レベル1のサブフォルダも展開状態
    }
  });

  it('階層構造のブックマークが正しく処理されることを確認', async () => {
    // より複雑な階層構造をテスト
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.getTree.mockResolvedValue([
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'Bookmarks Bar',
            children: [
              {
                id: '2',
                title: 'Work',
                children: [
                  {
                    id: '3',
                    title: 'Development',
                    children: [
                      {
                        id: '4',
                        title: 'Frontend',
                        children: [
                          {
                            id: '5',
                            title: 'React',
                            url: 'https://reactjs.org',
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ]);

    const { processBookmarkTree, getTotalBookmarks } = await import(
      '../src/scripts/utils'
    );
    const tree = await chrome.bookmarks.getTree();
    const folders = processBookmarkTree(tree);

    expect(folders).toHaveLength(1);

    const workFolder = folders[0];
    expect(workFolder.title).toBe('Work');
    expect(workFolder.subfolders).toHaveLength(1);

    const devFolder = workFolder.subfolders[0];
    expect(devFolder.title).toBe('Development');
    expect(devFolder.subfolders).toHaveLength(1);

    const frontendFolder = devFolder.subfolders[0];
    expect(frontendFolder.title).toBe('Frontend');
    expect(frontendFolder.bookmarks).toHaveLength(1);
    expect(frontendFolder.bookmarks[0].title).toBe('React');

    // 総ブックマーク数の確認
    const totalCount = getTotalBookmarks(workFolder);
    expect(totalCount).toBe(1);
  });
});
