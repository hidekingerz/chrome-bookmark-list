import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderCreator } from '../src/components/BookmarkActions/FolderCreator';
import { FolderDeleter } from '../src/components/BookmarkActions/FolderDeleter';
import { FolderRenamer } from '../src/components/BookmarkActions/FolderRenamer';
import { BookmarkActions } from '../src/components/BookmarkActions/index';
import { TabGroupOpener } from '../src/components/BookmarkActions/TabGroupOpener';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * BookmarkFolderEvents の未到達パスを補完するカバレッジ向けテスト。
 * 既存の bookmark-context-menu / bookmark-click-behaviors / a11y-touch は
 * 主要なマウス操作のみを通すため、ここでは:
 *  - キーボード (ContextMenu / Shift+F10) によるメニュー表示
 *  - タッチ長押しによるメニュー表示と各キャンセル経路
 *  - コンテキストメニュー各項目の onSelect コールバック
 *  - クリップボードのフォールバック・例外経路
 *  - 各種早期 return（URL 欠落・folderId 欠落・フォルダ未検出）
 * を検証する。
 */
describe('BookmarkFolderEvents カバレッジ補完', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let events: BookmarkFolderEvents;
  let allBookmarks: BookmarkFolder[];
  let pendingLongPress: (() => void) | null;
  let setTimeoutSpy: ReturnType<typeof vi.fn>;
  let clearTimeoutSpy: ReturnType<typeof vi.fn>;

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

    // window.setTimeout をスタブ化して長押しタイマーの発火を手動制御する
    // （vi のフェイクタイマーは dom.window 側の setTimeout には届かないため）。
    pendingLongPress = null;
    setTimeoutSpy = vi.fn((cb: () => void) => {
      pendingLongPress = cb;
      return 42;
    });
    clearTimeoutSpy = vi.fn(() => {
      pendingLongPress = null;
    });
    (dom.window as unknown as { setTimeout: unknown }).setTimeout =
      setTimeoutSpy;
    (dom.window as unknown as { clearTimeout: unknown }).clearTimeout =
      clearTimeoutSpy;

    const mockChrome = globalThis.chrome as unknown as {
      tabs: {
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.tabs.create = vi.fn();
    mockChrome.tabs.update = vi.fn();

    // 副作用のあるダイアログ系メソッドはスパイ化して呼び出しのみ検証する。
    vi.spyOn(BookmarkActions.prototype, 'handleEdit').mockResolvedValue(
      undefined
    );
    vi.spyOn(BookmarkActions.prototype, 'handleDelete').mockResolvedValue(
      undefined
    );
    vi.spyOn(FolderCreator.prototype, 'openCreateDialog').mockResolvedValue(
      undefined
    );
    vi.spyOn(FolderRenamer.prototype, 'openRenameDialog').mockResolvedValue(
      undefined
    );
    vi.spyOn(FolderDeleter.prototype, 'openDeleteDialog').mockResolvedValue(
      undefined
    );
    vi.spyOn(TabGroupOpener.prototype, 'openAsGroup').mockResolvedValue(
      undefined
    );

    allBookmarks = [
      // サブフォルダ + ブックマークを併せ持つフォルダ
      {
        id: 'folder-1',
        title: '親フォルダ',
        expanded: true,
        bookmarks: [
          { title: 'サイトA', url: 'https://a.example.com', favicon: null },
        ],
        subfolders: [
          {
            id: 'sub-1',
            title: '子フォルダ',
            expanded: false,
            bookmarks: [
              { title: 'サイトC', url: 'https://c.example.com', favicon: null },
            ],
            subfolders: [],
          },
        ],
      },
      // ブックマークのみのフォルダ（toggleFolderWithBookmarks 用）
      {
        id: 'bm-only',
        title: 'リンク集',
        expanded: false,
        bookmarks: [
          { title: 'サイトD', url: 'https://d.example.com', favicon: null },
        ],
        subfolders: [],
      },
      // パーマネントフォルダ
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
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  // === ヘルパー ===
  function bookmarkItem(folderId = 'folder-1'): HTMLElement {
    return container.querySelector(
      `[data-folder-id="${folderId}"] .bookmark-item`
    ) as HTMLElement;
  }
  function folderHeader(folderId: string): HTMLElement {
    return container.querySelector(
      `[data-folder-id="${folderId}"] .folder-header`
    ) as HTMLElement;
  }
  function dispatchContextMenu(target: HTMLElement): void {
    target.dispatchEvent(
      new dom.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 100,
        clientY: 100,
      })
    );
  }
  function menuButtons(): HTMLButtonElement[] {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('.context-menu-item')
    );
  }
  function clickMenuItem(label: string): void {
    const btn = menuButtons().find((b) => b.textContent?.includes(label));
    btn?.click();
  }

  // === getSelection ===
  it('getSelection() は BookmarkSelection を返す', () => {
    const selection = events.getSelection();
    expect(selection).toBeDefined();
    expect(typeof selection.handleClick).toBe('function');
  });

  // === クリックによる編集・削除ボタン ===
  it('編集ボタンクリックで handleEdit が呼ばれ既定動作が抑制される', () => {
    const editBtn = container.querySelector(
      '.bookmark-edit-btn'
    ) as HTMLElement;
    const ev = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    editBtn.dispatchEvent(ev);

    expect(BookmarkActions.prototype.handleEdit).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('削除ボタンクリックで handleDelete が呼ばれる', () => {
    const deleteBtn = container.querySelector(
      '.bookmark-delete-btn'
    ) as HTMLElement;
    deleteBtn.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(BookmarkActions.prototype.handleDelete).toHaveBeenCalledTimes(1);
  });

  // === mousedown（中クリックのオートスクロール抑制） ===
  it('中クリックの mousedown はブックマークリンク上で preventDefault する', () => {
    const link = container.querySelector('.bookmark-link') as HTMLElement;
    const ev = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it('左クリックの mousedown は何もしない', () => {
    const link = container.querySelector('.bookmark-link') as HTMLElement;
    const ev = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('中クリックの mousedown はリンク外では preventDefault しない', () => {
    const header = folderHeader('folder-1');
    const ev = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    header.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  // === auxclick（中クリックで開く）の URL 欠落 ===
  it('中クリックでも data-url が無いリンクでは何も開かない', () => {
    const link = container.querySelector('.bookmark-link') as HTMLElement;
    link.removeAttribute('data-url');
    link.dispatchEvent(
      new dom.window.MouseEvent('auxclick', {
        bubbles: true,
        cancelable: true,
        button: 1,
      })
    );
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  // === キーボードによるコンテキストメニュー ===
  it('ContextMenu キーでブックマークのメニューが開く', () => {
    bookmarkItem().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'ContextMenu',
        bubbles: true,
      })
    );
    expect(document.getElementById('bookmark-context-menu')).not.toBeNull();
  });

  it('Shift+F10 でフォルダのメニューが開く', () => {
    folderHeader('folder-1').dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'F10',
        shiftKey: true,
        bubbles: true,
      })
    );
    const labels = menuButtons().map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('新規サブフォルダ'))).toBe(true);
  });

  it('メニューキー以外の keydown は無視される', () => {
    bookmarkItem().dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true })
    );
    expect(document.getElementById('bookmark-context-menu')).toBeNull();
  });

  it('対象要素の無い場所での ContextMenu キーは無視される', () => {
    container.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'ContextMenu',
        bubbles: true,
      })
    );
    expect(document.getElementById('bookmark-context-menu')).toBeNull();
  });

  // === タッチ長押し ===
  function touchEvent(
    type: string,
    touches: Array<{ target: HTMLElement; clientX: number; clientY: number }>
  ): Event {
    const ev = new dom.window.Event(type, { bubbles: true });
    Object.defineProperty(ev, 'touches', {
      value: touches,
      configurable: true,
    });
    return ev;
  }

  it('単一指の長押しでブックマークのメニューが開く', () => {
    const item = bookmarkItem();
    item.dispatchEvent(
      touchEvent('touchstart', [{ target: item, clientX: 10, clientY: 10 }])
    );
    expect(setTimeoutSpy).toHaveBeenCalled();
    // タイマー発火を手動でトリガー
    pendingLongPress?.();
    expect(document.getElementById('bookmark-context-menu')).not.toBeNull();
  });

  it('単一指の長押しでフォルダのメニューが開く', () => {
    const header = folderHeader('folder-1');
    header.dispatchEvent(
      touchEvent('touchstart', [{ target: header, clientX: 5, clientY: 5 }])
    );
    pendingLongPress?.();
    const labels = menuButtons().map((b) => b.textContent ?? '');
    expect(labels.some((l) => l.includes('フォルダを削除'))).toBe(true);
  });

  it('複数指のタッチは長押しを開始しない', () => {
    const item = bookmarkItem();
    item.dispatchEvent(
      touchEvent('touchstart', [
        { target: item, clientX: 1, clientY: 1 },
        { target: item, clientX: 2, clientY: 2 },
      ])
    );
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('対象外要素のタッチは長押しを開始しない', () => {
    container.dispatchEvent(
      touchEvent('touchstart', [{ target: container, clientX: 1, clientY: 1 }])
    );
    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });

  it('閾値を超える touchmove で長押しがキャンセルされる', () => {
    const item = bookmarkItem();
    item.dispatchEvent(
      touchEvent('touchstart', [{ target: item, clientX: 0, clientY: 0 }])
    );
    item.dispatchEvent(
      touchEvent('touchmove', [{ target: item, clientX: 100, clientY: 100 }])
    );
    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(pendingLongPress).toBeNull();
  });

  it('touchend で長押しがキャンセルされる', () => {
    const item = bookmarkItem();
    item.dispatchEvent(
      touchEvent('touchstart', [{ target: item, clientX: 0, clientY: 0 }])
    );
    item.dispatchEvent(touchEvent('touchend', []));
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  // === ブックマークメニューの各 onSelect ===
  it('「開く」で chrome.tabs.update が呼ばれる', () => {
    dispatchContextMenu(bookmarkItem());
    clickMenuItem('開く');
    expect(chrome.tabs.update).toHaveBeenCalledWith({
      url: 'https://a.example.com',
    });
  });

  it('「バックグラウンドで開く」で active:false のタブが作られる', () => {
    dispatchContextMenu(bookmarkItem());
    clickMenuItem('バックグラウンドで開く');
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: false,
    });
  });

  it('「URLをコピー」で clipboard.writeText が呼ばれる', async () => {
    dispatchContextMenu(bookmarkItem());
    clickMenuItem('URLをコピー');
    await Promise.resolve();
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://a.example.com'
    );
  });

  it('「編集」で handleEdit が呼ばれる', () => {
    dispatchContextMenu(bookmarkItem());
    clickMenuItem('編集');
    expect(BookmarkActions.prototype.handleEdit).toHaveBeenCalled();
  });

  it('「削除」で handleDelete が呼ばれる', () => {
    dispatchContextMenu(bookmarkItem());
    clickMenuItem('削除');
    expect(BookmarkActions.prototype.handleDelete).toHaveBeenCalled();
  });

  it('data-url が無いブックマークでは右クリックメニューを開かない', () => {
    const item = bookmarkItem();
    item.querySelector('.bookmark-link')?.removeAttribute('data-url');
    dispatchContextMenu(item);
    expect(document.getElementById('bookmark-context-menu')).toBeNull();
  });

  // === クリップボードのフォールバック・例外 ===
  it('clipboard API が無い場合は execCommand フォールバックを使う', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });
    const execCommand = vi.fn();
    (document as unknown as { execCommand: unknown }).execCommand = execCommand;

    dispatchContextMenu(bookmarkItem());
    clickMenuItem('URLをコピー');
    await Promise.resolve();

    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('clipboard.writeText 失敗時は console.error でログする', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        clipboard: {
          writeText: vi.fn().mockRejectedValue(new Error('denied')),
        },
      },
      writable: true,
      configurable: true,
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    dispatchContextMenu(bookmarkItem());
    clickMenuItem('URLをコピー');
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalled();
  });

  // === フォルダメニューの各 onSelect ===
  it('「折りたたむ」でサブフォルダ付きフォルダの展開状態が反転する', () => {
    dispatchContextMenu(folderHeader('folder-1'));
    clickMenuItem('折りたたむ');
    expect(allBookmarks[0].expanded).toBe(false);
  });

  it('「展開する」でブックマークのみフォルダの展開状態が反転する', () => {
    dispatchContextMenu(folderHeader('bm-only'));
    clickMenuItem('展開する');
    expect(allBookmarks[1].expanded).toBe(true);
  });

  it('「グループにまとめて開く」で openAsGroup が全 URL とともに呼ばれる', () => {
    dispatchContextMenu(folderHeader('folder-1'));
    clickMenuItem('グループにまとめて開く');
    expect(TabGroupOpener.prototype.openAsGroup).toHaveBeenCalledWith(
      ['https://a.example.com', 'https://c.example.com'],
      '親フォルダ'
    );
  });

  it('「新規サブフォルダ」で openCreateDialog が呼ばれる', () => {
    dispatchContextMenu(folderHeader('folder-1'));
    clickMenuItem('新規サブフォルダ');
    expect(FolderCreator.prototype.openCreateDialog).toHaveBeenCalledWith(
      'folder-1'
    );
  });

  it('「フォルダ名を変更」で openRenameDialog が呼ばれる', () => {
    dispatchContextMenu(folderHeader('folder-1'));
    clickMenuItem('フォルダ名を変更');
    expect(FolderRenamer.prototype.openRenameDialog).toHaveBeenCalledWith(
      'folder-1'
    );
  });

  it('「フォルダを削除」で openDeleteDialog が呼ばれる', () => {
    dispatchContextMenu(folderHeader('folder-1'));
    clickMenuItem('フォルダを削除');
    expect(FolderDeleter.prototype.openDeleteDialog).toHaveBeenCalledWith(
      'folder-1'
    );
  });

  // === フォルダメニューの早期 return ===
  it('.bookmark-folder 外の folder-header ではメニューを開かない', () => {
    const orphan = dom.window.document.createElement('div');
    orphan.className = 'folder-header';
    orphan.textContent = 'orphan';
    container.appendChild(orphan);
    dispatchContextMenu(orphan);
    expect(document.getElementById('bookmark-context-menu')).toBeNull();
  });

  it('allBookmarks に存在しないフォルダではメニューを開かない', () => {
    const ghost = dom.window.document.createElement('div');
    ghost.className = 'bookmark-folder';
    ghost.setAttribute('data-folder-id', 'ghost');
    ghost.innerHTML = '<div class="folder-header">ghost</div>';
    container.appendChild(ghost);
    dispatchContextMenu(ghost.querySelector('.folder-header') as HTMLElement);
    expect(document.getElementById('bookmark-context-menu')).toBeNull();
  });

  // === ブックマーククリックの分岐 ===
  it('data-url が無いブックマークリンクのクリックは何も開かない', () => {
    const link = bookmarkItem().querySelector('.bookmark-link') as HTMLElement;
    link.removeAttribute('data-url');
    const ev = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('選択処理がクリックを消費した場合はタブを開かない', () => {
    vi.spyOn(events.getSelection(), 'handleClick').mockReturnValue(true);
    const link = bookmarkItem().querySelector('.bookmark-link') as HTMLElement;
    link.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
    );
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('data-folder-id の無いフォルダヘッダークリックは何もしない', () => {
    const orphan = dom.window.document.createElement('div');
    orphan.className = 'bookmark-folder';
    orphan.innerHTML = '<div class="folder-header">no-id</div>';
    container.appendChild(orphan);
    const header = orphan.querySelector('.folder-header') as HTMLElement;
    expect(() =>
      header.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
      )
    ).not.toThrow();
  });
});
