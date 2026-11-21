import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { BookmarkSelection } from '../src/components/BookmarkSelection/index';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * 複数選択のうち、次の 2 つの振る舞いを、本物のレンダラが描いた一覧で確かめる。
 *
 * - 範囲選択の起点はあるが、Shift+クリックした項目が管理中の一覧の外にある場合
 * - 一覧を描き直さずに refresh したとき、選択に対応しない古いハイライトが残らないこと
 *
 * 確かめるのは、selected クラスの付いた項目、選択件数、ツールバーの表示。
 */
describe('複数選択（本物のレンダラが描いた一覧）', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let selection: BookmarkSelection;

  const A1 = 'https://a1.example.com/';
  const A2 = 'https://a2.example.com/';
  const A3 = 'https://a3.example.com/';
  const SHARED = 'https://shared.example.com/';

  const folders: BookmarkFolder[] = [
    {
      id: '10',
      title: '仕事',
      expanded: true,
      subfolders: [],
      bookmarks: [
        { id: '101', title: 'A1', url: A1, favicon: null },
        { id: '102', title: 'A2', url: A2, favicon: null },
        { id: '103', title: 'A3', url: A3, favicon: null },
        { id: '104', title: '共有', url: SHARED, favicon: null },
      ],
    },
    {
      id: '11',
      title: '趣味',
      expanded: true,
      subfolders: [],
      // 「仕事」と同じ URL を別のフォルダにも登録している
      bookmarks: [
        { id: '111', title: '共有（控え）', url: SHARED, favicon: null },
      ],
    },
  ];

  beforeEach(() => {
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    container = document.createElement('div');
    container.id = 'bookmarkContainer';
    document.body.appendChild(container);
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);

    selection = new BookmarkSelection();
    new BookmarkFolderEvents(selection).setupFolderClickHandler(
      container,
      folders
    );
  });

  afterEach(() => {
    selection.clear();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function item(root: ParentNode, bookmarkId: string): HTMLElement {
    return root.querySelector(
      `.bookmark-item[data-bookmark-id="${bookmarkId}"]`
    ) as HTMLElement;
  }

  function click(shiftKey = false): MouseEvent {
    return new win.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      shiftKey,
    }) as unknown as MouseEvent;
  }

  /** 項目のタイトル部分を Shift+クリックする（クリックは一覧のハンドラが受ける）。 */
  function shiftClickTitle(target: HTMLElement): void {
    (target.querySelector('.bookmark-title') as HTMLElement).dispatchEvent(
      click(true)
    );
  }

  function highlightedIds(root: ParentNode = document): string[] {
    return Array.from(root.querySelectorAll('.bookmark-item.selected')).map(
      (el) => el.getAttribute('data-bookmark-id') ?? ''
    );
  }

  function toolbarCount(): string | undefined {
    return document
      .querySelector('[role="toolbar"] .selection-toolbar-count')
      ?.textContent?.trim();
  }

  it('起点があっても、一覧の外にある項目を Shift+クリックした場合は、その 1 件だけを選択する', () => {
    // 管理中の一覧 (container) とは別の場所に描かれたブックマーク
    const outside = document.createElement('div');
    outside.innerHTML = new BookmarkFolderRenderer().renderFolders([
      {
        id: '30',
        title: '検索結果',
        expanded: true,
        subfolders: [],
        bookmarks: [
          {
            id: '301',
            title: 'Z',
            url: 'https://z.example.com/',
            favicon: null,
          },
        ],
      },
    ]);
    document.body.appendChild(outside);
    const outsideItem = item(outside, '301');

    // 修飾キーなしのクリックで A2 を範囲選択の起点にする
    const anchorConsumed = selection.handleClick(
      A2,
      'A2',
      item(container, '102'),
      click()
    );
    const consumed = selection.handleClick(
      'https://z.example.com/',
      'Z',
      outsideItem,
      click(true)
    );

    expect(anchorConsumed).toBe(false);
    expect(consumed).toBe(true);
    expect(selection.getSelectedUrls()).toEqual(['https://z.example.com/']);
    expect(highlightedIds()).toEqual(['301']);
    expect(toolbarCount()).toBe('1 件選択中');
  });

  it('起点から一覧の中の項目を Shift+クリックした場合は、その間の項目をすべて選択する', () => {
    selection.handleClick(A1, 'A1', item(container, '101'), click());

    shiftClickTitle(item(container, '103'));

    expect(selection.getSelectedUrls()).toEqual([A1, A2, A3]);
    expect(highlightedIds()).toEqual(['101', '102', '103']);
    expect(toolbarCount()).toBe('3 件選択中');
  });

  it('同じ URL のブックマークが 2 件あるとき、描き直さずに refresh しても、ハイライトは選んだ 1 件に付いたまま', () => {
    // 2 件目（「趣味」側）を Shift+クリックで選択する
    shiftClickTitle(item(container, '111'));
    expect(highlightedIds()).toEqual(['111']);
    expect(selection.count).toBe(1);

    selection.refresh(container);

    expect(selection.count).toBe(1);
    // 選択はブックマークごとに持つ。同じ URL の「仕事」側 (104) へ移ったり、
    // 2 件とも付いたりはしない
    expect(highlightedIds()).toEqual(['111']);
    expect(toolbarCount()).toBe('1 件選択中');
  });

  it('選択中の項目は、描き直さずに refresh してもハイライトされたまま', () => {
    selection.handleClick(A1, 'A1', item(container, '101'), click());
    shiftClickTitle(item(container, '102'));
    expect(highlightedIds()).toEqual(['101', '102']);

    selection.refresh(container);

    expect(highlightedIds()).toEqual(['101', '102']);
    expect(selection.getSelectedUrls()).toEqual([A1, A2]);
    expect(toolbarCount()).toBe('2 件選択中');
  });
});
