import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { BookmarkItemRenderer } from '../src/components/BookmarkItem/BookmarkItemRenderer';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * 折りたたまれた状態 (expanded=false) のフォルダを描画したときの出力と、
 * ブックマークが 1 件も無いときのリストの出力。
 *
 * レンダラの HTML を本物の DOM に流し込み、クラス・style・クリック後の変化を確かめる。
 */
describe('折りたたまれたフォルダの描画', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;

  /** トップレベルの「仕事」の下に、ブックマークを 1 件持つ「資料」がある。 */
  function makeFolders(expanded: boolean): BookmarkFolder[] {
    return [
      {
        id: '10',
        title: '仕事',
        expanded,
        bookmarks: [],
        subfolders: [
          {
            id: '20',
            title: '資料',
            expanded: true,
            subfolders: [],
            bookmarks: [
              {
                id: '201',
                title: 'Example',
                url: 'https://example.com/',
                favicon: null,
              },
            ],
          },
        ],
      },
    ];
  }

  beforeEach(() => {
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

  function subfoldersContainer(): HTMLElement {
    return container.querySelector(
      '[data-folder-id="10"] > .subfolders-container'
    ) as HTMLElement;
  }

  it('折りたたまれたフォルダのサブフォルダ領域は、collapsed クラスと display:none で描画される', () => {
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(
      makeFolders(false)
    );

    const subfolders = subfoldersContainer();
    expect(subfolders.classList.contains('collapsed')).toBe(true);
    expect(subfolders.classList.contains('expanded')).toBe(false);
    expect(subfolders.style.display).toBe('none');
    expect(
      container
        .querySelector('[data-folder-id="10"] > .folder-header')
        ?.getAttribute('aria-expanded')
    ).toBe('false');
  });

  it('展開されたフォルダのサブフォルダ領域は、expanded クラスと display:block で描画される', () => {
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(
      makeFolders(true)
    );

    const subfolders = subfoldersContainer();
    expect(subfolders.classList.contains('expanded')).toBe(true);
    expect(subfolders.classList.contains('collapsed')).toBe(false);
    expect(subfolders.style.display).toBe('block');
  });

  it('折りたたまれて描画されたフォルダのヘッダをクリックすると、サブフォルダ領域が表示に変わる', () => {
    const folders = makeFolders(false);
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
    new BookmarkFolderEvents().setupFolderClickHandler(container, folders);
    const header = container.querySelector(
      '[data-folder-id="10"] > .folder-header'
    ) as HTMLElement;

    header.dispatchEvent(
      new win.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }) as unknown as Event
    );

    const subfolders = subfoldersContainer();
    expect(subfolders.classList.contains('expanded')).toBe(true);
    expect(subfolders.classList.contains('collapsed')).toBe(false);
    expect(subfolders.style.display).toBe('block');
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });

  describe('ブックマークのリスト', () => {
    it('ブックマークが 1 件も無いときは、展開・折りたたみのどちらでも何も出力しない', () => {
      const renderer = new BookmarkItemRenderer();

      expect(renderer.renderBookmarkList([], true)).toBe('');
      expect(renderer.renderBookmarkList([], false)).toBe('');
    });

    it('ブックマークが無いフォルダを描画しても、空のリスト要素 (ul) は作られない', () => {
      container.innerHTML = new BookmarkFolderRenderer().renderFolders(
        makeFolders(true)
      );

      // 「仕事」は直下にブックマークを持たないので、直下に ul は無い
      expect(
        container.querySelector('[data-folder-id="10"] > .bookmark-list')
      ).toBeNull();
      // 「資料」は 1 件持つので、直下に ul がある
      expect(
        container.querySelectorAll(
          '[data-folder-id="20"] > .bookmark-list > .bookmark-item'
        )
      ).toHaveLength(1);
    });
  });
});
