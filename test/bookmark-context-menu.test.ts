import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import type { BookmarkFolder } from '../src/types/bookmark';

describe('右クリックコンテキストメニュー統合', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let events: BookmarkFolderEvents;
  let allBookmarks: BookmarkFolder[];

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><body><div id="bookmarks"></div></body></html>`,
      { url: 'chrome-extension://test/newtab.html' }
    );

    Object.defineProperty(globalThis, 'document', {
      value: dom.window.document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: dom.window,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
      value: { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } },
      writable: true,
      configurable: true,
    });

    const mockChrome = globalThis.chrome as unknown as {
      tabs: {
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.tabs.create = vi.fn();
    mockChrome.tabs.update = vi.fn();

    allBookmarks = [
      // ユーザーフォルダ（ブックマークバー直下に作ったフォルダ相当）
      {
        id: 'folder-1',
        title: 'テストフォルダ',
        expanded: true,
        bookmarks: [
          {
            title: 'サイトA',
            url: 'https://a.example.com',
            favicon: null,
          },
          {
            title: 'サイトB',
            url: 'https://b.example.com',
            favicon: null,
          },
        ],
        subfolders: [],
      },
      // パーマネントフォルダ「その他のブックマーク」相当
      {
        id: '2',
        title: 'その他のブックマーク',
        expanded: false,
        bookmarks: [],
        subfolders: [],
      },
    ];

    container = dom.window.document.getElementById('bookmarks') as HTMLElement;
    const renderer = new BookmarkFolderRenderer();
    container.innerHTML = renderer.renderFolders(allBookmarks);

    events = new BookmarkFolderEvents();
    events.setupFolderClickHandler(container, allBookmarks);
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  function dispatchContextMenu(target: HTMLElement): void {
    const event = new dom.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 100,
    });
    target.dispatchEvent(event);
  }

  it('ブックマーク上で右クリックすると編集・削除・開くメニューが表示される', () => {
    const bookmarkItem = container.querySelector(
      '.bookmark-item'
    ) as HTMLElement;
    dispatchContextMenu(bookmarkItem);

    const menu = document.getElementById('bookmark-context-menu');
    expect(menu).not.toBeNull();

    const labels = Array.from(
      menu?.querySelectorAll('.context-menu-label') ?? []
    ).map((el) => el.textContent);

    expect(labels).toContain('開く');
    expect(labels).toContain('新しいタブで開く');
    expect(labels).toContain('URLをコピー');
    expect(labels).toContain('編集');
    expect(labels).toContain('削除');
  });

  it('「新しいタブで開く」を選択すると chrome.tabs.create が呼ばれる', () => {
    const bookmarkItem = container.querySelector(
      '.bookmark-item'
    ) as HTMLElement;
    dispatchContextMenu(bookmarkItem);

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.context-menu-item')
    );
    const newTabBtn = buttons.find((b) =>
      b.textContent?.includes('新しいタブで開く')
    );
    newTabBtn?.click();

    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: true,
    });
  });

  it('フォルダヘッダー上で右クリックするとフォルダメニューが表示される', () => {
    const folderHeader = container.querySelector(
      '.folder-header'
    ) as HTMLElement;
    dispatchContextMenu(folderHeader);

    const menu = document.getElementById('bookmark-context-menu');
    expect(menu).not.toBeNull();

    const labels = Array.from(
      menu?.querySelectorAll('.context-menu-label') ?? []
    ).map((el) => el.textContent);

    expect(
      labels.some((l) => l?.includes('折りたたむ') || l?.includes('展開する'))
    ).toBe(true);
    expect(labels.some((l) => l?.includes('全て新しいタブで開く'))).toBe(true);
    expect(labels).toContain('新規サブフォルダ');
    expect(labels).toContain('フォルダ名を変更');
    expect(labels).toContain('フォルダを削除');
  });

  it('ユーザーフォルダではリネームが有効', () => {
    // folder-1 はユーザーフォルダ（ブックマークバー直下相当）
    const folderHeader = container.querySelector(
      '[data-folder-id="folder-1"] .folder-header'
    ) as HTMLElement;
    dispatchContextMenu(folderHeader);

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.context-menu-item')
    );
    const rename = buttons.find((b) =>
      b.textContent?.includes('フォルダ名を変更')
    );
    const remove = buttons.find((b) =>
      b.textContent?.includes('フォルダを削除')
    );
    const newSub = buttons.find((b) =>
      b.textContent?.includes('新規サブフォルダ')
    );

    expect(rename?.disabled).toBe(false);
    expect(remove?.disabled).toBe(true);
    expect(newSub?.disabled).toBe(false);
  });

  it('Chrome のパーマネントフォルダ (id=2) ではリネームが disabled', () => {
    // id=2 (その他のブックマーク) を右クリック
    const folderHeader = container.querySelector(
      '[data-folder-id="2"] .folder-header'
    ) as HTMLElement;
    dispatchContextMenu(folderHeader);

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.context-menu-item')
    );
    const rename = buttons.find((b) =>
      b.textContent?.includes('フォルダ名を変更')
    );
    expect(rename?.disabled).toBe(true);
  });

  it('「中のブックマークを全て新しいタブで開く」を選択すると全URLが開かれる', () => {
    const folderHeader = container.querySelector(
      '.folder-header'
    ) as HTMLElement;
    dispatchContextMenu(folderHeader);

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.context-menu-item')
    );
    const openAll = buttons.find((b) =>
      b.textContent?.includes('全て新しいタブで開く')
    );
    openAll?.click();

    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: false,
    });
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://b.example.com',
      active: false,
    });
  });

  it('右クリック時にデフォルトのコンテキストメニューが抑制される', () => {
    const bookmarkItem = container.querySelector(
      '.bookmark-item'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
    });
    bookmarkItem.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });
});
