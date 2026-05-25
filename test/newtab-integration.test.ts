import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from '../src/components/HistoryPanel/HistoryPanel';
import { getRecentHistory } from '../src/scripts/history';
import {
  renderFolder,
  setupFolderClickHandler,
} from '../src/scripts/newtab-core';
import type { BookmarkFolder, ChromeBookmarkNode } from '../src/scripts/types';
import { findFolderById, processBookmarkTree } from '../src/scripts/utils';

// モック
vi.mock('../src/scripts/history');
vi.mock('../src/scripts/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/scripts/utils')>();
  return {
    ...actual,
    getFavicon: vi.fn().mockResolvedValue('data:image/png;base64,test'),
  };
});

const mockGetRecentHistory = vi.mocked(getRecentHistory);

describe('実際のフォルダクリック機能の統合テスト', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;
  let allBookmarks: BookmarkFolder[];

  // モックデータ
  const mockBookmarkTree: ChromeBookmarkNode[] = [
    {
      id: '0',
      title: 'root',
      children: [
        {
          id: '1',
          title: 'ブックマーク バー',
          children: [
            {
              id: '2',
              title: '開発フォルダ',
              children: [
                {
                  id: '3',
                  title: 'GitHub',
                  url: 'https://github.com',
                },
                {
                  id: '4',
                  title: 'サブフォルダ',
                  children: [
                    {
                      id: '5',
                      title: 'Stack Overflow',
                      url: 'https://stackoverflow.com',
                    },
                    {
                      id: '6',
                      title: '深いネストフォルダ',
                      children: [
                        {
                          id: '7',
                          title: 'MDN',
                          url: 'https://developer.mozilla.org',
                        },
                        {
                          id: '8',
                          title: 'さらに深いフォルダ',
                          children: [
                            {
                              id: '9',
                              title: 'Deep Resource',
                              url: 'https://example.com',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
            {
              id: '10',
              title: 'ニュース',
              children: [
                {
                  id: '11',
                  title: 'Google News',
                  url: 'https://news.google.com',
                },
              ],
            },
          ],
        },
      ],
    },
  ];

  beforeEach(() => {
    // DOM環境を設定
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>ブックマーク一覧</title>
          <style>
            .subfolders-container.collapsed {
              max-height: 0 !important;
              opacity: 0 !important;
              visibility: hidden !important;
              display: none !important;
            }
            .subfolders-container.expanded {
              max-height: none !important;
              opacity: 1 !important;
              visibility: visible !important;
              display: block !important;
            }
          </style>
        </head>
        <body>
          <header>
            <h1>📚 Bookmarks</h1>
            <div class="search-container">
              <input type="text" id="searchInput" placeholder="ブックマークを検索...">
            </div>
          </header>
          <div id="bookmarkContainer" class="bookmark-container"></div>
          <section id="tab-panel-history"></section>
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
    Object.defineProperty(globalThis, 'Event', {
      value: dom.window.Event,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'MouseEvent', {
      value: dom.window.MouseEvent,
      writable: true,
      configurable: true,
    });

    // Chrome API のモック設定
    const mockChrome = {
      bookmarks: {
        getTree: vi.fn().mockResolvedValue(mockBookmarkTree),
      },
      tabs: {
        create: vi.fn(),
      },
      history: {
        search: vi.fn(),
      },
    };

    // Chrome オブジェクトを条件付きで設定
    if (!('chrome' in globalThis)) {
      Object.defineProperty(globalThis, 'chrome', {
        value: mockChrome,
        writable: true,
        configurable: true,
      });
    } else {
      // 既存のchromeオブジェクトを更新
      Object.assign((globalThis as any).chrome, mockChrome);
    }

    // ブックマークデータを処理
    allBookmarks = processBookmarkTree(mockBookmarkTree);

    // モックのデフォルト設定
    mockGetRecentHistory.mockResolvedValue([]);
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
    // モックをリセット
    vi.resetAllMocks();
  });

  describe('履歴パネル統合テスト', () => {
    const getHistoryContainer = () =>
      document.getElementById('tab-panel-history') as HTMLElement;

    it('履歴パネルがコンテナ内に正しく初期化される', () => {
      new HistoryPanel(getHistoryContainer());

      const container = getHistoryContainer();
      expect(container.classList.contains('history-panel')).toBe(true);
      expect(container.querySelector('.history-search-input')).toBeTruthy();
      expect(container.querySelector('.history-panel-content')).toBeTruthy();
    });

    it('履歴パネルのactivateがブックマーク表示に影響しない', async () => {
      const historyPanel = new HistoryPanel(getHistoryContainer());
      const bookmarkContainer = document.getElementById('bookmarkContainer')!;

      // ブックマークをレンダリング
      const html = allBookmarks.map((folder) => renderFolder(folder)).join('');
      bookmarkContainer.innerHTML = html;
      setupFolderClickHandler(bookmarkContainer, allBookmarks);

      const initialBookmarks =
        bookmarkContainer.querySelectorAll('.bookmark-item').length;
      expect(initialBookmarks).toBeGreaterThan(0);

      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          lastVisitTime: Date.now(),
          visitCount: 5,
          typedCount: 1,
        },
      ]);

      await historyPanel.activate();

      // 履歴を読み込んでもブックマークは変わらない
      const bookmarksAfter =
        bookmarkContainer.querySelectorAll('.bookmark-item').length;
      expect(bookmarksAfter).toBe(initialBookmarks);

      // 履歴アイテムが表示されている
      expect(
        getHistoryContainer().querySelectorAll('.history-item').length
      ).toBe(1);
    });

    it('ブックマーク検索と履歴パネルが独立して動作する', async () => {
      const historyPanel = new HistoryPanel(getHistoryContainer());
      const bookmarkContainer = document.getElementById('bookmarkContainer')!;
      const searchInput = document.getElementById(
        'searchInput'
      ) as HTMLInputElement;

      const html = allBookmarks.map((folder) => renderFolder(folder)).join('');
      bookmarkContainer.innerHTML = html;
      setupFolderClickHandler(bookmarkContainer, allBookmarks);

      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example',
          lastVisitTime: Date.now(),
          visitCount: 5,
          typedCount: 1,
        },
      ]);

      await historyPanel.activate();

      // ブックマーク検索を実行しても履歴アイテムには影響しない
      searchInput.value = 'GitHub';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(
        getHistoryContainer().querySelectorAll('.history-item').length
      ).toBe(1);
    });

    it('履歴読み込み失敗時のエラーハンドリング', async () => {
      const historyPanel = new HistoryPanel(getHistoryContainer());
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      mockGetRecentHistory.mockRejectedValue(new Error('History API Error'));

      await historyPanel.activate();

      const errorMessage =
        getHistoryContainer().querySelector('.history-error');
      expect(errorMessage?.textContent).toBe('履歴の読み込みに失敗しました');
      expect(consoleSpy).toHaveBeenCalledWith(
        '履歴の読み込みに失敗しました:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('履歴パネルの検索機能が動作する', async () => {
      const historyPanel = new HistoryPanel(getHistoryContainer());

      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://github.com',
          title: 'GitHub',
          lastVisitTime: Date.now(),
          visitCount: 5,
          typedCount: 1,
        },
        {
          id: '2',
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          lastVisitTime: Date.now() - 1000,
          visitCount: 3,
          typedCount: 0,
        },
      ]);

      await historyPanel.activate();

      const searchInput = getHistoryContainer().querySelector(
        '.history-search-input'
      ) as HTMLInputElement;
      expect(searchInput).toBeTruthy();
      expect(
        getHistoryContainer().querySelectorAll('.history-item').length
      ).toBe(2);

      searchInput.value = 'GitHub';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      const historyItems =
        getHistoryContainer().querySelectorAll('.history-item');
      expect(historyItems.length).toBe(1);
      expect(
        historyItems[0].querySelector('.history-item-title')?.textContent
      ).toBe('GitHub');
    });
  });

  // 実際のnewtab-core.tsから関数をインポートして使用

  it('完全な統合テスト: フォルダの展開・折りたたみが正常に動作する', async () => {
    const bookmarkContainer = document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;

    // 実際のレンダリング
    const html = allBookmarks.map((folder) => renderFolder(folder)).join('');
    bookmarkContainer.innerHTML = html;

    // 実際のイベントハンドラーを設定
    setupFolderClickHandler(bookmarkContainer, allBookmarks);

    // 初期状態の確認
    const parentFolder = allBookmarks.find((f) => f.title === '開発フォルダ');
    expect(parentFolder).toBeDefined();
    expect(parentFolder!.expanded).toBe(true); // 初期状態は展開

    // 親フォルダのDOM要素を取得
    const parentFolderElement = bookmarkContainer.querySelector(
      '[data-folder-id="2"]'
    ) as HTMLElement;
    expect(parentFolderElement).toBeDefined();

    const parentHeader = parentFolderElement.querySelector(
      '.folder-header'
    ) as HTMLElement;
    const parentSubfoldersContainer = parentFolderElement.querySelector(
      '.subfolders-container'
    ) as HTMLElement;

    expect(parentHeader).toBeDefined();
    expect(parentSubfoldersContainer).toBeDefined();

    // 初期状態: 展開されている
    expect(parentSubfoldersContainer.classList.contains('expanded')).toBe(true);
    expect(parentSubfoldersContainer.style.display).toBe('block');

    // 1. 親フォルダをクリックして折りたたむ
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    parentHeader.dispatchEvent(clickEvent);

    // 状態を確認
    expect(parentFolder!.expanded).toBe(false);
    expect(parentSubfoldersContainer.classList.contains('collapsed')).toBe(
      true
    );
    expect(parentSubfoldersContainer.classList.contains('expanded')).toBe(
      false
    );

    // 2. 再度クリックして展開
    parentHeader.dispatchEvent(clickEvent);

    expect(parentFolder!.expanded).toBe(true);
    expect(parentSubfoldersContainer.classList.contains('expanded')).toBe(true);
    expect(parentSubfoldersContainer.classList.contains('collapsed')).toBe(
      false
    );
    expect(parentSubfoldersContainer.style.display).toBe('block');
  });

  it('ネストしたサブフォルダのクリック機能をテスト', async () => {
    const bookmarkContainer = document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;

    // レンダリング
    const html = allBookmarks.map((folder) => renderFolder(folder)).join('');
    bookmarkContainer.innerHTML = html;

    // イベントハンドラーを設定
    setupFolderClickHandler(bookmarkContainer, allBookmarks);

    // サブフォルダを取得
    const subfolderElement = bookmarkContainer.querySelector(
      '[data-folder-id="4"]'
    ) as HTMLElement;
    expect(subfolderElement).toBeDefined();

    const subfolderHeader = subfolderElement.querySelector(
      '.folder-header'
    ) as HTMLElement;
    const subfolderContainer = subfolderElement.querySelector(
      '.subfolders-container'
    ) as HTMLElement;

    expect(subfolderHeader).toBeDefined();
    expect(subfolderContainer).toBeDefined();

    // サブフォルダの初期状態確認
    const subfolder = findFolderById(allBookmarks, '4');
    expect(subfolder).toBeDefined();
    expect(subfolder!.title).toBe('サブフォルダ');
    expect(subfolder!.expanded).toBe(true); // レベル1は初期展開

    // サブフォルダをクリックして折りたたむ
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    subfolderHeader.dispatchEvent(clickEvent);

    // 状態確認
    expect(subfolder!.expanded).toBe(false);
    expect(subfolderContainer.classList.contains('collapsed')).toBe(true);

    // 再度展開
    subfolderHeader.dispatchEvent(clickEvent);
    expect(subfolder!.expanded).toBe(true);
    expect(subfolderContainer.classList.contains('expanded')).toBe(true);
  });

  it('ブックマークリンククリックのテスト', async () => {
    const bookmarkContainer = document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;

    // レンダリング
    const html = allBookmarks.map((folder) => renderFolder(folder)).join('');
    bookmarkContainer.innerHTML = html;

    // イベントハンドラーを設定
    setupFolderClickHandler(bookmarkContainer, allBookmarks);

    // ブックマークリンクを取得
    const bookmarkLink = bookmarkContainer.querySelector(
      '.bookmark-link[data-url="https://github.com"]'
    ) as HTMLElement;
    expect(bookmarkLink).toBeDefined();

    // クリックイベントを発火
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    bookmarkLink.dispatchEvent(clickEvent);

    // Chrome API が呼ばれたことを確認
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://github.com',
    });
  });

  it('深くネストしたフォルダの操作テスト', async () => {
    const bookmarkContainer = document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;

    // レンダリング
    const html = allBookmarks.map((folder) => renderFolder(folder)).join('');
    bookmarkContainer.innerHTML = html;

    // イベントハンドラーを設定
    setupFolderClickHandler(bookmarkContainer, allBookmarks);

    // まず親フォルダとサブフォルダの状態を確認
    const parentFolder = findFolderById(allBookmarks, '2'); // 開発フォルダ
    const subFolder = findFolderById(allBookmarks, '4'); // サブフォルダ
    const deepFolder = findFolderById(allBookmarks, '6'); // 深いネストフォルダ

    expect(parentFolder).toBeDefined();
    expect(subFolder).toBeDefined();
    expect(deepFolder).toBeDefined();

    // 初期状態の確認
    expect(parentFolder!.expanded).toBe(true); // level 0は展開
    expect(subFolder!.expanded).toBe(true); // level 1は展開
    expect(deepFolder!.expanded).toBe(true); // すべての階層が初期展開

    // 深いネストフォルダのDOM要素を取得
    const deepFolderElement = bookmarkContainer.querySelector(
      '[data-folder-id="6"]'
    ) as HTMLElement;
    expect(deepFolderElement).toBeDefined();
    expect(deepFolder!.title).toBe('深いネストフォルダ');

    // クリックして折りたたみ（初期状態がtrueなので、クリックでfalseになる）
    const deepHeader = deepFolderElement.querySelector(
      '.folder-header'
    ) as HTMLElement;
    expect(deepHeader).toBeDefined();

    const clickEvent = new dom.window.Event('click', { bubbles: true });
    deepHeader.dispatchEvent(clickEvent);

    // 折りたたみ状態を確認
    expect(deepFolder!.expanded).toBe(false);

    const deepContainer = deepFolderElement.querySelector(
      '.subfolders-container'
    ) as HTMLElement;
    if (deepContainer) {
      expect(deepContainer.classList.contains('expanded')).toBe(false);
    }
  });

  it('フォルダが見つからない場合のエラーハンドリング', async () => {
    const bookmarkContainer = document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;

    // 存在しないフォルダIDのHTML要素を作成
    bookmarkContainer.innerHTML = `
      <div class="bookmark-folder" data-folder-id="nonexistent">
        <div class="folder-header has-subfolders">
          <div class="folder-info">
            <span class="expand-icon">📁</span>
            <h2 class="folder-title">存在しないフォルダ</h2>
          </div>
        </div>
      </div>
    `;

    // イベントハンドラーを設定
    setupFolderClickHandler(bookmarkContainer, allBookmarks);

    // 存在しないフォルダのヘッダーをクリック
    const header = bookmarkContainer.querySelector(
      '.folder-header'
    ) as HTMLElement;
    const clickEvent = new dom.window.Event('click', { bubbles: true });

    // エラーが発生せずに処理されることを確認
    expect(() => {
      header.dispatchEvent(clickEvent);
    }).not.toThrow();

    // Chrome APIが呼ばれていないことを確認
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('子フォルダをクリックすると親フォルダが折りたたまれる', async () => {
    const bookmarkContainer = document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;

    // レンダリング
    const html = allBookmarks.map((folder) => renderFolder(folder)).join('');
    bookmarkContainer.innerHTML = html;

    // イベントハンドラーを設定
    setupFolderClickHandler(bookmarkContainer, allBookmarks);

    // 親フォルダと子フォルダを取得
    const parentFolder = findFolderById(allBookmarks, '2'); // 開発フォルダ
    const childFolder = findFolderById(allBookmarks, '4'); // サブフォルダ（子フォルダ）

    expect(parentFolder).toBeTruthy();
    expect(childFolder).toBeTruthy();
    expect(parentFolder!.subfolders.length).toBeGreaterThan(0);
    expect(childFolder!.subfolders.length).toBeGreaterThan(0); // このフォルダもサブフォルダを持つ

    // 初期状態：親フォルダは展開、子フォルダも展開
    expect(parentFolder!.expanded).toBe(true);
    expect(childFolder!.expanded).toBe(true);

    // 親フォルダのサブフォルダコンテナが展開状態であることを確認
    const parentElement = bookmarkContainer.querySelector(
      '[data-folder-id="2"]'
    ) as HTMLElement;
    const parentSubfoldersContainer = parentElement.querySelector(
      '.subfolders-container'
    ) as HTMLElement;
    expect(parentSubfoldersContainer.classList.contains('expanded')).toBe(true);

    // 子フォルダ要素を取得（親のサブフォルダコンテナ内にある）
    const childElement = bookmarkContainer.querySelector(
      '[data-folder-id="4"]'
    ) as HTMLElement;
    const childHeader = childElement.querySelector(
      '.folder-header'
    ) as HTMLElement;

    expect(childElement).toBeTruthy();
    expect(childHeader).toBeTruthy();

    // 子フォルダのサブフォルダコンテナが展開状態であることを確認
    const childSubfoldersContainer = childElement.querySelector(
      '.subfolders-container'
    ) as HTMLElement;
    expect(childSubfoldersContainer.classList.contains('expanded')).toBe(true);

    // 子フォルダをクリック（サブフォルダがあるので通常の展開/折りたたみ動作）
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    childHeader.dispatchEvent(clickEvent);

    // 子フォルダ自体が折りたたまれることを確認
    expect(childFolder!.expanded).toBe(false);
    expect(childSubfoldersContainer.classList.contains('collapsed')).toBe(true);

    // 親フォルダの状態は変わらない
    expect(parentFolder!.expanded).toBe(true);
    expect(parentSubfoldersContainer.classList.contains('expanded')).toBe(true);
  });

  it('サブフォルダがない子フォルダをクリックするとブックマークリストが折りたたまれる', async () => {
    const bookmarkContainer = document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;

    // テスト用の特別なモックデータを作成（サブフォルダがない子フォルダ用）
    const testMockData: ChromeBookmarkNode[] = [
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'ブックマーク バー',
            children: [
              {
                id: 'parent',
                title: '親フォルダ',
                children: [
                  {
                    id: 'child-no-subs',
                    title: 'サブフォルダなし子フォルダ',
                    children: [
                      {
                        id: 'bookmark1',
                        title: 'Test Bookmark',
                        url: 'https://example.com',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const testBookmarks = processBookmarkTree(testMockData);

    // レンダリング
    const html = testBookmarks.map((folder) => renderFolder(folder)).join('');
    bookmarkContainer.innerHTML = html;

    // イベントハンドラーを設定
    setupFolderClickHandler(bookmarkContainer, testBookmarks);

    // 親フォルダと子フォルダを取得
    const parentFolder = findFolderById(testBookmarks, 'parent');
    const childFolder = findFolderById(testBookmarks, 'child-no-subs');

    expect(parentFolder).toBeTruthy();
    expect(childFolder).toBeTruthy();
    expect(parentFolder!.subfolders.length).toBe(1);
    expect(childFolder!.subfolders.length).toBe(0); // サブフォルダなし
    expect(childFolder!.bookmarks.length).toBe(1); // ブックマークあり

    // 初期状態：親フォルダは展開、子フォルダも展開（ブックマークリスト表示）
    parentFolder!.expanded = true;
    childFolder!.expanded = true;

    // 親フォルダのサブフォルダコンテナが展開状態であることを確認
    const parentElement = bookmarkContainer.querySelector(
      '[data-folder-id="parent"]'
    ) as HTMLElement;
    const parentSubfoldersContainer = parentElement.querySelector(
      '.subfolders-container'
    ) as HTMLElement;
    expect(parentSubfoldersContainer.classList.contains('expanded')).toBe(true);

    // 子フォルダ要素を取得
    const childElement = bookmarkContainer.querySelector(
      '[data-folder-id="child-no-subs"]'
    ) as HTMLElement;
    const childHeader = childElement.querySelector(
      '.folder-header'
    ) as HTMLElement;
    const bookmarkList = childElement.querySelector(
      '.bookmark-list'
    ) as HTMLElement;

    expect(childElement).toBeTruthy();
    expect(childHeader).toBeTruthy();
    expect(bookmarkList).toBeTruthy();

    // 初期状態：ブックマークリストが表示されている
    expect(bookmarkList.style.display).toBe('block');

    // 子フォルダをクリック（ブックマークリストが折りたたまれるはず）
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    childHeader.dispatchEvent(clickEvent);

    // 親フォルダの状態が変わらないことを確認
    expect(parentFolder!.expanded).toBe(true);
    expect(parentSubfoldersContainer.classList.contains('expanded')).toBe(true);

    // 子フォルダの展開状態が変更されることを確認
    expect(childFolder!.expanded).toBe(false);

    // ブックマークリストが非表示になることを確認
    expect(bookmarkList.style.display).toBe('none');
    expect(bookmarkList.classList.contains('collapsed')).toBe(true);

    // 子フォルダ自体は表示されたままであることを確認
    expect(childElement.style.display).not.toBe('none');
    expect(childElement).toBeTruthy();
    expect(childElement.parentNode).toBeTruthy(); // 要素がDOMツリーに存在している
  });

  it('親フォルダを折りたたむと、すべての子フォルダが非表示になる', async () => {
    const bookmarkContainer = document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;

    // テスト用のモックデータ（親フォルダに、サブフォルダありとサブフォルダなしの子フォルダを混在）
    const testMockData: ChromeBookmarkNode[] = [
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'ブックマーク バー',
            children: [
              {
                id: 'parent-mixed',
                title: '混在親フォルダ',
                children: [
                  {
                    id: 'child-with-subs',
                    title: 'サブフォルダあり子フォルダ',
                    children: [
                      {
                        id: 'grandchild',
                        title: '孫フォルダ',
                        children: [],
                      },
                    ],
                  },
                  {
                    id: 'child-no-subs',
                    title: 'サブフォルダなし子フォルダ',
                    children: [
                      {
                        id: 'bookmark1',
                        title: 'Test Bookmark',
                        url: 'https://example.com',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const testBookmarks = processBookmarkTree(testMockData);

    // レンダリング
    const html = testBookmarks.map((folder) => renderFolder(folder)).join('');
    bookmarkContainer.innerHTML = html;

    // イベントハンドラーを設定
    setupFolderClickHandler(bookmarkContainer, testBookmarks);

    // フォルダを取得
    const parentFolder = findFolderById(testBookmarks, 'parent-mixed');
    const childWithSubs = findFolderById(testBookmarks, 'child-with-subs');
    const childNoSubs = findFolderById(testBookmarks, 'child-no-subs');

    expect(parentFolder).toBeTruthy();
    expect(childWithSubs).toBeTruthy();
    expect(childNoSubs).toBeTruthy();

    // 初期状態：親フォルダは展開
    parentFolder!.expanded = true;
    childWithSubs!.expanded = true;

    // DOM要素を取得
    const parentElement = bookmarkContainer.querySelector(
      '[data-folder-id="parent-mixed"]'
    ) as HTMLElement;
    const parentHeader = parentElement.querySelector(
      '.folder-header'
    ) as HTMLElement;
    const parentSubfoldersContainer = parentElement.querySelector(
      '.subfolders-container'
    ) as HTMLElement;

    const childWithSubsElement = bookmarkContainer.querySelector(
      '[data-folder-id="child-with-subs"]'
    ) as HTMLElement;
    const childNoSubsElement = bookmarkContainer.querySelector(
      '[data-folder-id="child-no-subs"]'
    ) as HTMLElement;

    expect(parentElement).toBeTruthy();
    expect(childWithSubsElement).toBeTruthy();
    expect(childNoSubsElement).toBeTruthy();

    // 初期状態確認：すべて表示されている
    expect(parentSubfoldersContainer.classList.contains('expanded')).toBe(true);
    expect(childWithSubsElement.style.display).not.toBe('none');
    expect(childNoSubsElement.style.display).not.toBe('none');

    // 親フォルダをクリックして折りたたむ
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    parentHeader.dispatchEvent(clickEvent);

    // 親フォルダが折りたたまれることを確認
    expect(parentFolder!.expanded).toBe(false);
    expect(parentSubfoldersContainer.classList.contains('collapsed')).toBe(
      true
    );

    // アニメーション完了を待つ
    await new Promise((resolve) => setTimeout(resolve, 350));

    // 新しい動作の確認：
    // - すべての子フォルダが非表示になる
    // - サブフォルダコンテナも非表示になる
    expect(parentSubfoldersContainer.style.display).toBe('none'); // コンテナも非表示
    expect(childNoSubsElement.style.display).toBe('none'); // サブフォルダなし子も非表示
    expect(childWithSubsElement.style.display).toBe('none'); // サブフォルダあり子も非表示
  });

  describe('3層構造フォルダの動作テスト', () => {
    beforeEach(() => {
      // 3層構造のテスト用データ
      const threeLayerMockTree: ChromeBookmarkNode[] = [
        {
          id: '0',
          title: 'root',
          children: [
            {
              id: '1',
              title: 'ブックマーク バー',
              children: [
                {
                  id: '100',
                  title: '1層目フォルダ',
                  children: [
                    {
                      id: '200',
                      title: '2層目フォルダA',
                      children: [
                        {
                          id: '300',
                          title: '3層目フォルダ',
                          children: [
                            {
                              id: '301',
                              title: '3層目ブックマーク',
                              url: 'https://level3.com',
                            },
                          ],
                        },
                        {
                          id: '302',
                          title: '2層目ブックマーク',
                          url: 'https://level2.com',
                        },
                      ],
                    },
                    {
                      id: '201',
                      title: '2層目フォルダB',
                      children: [
                        {
                          id: '303',
                          title: '2層目Bブックマーク',
                          url: 'https://level2b.com',
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ];

      allBookmarks = processBookmarkTree(threeLayerMockTree);

      // DOM構造をレンダリング
      const bookmarksContainer = document.getElementById('bookmarkContainer')!;

      // 実際のレンダリング
      const html = allBookmarks.map((folder) => renderFolder(folder)).join('');
      bookmarksContainer.innerHTML = html;

      // クリックハンドラーを設定
      setupFolderClickHandler(bookmarksContainer, allBookmarks);
    });

    it('初期レンダリング時の3層構造の状態を確認', () => {
      // processBookmarkTreeのlevel < 2ルールにより：
      // - 1層目（level 0）: expanded = true
      // - 2層目（level 1）: expanded = true
      // - 3層目（level 2）: expanded = false

      const layer1Folder = findFolderById(allBookmarks, '100');
      const layer2FolderA = findFolderById(allBookmarks, '200');
      const layer2FolderB = findFolderById(allBookmarks, '201');
      const layer3Folder = findFolderById(allBookmarks, '300');

      expect(layer1Folder).toBeDefined();
      expect(layer2FolderA).toBeDefined();
      expect(layer2FolderB).toBeDefined();
      expect(layer3Folder).toBeDefined();

      expect(layer1Folder?.expanded).toBe(true);
      expect(layer2FolderA?.expanded).toBe(true);
      expect(layer2FolderB?.expanded).toBe(true);
      expect(layer3Folder?.expanded).toBe(true);

      // DOM要素の確認
      const layer1Element = document.querySelector(
        '[data-folder-id="100"]'
      ) as HTMLElement;
      const layer2AElement = document.querySelector(
        '[data-folder-id="200"]'
      ) as HTMLElement;
      const layer3Element = document.querySelector(
        '[data-folder-id="300"]'
      ) as HTMLElement;

      expect(layer1Element).toBeDefined();
      expect(layer2AElement).toBeDefined();
      expect(layer3Element).toBeDefined();

      // 3層目はサブフォルダを持たないため、.subfolders-containerは存在しない
      // 代わりに、ブックマークリストが展開されているか確認
      const layer3BookmarkList = layer3Element?.querySelector('.bookmark-list');
      expect(layer3BookmarkList?.classList.contains('expanded')).toBe(true);
    });

    it('1層目フォルダクリック時の動作を確認', async () => {
      const layer1Element = document.querySelector(
        '[data-folder-id="100"]'
      ) as HTMLElement;
      const layer1Header = layer1Element?.querySelector(
        '.folder-header'
      ) as HTMLElement;
      const layer1Container = layer1Element?.querySelector(
        '.subfolders-container'
      ) as HTMLElement;

      // 初期状態の確認
      expect(layer1Container?.classList.contains('expanded')).toBe(true);

      // 1層目フォルダをクリック（折りたたみ）
      layer1Header?.click();

      await new Promise((resolve) => setTimeout(resolve, 350));

      // 1層目が折りたたまれることを確認
      const layer1Folder = findFolderById(allBookmarks, '100');
      expect(layer1Folder?.expanded).toBe(false);
      expect(layer1Container?.classList.contains('collapsed')).toBe(true);

      // 仕様確認: 1層目が折りたたまれると2層目は非表示になる（これは正常）
      const layer2AElement = document.querySelector(
        '[data-folder-id="200"]'
      ) as HTMLElement;
      const layer2BElement = document.querySelector(
        '[data-folder-id="201"]'
      ) as HTMLElement;

      // これは現在の仕様通り：親フォルダが折りたたまれると子フォルダは非表示になる
      expect(layer2AElement?.style.display).toBe('none');
      expect(layer2BElement?.style.display).toBe('none');
    });

    it('2層目フォルダクリック時の動作を確認', async () => {
      const layer2AElement = document.querySelector(
        '[data-folder-id="200"]'
      ) as HTMLElement;
      const layer2AHeader = layer2AElement?.querySelector(
        '.folder-header'
      ) as HTMLElement;
      const layer2AContainer = layer2AElement?.querySelector(
        '.subfolders-container'
      ) as HTMLElement;

      // 初期状態の確認
      expect(layer2AContainer?.classList.contains('expanded')).toBe(true);

      // 2層目フォルダAをクリック（折りたたみ）
      layer2AHeader?.click();

      await new Promise((resolve) => setTimeout(resolve, 350));

      // 2層目Aが折りたたまれることを確認
      const layer2AFolderAfter = findFolderById(allBookmarks, '200');
      expect(layer2AFolderAfter?.expanded).toBe(false);
      expect(layer2AContainer?.classList.contains('collapsed')).toBe(true);

      // 3層目フォルダが非表示になることを確認（これは正常）
      const layer3Element = document.querySelector(
        '[data-folder-id="300"]'
      ) as HTMLElement;
      expect(layer3Element?.style.display).toBe('none');
    });

    it('3層目フォルダクリック時の動作を確認', async () => {
      // まず3層目を展開するため、3層目フォルダをクリック
      const layer3Element = document.querySelector(
        '[data-folder-id="300"]'
      ) as HTMLElement;
      const layer3Header = layer3Element?.querySelector(
        '.folder-header'
      ) as HTMLElement;
      const layer3BookmarkList = layer3Element?.querySelector(
        '.bookmark-list'
      ) as HTMLElement;

      // 初期状態では3層目は展開されている（ブックマークリスト）
      expect(layer3BookmarkList?.classList.contains('expanded')).toBe(true);

      // 3層目フォルダをクリック（折りたたみ）
      layer3Header?.click();

      await new Promise((resolve) => setTimeout(resolve, 350));

      // 3層目が折りたたまれることを確認
      const layer3FolderAfter = findFolderById(allBookmarks, '300');
      expect(layer3FolderAfter?.expanded).toBe(false);
      expect(layer3BookmarkList?.classList.contains('collapsed')).toBe(true);

      // 再度3層目をクリック（展開）
      layer3Header?.click();

      await new Promise((resolve) => setTimeout(resolve, 350));

      // 3層目が展開されることを確認
      const layer3FolderAfterSecond = findFolderById(allBookmarks, '300');
      expect(layer3FolderAfterSecond?.expanded).toBe(true);
      expect(layer3BookmarkList?.classList.contains('expanded')).toBe(true);

      // PROBLEM: 2層目フォルダAは折りたたまれるべきではない（問題の再現）
      const layer2AFolderAfter = findFolderById(allBookmarks, '200');
      expect(layer2AFolderAfter?.expanded).toBe(true); // これが失敗するはず
    });

    it('複雑な3層構造での展開・折りたたみシーケンスを確認 - 問題の再現', async () => {
      // シーケンス1: 3層目を折りたたみ
      const layer3Element = document.querySelector(
        '[data-folder-id="300"]'
      ) as HTMLElement;
      const layer3Header = layer3Element?.querySelector(
        '.folder-header'
      ) as HTMLElement;
      layer3Header?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));

      const layer3Folder = findFolderById(allBookmarks, '300');
      expect(layer3Folder?.expanded).toBe(false);

      // シーケンス2: 2層目Aを折りたたみ
      const layer2AElement = document.querySelector(
        '[data-folder-id="200"]'
      ) as HTMLElement;
      const layer2AHeader = layer2AElement?.querySelector(
        '.folder-header'
      ) as HTMLElement;
      layer2AHeader?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));

      const layer2AFolder = findFolderById(allBookmarks, '200');
      expect(layer2AFolder?.expanded).toBe(false);

      // 3層目は非表示になるはず（親フォルダが折りたたまれたため）
      expect(layer3Element?.style.display).toBe('none');

      // シーケンス3: 2層目Aを再展開
      layer2AHeader?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));

      const layer2AFolderReopen = findFolderById(allBookmarks, '200');
      expect(layer2AFolderReopen?.expanded).toBe(true);

      // 3層目は再び表示されるはず
      expect(layer3Element?.style.display).toBe('block');

      // 重要：3層目の展開状態は保持されているべき（折りたたまれたまま）
      const layer3FolderReopen = findFolderById(allBookmarks, '300');
      expect(layer3FolderReopen?.expanded).toBe(false);

      // シーケンス4: 3層目を展開
      layer3Header?.click();
      await new Promise((resolve) => setTimeout(resolve, 350));

      const layer3FolderExpanded = findFolderById(allBookmarks, '300');
      expect(layer3FolderExpanded?.expanded).toBe(true);

      // 最終確認：2層目フォルダAは影響を受けていないことを確認
      const layer2AFolderFinal = findFolderById(allBookmarks, '200');
      expect(layer2AFolderFinal?.expanded).toBe(true); // これが重要なテスト
    });
  });
});
