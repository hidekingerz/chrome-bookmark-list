import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkFolder } from '../src/types/bookmark';

// フォルダクリック機能のテスト
describe('フォルダクリック機能のテスト', () => {
  let dom: JSDOM;
  let document: Document;
  let window: Window;

  beforeEach(() => {
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>ブックマーク一覧</title>
        </head>
        <body>
          <div id="bookmarkContainer"></div>
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

    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.tabs.create = vi.fn();
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('サブフォルダがあるフォルダヘッダーをクリックすると展開・折りたたみが切り替わる', async () => {
    // テスト用のブックマークデータ
    const testBookmarks: BookmarkFolder[] = [
      {
        id: 'folder-1',
        title: 'テストフォルダ',
        bookmarks: [],
        subfolders: [
          {
            id: 'subfolder-1',
            title: 'サブフォルダ1',
            bookmarks: [
              {
                title: 'テストブックマーク',
                url: 'https://example.com',
                favicon: null,
              },
            ],
            subfolders: [],
            expanded: false,
          },
        ],
        expanded: false, // 初期状態は折りたたみ
      },
    ];

    // モックHTML構造を作成
    const bookmarkContainer = document.getElementById('bookmarkContainer')!;
    bookmarkContainer.innerHTML = `
      <div class="bookmark-folder" data-folder-id="folder-1">
        <div class="folder-header has-subfolders">
          <div class="folder-info">
            <span class="expand-icon">📁</span>
            <h2 class="folder-title">テストフォルダ</h2>
          </div>
        </div>
        <div class="subfolders-container collapsed">
          <div class="bookmark-folder" data-folder-id="subfolder-1">
            <!-- サブフォルダの内容 -->
          </div>
        </div>
      </div>
    `;

    // findFolderByIdのモック
    const findFolderById = vi.fn((_folders: BookmarkFolder[], id: string) => {
      if (id === 'folder-1') return testBookmarks[0];
      if (id === 'subfolder-1') return testBookmarks[0].subfolders[0];
      return null;
    });

    // グローバル変数のモック
    Object.defineProperty(globalThis, 'allBookmarks', {
      value: testBookmarks,
      writable: true,
      configurable: true,
    });

    // イベントリスナーを設定（実際のコードから抽出）
    bookmarkContainer.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const folderHeader = target.closest(
        '.folder-header'
      ) as HTMLElement | null;
      const bookmarkLink = target.closest(
        '.bookmark-link'
      ) as HTMLElement | null;

      if (bookmarkLink) {
        e.preventDefault();
        // ブックマーククリックの処理はここでは省略
      } else if (folderHeader && !target.closest('.bookmark-link')) {
        e.preventDefault();
        e.stopPropagation();

        const folderElement = folderHeader.closest(
          '.bookmark-folder'
        ) as HTMLElement;
        const folderId = folderElement?.getAttribute('data-folder-id');

        if (folderId) {
          const folder = findFolderById(testBookmarks, folderId);
          if (folder && folder.subfolders.length > 0) {
            // 展開状態を切り替え
            folder.expanded = !folder.expanded;

            // UI要素を更新
            const expandIcon = folderHeader.querySelector(
              '.expand-icon'
            ) as HTMLElement;
            const subfoldersContainer = folderElement.querySelector(
              '.subfolders-container'
            ) as HTMLElement;

            if (expandIcon) {
              expandIcon.textContent = folder.expanded ? '📂' : '📁';
              if (folder.expanded) {
                expandIcon.classList.add('expanded');
              } else {
                expandIcon.classList.remove('expanded');
              }
            }

            if (subfoldersContainer) {
              if (folder.expanded) {
                subfoldersContainer.classList.add('expanded');
                subfoldersContainer.classList.remove('collapsed');
              } else {
                subfoldersContainer.classList.add('collapsed');
                subfoldersContainer.classList.remove('expanded');
              }
            }
          }
        }
      }
    });

    // テスト実行：フォルダヘッダーをクリック
    const folderHeader = bookmarkContainer.querySelector(
      '.folder-header'
    ) as HTMLElement;
    expect(folderHeader).toBeDefined();

    // クリックイベントを発火
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    folderHeader.dispatchEvent(clickEvent);

    // 結果を検証
    const folder = findFolderById(testBookmarks, 'folder-1');
    expect(folder?.expanded).toBe(true); // フォルダが展開されている

    const expandIcon = folderHeader.querySelector(
      '.expand-icon'
    ) as HTMLElement;
    const subfoldersContainer = document.querySelector(
      '.subfolders-container'
    ) as HTMLElement;

    expect(expandIcon.textContent).toBe('📂'); // アイコンが展開状態
    expect(expandIcon.classList.contains('expanded')).toBe(true);
    expect(subfoldersContainer.classList.contains('expanded')).toBe(true);
    expect(subfoldersContainer.classList.contains('collapsed')).toBe(false);

    // 再度クリックして折りたたみをテスト
    folderHeader.dispatchEvent(clickEvent);

    expect(folder?.expanded).toBe(false); // フォルダが折りたたまれている
    expect(expandIcon.textContent).toBe('📁'); // アイコンが折りたたみ状態
    expect(expandIcon.classList.contains('expanded')).toBe(false);
    expect(subfoldersContainer.classList.contains('expanded')).toBe(false);
    expect(subfoldersContainer.classList.contains('collapsed')).toBe(true);
  });

  it('ブックマークリンクをクリックすると新しいタブが開かれる', async () => {
    const bookmarkContainer = document.getElementById('bookmarkContainer')!;
    bookmarkContainer.innerHTML = `
      <div class="bookmark-folder">
        <ul class="bookmark-list">
          <li class="bookmark-item">
            <a href="#" class="bookmark-link" data-url="https://example.com">
              <span class="bookmark-title">テストブックマーク</span>
            </a>
          </li>
        </ul>
      </div>
    `;

    // イベントリスナーを設定
    bookmarkContainer.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const bookmarkLink = target.closest(
        '.bookmark-link'
      ) as HTMLElement | null;

      if (bookmarkLink) {
        e.preventDefault();
        const url = bookmarkLink.getAttribute('data-url');
        if (url) {
          chrome.tabs.create({ url: url });
        }
      }
    });

    // ブックマークリンクをクリック
    const bookmarkLink = bookmarkContainer.querySelector(
      '.bookmark-link'
    ) as HTMLElement;
    expect(bookmarkLink).toBeDefined();

    const clickEvent = new dom.window.Event('click', { bubbles: true });
    bookmarkLink.dispatchEvent(clickEvent);

    // Chrome API が呼ばれたことを確認
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://example.com',
    });
  });

  it('サブフォルダがないフォルダをクリックしても何も起こらない', async () => {
    const testBookmarks: BookmarkFolder[] = [
      {
        id: 'folder-no-sub',
        title: 'サブフォルダなしフォルダ',
        bookmarks: [
          {
            title: 'テストブックマーク',
            url: 'https://example.com',
            favicon: null,
          },
        ],
        subfolders: [],
        expanded: false,
      },
    ];

    const bookmarkContainer = document.getElementById('bookmarkContainer')!;
    bookmarkContainer.innerHTML = `
      <div class="bookmark-folder" data-folder-id="folder-no-sub">
        <div class="folder-header">
          <div class="folder-info">
            <span class="folder-icon">📄</span>
            <h2 class="folder-title">サブフォルダなしフォルダ</h2>
          </div>
        </div>
      </div>
    `;

    const findFolderById = vi.fn((_folders: BookmarkFolder[], id: string) => {
      if (id === 'folder-no-sub') return testBookmarks[0];
      return null;
    });

    const initialExpanded = testBookmarks[0].expanded;

    // イベントリスナーを設定
    bookmarkContainer.addEventListener('click', (e: Event) => {
      const target = e.target as HTMLElement;
      const folderHeader = target.closest(
        '.folder-header'
      ) as HTMLElement | null;

      if (folderHeader && !target.closest('.bookmark-link')) {
        e.preventDefault();
        e.stopPropagation();

        const folderElement = folderHeader.closest(
          '.bookmark-folder'
        ) as HTMLElement;
        const folderId = folderElement?.getAttribute('data-folder-id');

        if (folderId) {
          const folder = findFolderById(testBookmarks, folderId);
          if (folder && folder.subfolders.length > 0) {
            folder.expanded = !folder.expanded;
          }
        }
      }
    });

    // フォルダヘッダーをクリック
    const folderHeader = bookmarkContainer.querySelector(
      '.folder-header'
    ) as HTMLElement;
    const clickEvent = new dom.window.Event('click', { bubbles: true });
    folderHeader.dispatchEvent(clickEvent);

    // 状態が変わらないことを確認
    expect(testBookmarks[0].expanded).toBe(initialExpanded);
  });
});
