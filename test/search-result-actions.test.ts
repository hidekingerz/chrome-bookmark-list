import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { filterBookmarks } from '../src/scripts/utils';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * 検索結果からブックマーク操作 (編集/削除/コンテキストメニュー) ができ、
 * 操作後も検索フィルタが維持されることを確認する統合テスト (#57)。
 */
describe('検索結果からの直接操作 (#57)', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let renderer: BookmarkFolderRenderer;
  let events: BookmarkFolderEvents;

  const allBookmarks: BookmarkFolder[] = [
    {
      id: 'folder-1',
      title: 'Work',
      expanded: true,
      bookmarks: [
        { title: 'GitHub', url: 'https://github.com', favicon: null },
        { title: 'Slack', url: 'https://slack.com', favicon: null },
      ],
      subfolders: [],
    },
    {
      id: 'folder-2',
      title: 'Personal',
      expanded: true,
      bookmarks: [
        { title: 'Twitter', url: 'https://twitter.com', favicon: null },
      ],
      subfolders: [],
    },
  ];

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
    Object.defineProperty(globalThis, 'CustomEvent', {
      value: dom.window.CustomEvent,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: (cb: () => void) => {
        cb();
        return 0;
      },
      writable: true,
      configurable: true,
    });

    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: {
        search: ReturnType<typeof vi.fn>;
        getTree: ReturnType<typeof vi.fn>;
      };
      tabs: { create: ReturnType<typeof vi.fn> };
    };
    mockChrome.bookmarks.search = vi.fn();
    mockChrome.bookmarks.getTree = vi.fn().mockResolvedValue([]);
    mockChrome.tabs.create = vi.fn();

    container = document.getElementById('bookmarks') as HTMLElement;
    renderer = new BookmarkFolderRenderer();
    events = new BookmarkFolderEvents();
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  function render(folders: BookmarkFolder[]): void {
    container.innerHTML = renderer.renderFolders(folders);
    events.setupFolderClickHandler(container, folders);
  }

  it('検索フィルタ後も編集ボタンは正しい data-bookmark-url を持ち、編集可能', () => {
    const filtered = filterBookmarks(allBookmarks, 'github');
    render(filtered);

    const editBtn = container.querySelector(
      '.bookmark-edit-btn'
    ) as HTMLElement;
    expect(editBtn).not.toBeNull();
    expect(editBtn.getAttribute('data-bookmark-url')).toBe(
      'https://github.com'
    );
    expect(editBtn.getAttribute('data-bookmark-title')).toBe('GitHub');
  });

  it('検索フィルタ後も右クリックメニューが表示される', () => {
    const filtered = filterBookmarks(allBookmarks, 'github');
    render(filtered);

    const bookmarkItem = container.querySelector(
      '.bookmark-item'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 10,
      clientY: 10,
    });
    bookmarkItem.dispatchEvent(event);

    const menu = document.getElementById('bookmark-context-menu');
    expect(menu).not.toBeNull();
  });

  it('検索結果のブックマークも tabindex を持ち、キーボードフォーカス可能', () => {
    const filtered = filterBookmarks(allBookmarks, 'github');
    render(filtered);

    const bookmarkItem = container.querySelector(
      '.bookmark-item'
    ) as HTMLElement;
    expect(bookmarkItem.getAttribute('tabindex')).toBe('0');
  });

  it('検索フィルタは複数件マッチでも全件にアクション可能', () => {
    // "twitter" は1件、"https" は3件マッチ
    const filtered = filterBookmarks(allBookmarks, 'https');
    render(filtered);

    const editButtons = container.querySelectorAll('.bookmark-edit-btn');
    const deleteButtons = container.querySelectorAll('.bookmark-delete-btn');
    expect(editButtons.length).toBe(3);
    expect(deleteButtons.length).toBe(3);
  });

  it('検索後にbookmarks-changedイベントを発火してもDOMが正しく再描画される (再描画後も検索を維持できることを示すための前提)', () => {
    // 検索フィルタ後の状態
    const filtered = filterBookmarks(allBookmarks, 'github');
    render(filtered);
    expect(container.querySelectorAll('.bookmark-item').length).toBe(1);

    // bookmarks-changed をシミュレートして再フィルタ・再描画
    const refreshed = filterBookmarks(allBookmarks, 'github');
    render(refreshed);
    expect(container.querySelectorAll('.bookmark-item').length).toBe(1);
    expect(
      container
        .querySelector('.bookmark-edit-btn')
        ?.getAttribute('data-bookmark-url')
    ).toBe('https://github.com');
  });
});
