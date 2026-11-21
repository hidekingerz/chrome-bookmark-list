import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { BookmarkSelection } from '../src/components/BookmarkSelection/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';
import type { BookmarkFolder } from '../src/types/bookmark';
import {
  type FakeBookmarks,
  installFakeBookmarks,
} from './helpers/fake-bookmarks';

/**
 * 同じ URL のブックマークが 2 件あるときの複数選択。
 *
 * 選択はブックマークごと（Chrome のノード ID）に持つ。同じ URL でも別のブックマークで、
 * 一覧が描き直されても、選んだブックマークが選ばれたままになること。
 */
describe('同じ URL のブックマークが 2 件あるときの複数選択', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let selection: BookmarkSelection;
  let bookmarks: FakeBookmarks;

  const SAME = 'https://same.example.com/';
  const WORK = '10';
  const HOBBY = '11';

  const folders: BookmarkFolder[] = [
    {
      id: WORK,
      title: '仕事',
      expanded: true,
      subfolders: [],
      bookmarks: [
        { id: '101', title: 'A', url: 'https://a.example.com/', favicon: null },
        { id: '104', title: '仕事の同じ', url: SAME, favicon: null },
      ],
    },
    {
      id: HOBBY,
      title: '趣味',
      expanded: true,
      subfolders: [],
      bookmarks: [{ id: '111', title: '趣味の同じ', url: SAME, favicon: null }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    bookmarks = installFakeBookmarks([
      {
        id: '1',
        title: 'ブックマークバー',
        children: folders.map((folder) => ({
          id: folder.id,
          title: folder.title,
          children: folder.bookmarks.map((b) => ({
            id: b.id as string,
            title: b.title,
            url: b.url,
          })),
        })),
      },
    ]);

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
    document.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    selection.clear();
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function clickTitle(bookmarkId: string, shiftKey: boolean): void {
    (
      container.querySelector(
        `.bookmark-item[data-bookmark-id="${bookmarkId}"] .bookmark-title`
      ) as HTMLElement
    ).dispatchEvent(
      new win.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey,
      }) as unknown as Event
    );
  }

  function highlightedIds(): (string | null)[] {
    return Array.from(
      container.querySelectorAll('.bookmark-item.selected')
    ).map((el) => el.getAttribute('data-bookmark-id'));
  }

  /** 別の操作で一覧が描き直された（newtab.ts が再描画のたびに行うのと同じ手順）。 */
  function rerender(): void {
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
    selection.refresh(container);
  }

  async function deleteSelection(): Promise<void> {
    (
      document.querySelector(
        '[role="toolbar"] .selection-toolbar-delete'
      ) as HTMLElement
    ).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.delete-dialog-confirm')).not.toBeNull();
    });
    (document.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.app-toast-message')).not.toBeNull();
    });
  }

  it('片方だけを選ぶと、同じ URL のもう片方はハイライトされない', () => {
    clickTitle('111', true);

    expect(highlightedIds()).toEqual(['111']);
    expect(selection.count).toBe(1);
  });

  it('一覧が描き直されても、選んだ側がハイライトされたままになる', () => {
    clickTitle('111', true);

    rerender();

    expect(highlightedIds()).toEqual(['111']);
    expect(selection.count).toBe(1);
  });

  it('一覧が描き直された後に一括削除しても、選んだ側だけが削除される', async () => {
    clickTitle('111', true);
    rerender();

    await deleteSelection();

    expect(bookmarks.titles(HOBBY)).toEqual([]);
    expect(bookmarks.titles(WORK)).toEqual(['A', '仕事の同じ']);
  });

  it('一覧が描き直された後に一括移動しても、選んだ側だけが移動する', async () => {
    clickTitle('111', true);
    rerender();

    (
      document.querySelector(
        '[role="toolbar"] .selection-toolbar-move'
      ) as HTMLElement
    ).click();
    await vi.waitFor(() => {
      expect(document.getElementById('bulk-move-parent')).not.toBeNull();
    });
    // 移動先はブックマークバー (1)
    (document.getElementById('bulk-move-parent') as HTMLSelectElement).value =
      '1';
    (document.querySelector('.bulk-move-confirm') as HTMLElement).click();
    await vi.waitFor(() => {
      expect(document.querySelector('.app-toast-message')).not.toBeNull();
    });

    expect(bookmarks.titles('1')).toEqual(['[仕事]', '[趣味]', '趣味の同じ']);
    expect(bookmarks.titles(HOBBY)).toEqual([]);
    expect(bookmarks.titles(WORK)).toEqual(['A', '仕事の同じ']);
  });

  it('同じ URL の 2 件をまたいで範囲選択すると、2 件を別々に数え、両方を削除できる', async () => {
    clickTitle('101', false);
    clickTitle('111', true);

    expect(highlightedIds()).toEqual(['101', '104', '111']);
    expect(selection.count).toBe(3);
    expect(
      document.querySelector('[role="toolbar"] .selection-toolbar-count')
        ?.textContent
    ).toBe('3 件選択中');

    await deleteSelection();

    expect(bookmarks.titles(WORK)).toEqual([]);
    expect(bookmarks.titles(HOBBY)).toEqual([]);
  });
});
