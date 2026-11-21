import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * タッチの長押し (500ms) でコンテキストメニューを開く動作のうち、
 * 「指が縦方向にだけ動いた」場合のしきい値 (10px) を確かめる。
 *
 * DOM は本物の BookmarkFolderRenderer で描画し、TouchEvent を項目に dispatch する。
 * 確かめるのは、500ms 後にコンテキストメニューが開いているかどうか。
 */
describe('長押し中の縦方向の移動', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let listenerErrors: string[];

  const folders: BookmarkFolder[] = [
    {
      id: '10',
      title: '仕事',
      expanded: true,
      subfolders: [],
      bookmarks: [
        {
          id: '101',
          title: 'Example',
          url: 'https://example.com/',
          favicon: null,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;
    // happy-dom の Window は読み込み時点の本物のタイマーを抱えているので、
    // vi.useFakeTimers() で進められるグローバルのタイマーに付け替える
    Object.assign(win, {
      setTimeout: (handler: () => void, ms?: number) =>
        globalThis.setTimeout(handler, ms),
      clearTimeout: (id: number) => globalThis.clearTimeout(id),
    });

    // リスナー内の例外は dispatchEvent からは投げられず、window の error イベントになる
    listenerErrors = [];
    win.addEventListener('error', (e) => {
      listenerErrors.push((e as unknown as ErrorEvent).message);
    });

    container = document.createElement('div');
    container.id = 'bookmarkContainer';
    document.body.appendChild(container);
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
    new BookmarkFolderEvents().setupFolderClickHandler(container, folders);
  });

  afterEach(() => {
    // 開いたメニューが document に付けたリスナーを外す
    document.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    vi.useRealTimers();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function touch(type: string, target: HTMLElement, x: number, y: number) {
    target.dispatchEvent(
      new win.TouchEvent(type, {
        bubbles: true,
        cancelable: true,
        touches: [{ clientX: x, clientY: y, target }],
      } as unknown as TouchEventInit) as unknown as Event
    );
  }

  function bookmarkItem(): HTMLElement {
    return container.querySelector('.bookmark-item') as HTMLElement;
  }

  function contextMenu(): HTMLElement | null {
    return document.querySelector('[role="menu"]');
  }

  it('横に動かさず縦に 11px 動かすと、長押しは取り消されてメニューは開かない', () => {
    const item = bookmarkItem();

    touch('touchstart', item, 100, 100);
    vi.advanceTimersByTime(200);
    touch('touchmove', item, 100, 111);
    vi.advanceTimersByTime(500);

    expect(contextMenu()).toBeNull();
    expect(listenerErrors).toEqual([]);
  });

  it('縦に動かした量がちょうど 10px なら、長押しは続いてメニューが開く', () => {
    const item = bookmarkItem();

    touch('touchstart', item, 100, 100);
    vi.advanceTimersByTime(200);
    touch('touchmove', item, 100, 110);
    vi.advanceTimersByTime(300);

    const menu = contextMenu();
    expect(menu).not.toBeNull();
    const labels = Array.from(
      menu?.querySelectorAll('[role="menuitem"]') ?? []
    ).map((el) => el.textContent?.replace(/\s+/g, ' ').trim());
    expect(labels).toContain('🔗 開く');
    expect(listenerErrors).toEqual([]);
  });

  it('上方向に 11px 動かしても、長押しは取り消される', () => {
    const item = bookmarkItem();

    touch('touchstart', item, 100, 100);
    touch('touchmove', item, 100, 89);
    vi.advanceTimersByTime(500);

    expect(contextMenu()).toBeNull();
    expect(listenerErrors).toEqual([]);
  });
});
