import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * 一覧の上でのクリックの基本動作。
 *
 * 本物のレンダラ (BookmarkFolderRenderer) が描いた一覧に、本物のクリック処理
 * (BookmarkFolderEvents) を付けて、クリックの後の表示と、開かれるタブを確かめる。
 */
describe('フォルダクリック機能のテスト', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;

  const tabsCreate = () =>
    chrome.tabs.create as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    container = document.createElement('div');
    container.id = 'bookmarkContainer';
    document.body.appendChild(container);
  });

  afterEach(() => {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function show(folders: BookmarkFolder[]): void {
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
    new BookmarkFolderEvents().setupFolderClickHandler(container, folders);
  }

  function click(target: HTMLElement): MouseEvent {
    const event = new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }) as unknown as MouseEvent;
    target.dispatchEvent(event);
    return event;
  }

  function header(folderId: string): HTMLElement {
    return container.querySelector(
      `[data-folder-id="${folderId}"] > .folder-header`
    ) as HTMLElement;
  }

  /** フォルダの見た目の状態（アイコン、サブフォルダ領域、ブックマークのリスト）。 */
  function folderView(folderId: string) {
    const folder = container.querySelector(
      `[data-folder-id="${folderId}"]`
    ) as HTMLElement;
    const icon = folder.querySelector(
      ':scope > .folder-header .expand-icon'
    ) as HTMLElement | null;
    const subfolders = folder.querySelector(
      ':scope > .subfolders-container'
    ) as HTMLElement | null;
    const list = folder.querySelector(
      ':scope > .bookmark-list'
    ) as HTMLElement | null;
    return {
      icon: icon?.textContent,
      iconExpanded: icon?.classList.contains('expanded'),
      ariaExpanded: header(folderId).getAttribute('aria-expanded'),
      subfoldersExpanded: subfolders?.classList.contains('expanded'),
      subfoldersCollapsed: subfolders?.classList.contains('collapsed'),
      subfoldersDisplay: subfolders?.style.display,
      listDisplay: list?.style.display,
    };
  }

  it('サブフォルダがあるフォルダヘッダーをクリックすると展開・折りたたみが切り替わる', () => {
    const folders: BookmarkFolder[] = [
      {
        id: '10',
        title: 'テストフォルダ',
        bookmarks: [],
        expanded: false, // 初期状態は折りたたみ
        subfolders: [
          {
            id: '20',
            title: 'サブフォルダ1',
            expanded: true,
            subfolders: [],
            bookmarks: [
              {
                id: '201',
                title: 'テストブックマーク',
                url: 'https://example.com/',
                favicon: null,
              },
            ],
          },
        ],
      },
    ];
    show(folders);
    expect(folderView('10')).toMatchObject({
      icon: '📁',
      ariaExpanded: 'false',
      subfoldersDisplay: 'none',
    });

    // 1 回目のクリックで展開する
    click(header('10'));

    expect(folders[0].expanded).toBe(true);
    expect(folderView('10')).toMatchObject({
      icon: '📂',
      iconExpanded: true,
      ariaExpanded: 'true',
      subfoldersExpanded: true,
      subfoldersCollapsed: false,
      subfoldersDisplay: 'block',
    });

    // 2 回目のクリックで折りたたむ
    click(header('10'));

    expect(folders[0].expanded).toBe(false);
    expect(folderView('10')).toMatchObject({
      icon: '📁',
      iconExpanded: false,
      ariaExpanded: 'false',
      subfoldersExpanded: false,
      subfoldersCollapsed: true,
      subfoldersDisplay: 'none',
    });
    // フォルダのヘッダをクリックしてもタブは開かない
    expect(tabsCreate()).not.toHaveBeenCalled();
  });

  it('ブックマークリンクをクリックすると新しいタブが開かれ、フォルダは折りたたまれない', () => {
    const folders: BookmarkFolder[] = [
      {
        id: '10',
        title: 'テストフォルダ',
        expanded: true,
        subfolders: [],
        bookmarks: [
          {
            id: '101',
            title: 'テストブックマーク',
            url: 'https://example.com/',
            favicon: null,
          },
        ],
      },
    ];
    show(folders);

    const event = click(
      container.querySelector(
        '.bookmark-item[data-bookmark-id="101"] .bookmark-title'
      ) as HTMLElement
    );

    expect(tabsCreate().mock.calls).toEqual([
      [{ url: 'https://example.com/', active: true }],
    ]);
    // <a href="#"> の既定動作（ページ内リンクへの移動）は起こさない
    expect(event.defaultPrevented).toBe(true);
    // リンクのクリックは、それを含むフォルダの開閉には使われない
    expect(folders[0].expanded).toBe(true);
    expect(folderView('10')).toMatchObject({
      icon: '📂',
      ariaExpanded: 'true',
      listDisplay: 'block',
    });
  });

  it('サブフォルダもブックマークも無いフォルダをクリックしても何も起こらない', () => {
    const folders: BookmarkFolder[] = [
      {
        id: '10',
        title: '空のフォルダ',
        expanded: false,
        subfolders: [],
        bookmarks: [],
      },
    ];
    show(folders);
    const before = container.innerHTML;

    click(header('10'));

    expect(folders[0].expanded).toBe(false);
    expect(container.innerHTML).toBe(before);
    expect(tabsCreate()).not.toHaveBeenCalled();
  });
});
