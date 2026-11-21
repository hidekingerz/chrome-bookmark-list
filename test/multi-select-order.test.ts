import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
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
 * 複数のブックマークをまとめて操作したあとの「並び順」を確かめる。
 *
 * chrome.bookmarks は並び順を持つ代役（helpers/fake-bookmarks）に差し替え、
 * 呼び出しの列ではなく、操作の後・「元に戻す」の後にフォルダの中がどう並んでいるかを見る。
 * 操作は本物のレンダラが描いた一覧の上で、クリックとドラッグのイベントで行う。
 */
describe('複数のブックマークをまとめて操作したあとの並び順', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let dnd: BookmarkDragAndDrop;
  let selection: BookmarkSelection;
  let bookmarks: FakeBookmarks;
  let listenerErrors: string[];
  let changedActions: string[];

  const url = (name: string) => `https://${name}.example.com/`;
  const WORK = '10';
  const HOBBY = '11';

  const folders: BookmarkFolder[] = [
    {
      id: WORK,
      title: '仕事',
      expanded: true,
      subfolders: [],
      bookmarks: [
        { id: '101', title: 'A', url: url('a'), favicon: null },
        { id: '102', title: 'B', url: url('b'), favicon: null },
        { id: '103', title: 'C', url: url('c'), favicon: null },
        { id: '104', title: 'D', url: url('d'), favicon: null },
      ],
    },
    {
      id: HOBBY,
      title: '趣味',
      expanded: true,
      subfolders: [],
      bookmarks: [{ id: '111', title: 'X', url: url('x'), favicon: null }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    listenerErrors = [];
    win.addEventListener('error', (e) => {
      listenerErrors.push((e as unknown as ErrorEvent).message);
    });

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
    dnd = new BookmarkDragAndDrop();
    dnd.initialize();
    dnd.makeBookmarksDraggable();

    changedActions = [];
    document.addEventListener('bookmarks-changed', (e) => {
      changedActions.push((e as CustomEvent).detail.action);
    });
  });

  afterEach(() => {
    document.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    dnd.destroy();
    selection.clear();
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    vi.restoreAllMocks();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function item(bookmarkId: string): HTMLElement {
    return container.querySelector(
      `.bookmark-item[data-bookmark-id="${bookmarkId}"]`
    ) as HTMLElement;
  }

  function titleOf(bookmarkId: string): HTMLElement {
    return item(bookmarkId).querySelector('.bookmark-title') as HTMLElement;
  }

  function folderHeader(folderId: string): HTMLElement {
    return container.querySelector(
      `[data-folder-id="${folderId}"] > .folder-header`
    ) as HTMLElement;
  }

  /** first をクリックして起点にし、last を Shift+クリックして、その間をすべて選択する。 */
  function selectRange(first: string, last: string): void {
    titleOf(first).dispatchEvent(
      new win.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }) as unknown as Event
    );
    titleOf(last).dispatchEvent(
      new win.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
      }) as unknown as Event
    );
  }

  /** happy-dom の DragEvent は clientY と dataTransfer を受け取らないので MouseEvent で代用する。 */
  function drag(type: string, target: HTMLElement, clientY = 400): void {
    const event = new win.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientY,
    }) as unknown as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        setData: vi.fn(),
        setDragImage: vi.fn(),
        effectAllowed: 'uninitialized',
        dropEffect: 'none',
      },
    });
    target.dispatchEvent(event);
  }

  /** 項目を top=380・高さ 40 に置く。clientY 385 は上半分（前へ）、415 は下半分（後ろへ）。 */
  function placeAt380(bookmarkId: string): void {
    item(bookmarkId).getBoundingClientRect = () =>
      ({
        top: 380,
        height: 40,
        bottom: 420,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: 380,
        toJSON() {},
      }) as DOMRect;
  }
  const BEFORE = 385;
  const AFTER = 415;

  function dragOnto(source: string, target: string, clientY: number): void {
    placeAt380(target);
    drag('dragstart', titleOf(source));
    drag('dragover', titleOf(target), clientY);
    drag('drop', titleOf(target), clientY);
  }

  function errorMessage(): string | undefined {
    return document
      .querySelector('#error-dialog .error-message')
      ?.textContent?.trim();
  }

  let realMove: ((...args: unknown[]) => Promise<unknown>) | undefined;

  /** 指定した id の move だけ失敗させる。それ以外は代役がそのまま動かす。 */
  function failMoveOf(...ids: string[]): void {
    const move = chrome.bookmarks.move as unknown as ReturnType<typeof vi.fn>;
    realMove = move.getMockImplementation() as (
      ...args: unknown[]
    ) => Promise<unknown>;
    const original = realMove;
    move.mockImplementation((id: string, ...rest: unknown[]) =>
      ids.includes(id)
        ? Promise.reject(new Error('boom'))
        : original(id, ...rest)
    );
  }

  function restoreMove(): void {
    if (!realMove) return;
    (
      chrome.bookmarks.move as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(realMove);
  }

  function toastText(): string | undefined {
    return document
      .querySelector('[role="status"] .app-toast-message')
      ?.textContent?.trim();
  }

  async function undo(): Promise<void> {
    const button = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="status"] button')
    ).find((b) => b.textContent?.trim() === '元に戻す');
    expect(button).toBeDefined();
    button?.click();
  }

  function toolbarButton(className: string): HTMLButtonElement {
    return document.querySelector(
      `[role="toolbar"] .${className}`
    ) as HTMLButtonElement;
  }

  describe('ツールバーの「移動」で別のフォルダへ移したとき', () => {
    async function moveSelectionTo(folderId: string): Promise<void> {
      toolbarButton('selection-toolbar-move').click();
      await vi.waitFor(() => {
        expect(document.getElementById('bulk-move-parent')).not.toBeNull();
      });
      (document.getElementById('bulk-move-parent') as HTMLSelectElement).value =
        folderId;
      (
        document.querySelector('.bulk-move-confirm') as HTMLButtonElement
      ).click();
    }

    it('「元に戻す」で、元のフォルダの元の並びに戻る', async () => {
      selectRange('101', '102');
      await moveSelectionTo(HOBBY);
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを移動しました');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'A', 'B']);
      expect(bookmarks.titles(WORK)).toEqual(['C', 'D']);

      await undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(HOBBY)).toEqual(['X']);
      });
      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('複数選択をフォルダのヘッダへドラッグして移したとき', () => {
    it('「元に戻す」で、元のフォルダの元の並びに戻る', async () => {
      selectRange('101', '102');
      drag('dragstart', titleOf('101'));
      drag('dragover', folderHeader(HOBBY));
      drag('drop', folderHeader(HOBBY));
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを移動しました');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'A', 'B']);

      await undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(HOBBY)).toEqual(['X']);
      });
      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('複数選択をフォルダのヘッダへドラッグして移す途中で失敗したとき', () => {
    function dropOnHobbyHeader(source: string): void {
      drag('dragstart', titleOf(source));
      drag('dragover', folderHeader(HOBBY));
      drag('drop', folderHeader(HOBBY));
    }

    it('途中の 1 件が失敗しても残りを移し、失敗した件数を知らせる。「元に戻す」で元の並びに戻る', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      failMoveOf('102');
      selectRange('101', '103');

      dropOnHobbyHeader('101');

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件を移動しました（1 件は失敗）');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'A', 'C']);
      expect(bookmarks.titles(WORK)).toEqual(['B', 'D']);
      expect(errorMessage()).toBeUndefined();
      expect(changedActions).toContain('move');

      restoreMove();
      await undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X']);
    });

    it('動かす前の準備（元の並びの控え）に失敗したら、何も移さず、「エラー」ダイアログで知らせる', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      (
        chrome.bookmarks.getChildren as unknown as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('boom'));
      selectRange('101', '102');

      dropOnHobbyHeader('101');

      await vi.waitFor(() => {
        expect(errorMessage()).toBe('❌ ブックマークの移動に失敗しました。');
      });
      expect(toastText()).toBeUndefined();
      expect(bookmarks.ids(WORK)).toEqual(['101', '102', '103', '104']);
    });

    it('全件が失敗したら、何も移さず、「エラー」ダイアログで件数を知らせる', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      failMoveOf('101', '102');
      selectRange('101', '102');

      dropOnHobbyHeader('101');

      await vi.waitFor(() => {
        expect(errorMessage()).toBe(
          '❌ 2 件のブックマークを移動できませんでした。'
        );
      });
      expect(toastText()).toBeUndefined();
      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('選んだ項目がすべて別の場所で削除されていたら、「エラー」ダイアログで知らせる', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      selectRange('101', '102');
      bookmarks.removeBehindTheScenes('101');
      bookmarks.removeBehindTheScenes('102');

      dropOnHobbyHeader('101');

      await vi.waitFor(() => {
        expect(errorMessage()).toBe(
          '❌ 2 件のブックマークを移動できませんでした。'
        );
      });
      expect(toastText()).toBeUndefined();
      expect(bookmarks.titles(HOBBY)).toEqual(['X']);
    });
  });

  describe('ツールバーの「削除」でまとめて削除したとき', () => {
    it('「元に戻す」で、元の並びのまま作り直される', async () => {
      selectRange('101', '102');
      toolbarButton('selection-toolbar-delete').click();
      await vi.waitFor(() => {
        expect(document.querySelector('.delete-dialog-confirm')).not.toBeNull();
      });
      (
        document.querySelector('.delete-dialog-confirm') as HTMLButtonElement
      ).click();
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを削除しました');
      });
      expect(bookmarks.titles(WORK)).toEqual(['C', 'D']);

      await undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('複数選択を同じフォルダの中で並び替えたとき', () => {
    it('後ろへ（A・B を D の後ろへ）動かすと、選んだ順のまま D の後ろに並ぶ', async () => {
      selectRange('101', '102');
      dragOnto('101', '104', AFTER);

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles(WORK)).toEqual(['C', 'D', 'A', 'B']);
      expect(document.getElementById('error-dialog')).toBeNull();
      expect(listenerErrors).toEqual([]);
    });

    it('後ろへ動かしたあと「元に戻す」で、元の並びに戻る', async () => {
      selectRange('101', '102');
      dragOnto('101', '104', AFTER);
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });

      await undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
    });

    it('途中へ（A・B を C の後ろへ）動かすと、C と D の間に並ぶ', async () => {
      selectRange('101', '102');
      dragOnto('101', '103', AFTER);

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles(WORK)).toEqual(['C', 'A', 'B', 'D']);
    });

    it('前へ（C・D を A の前へ）動かすと、選んだ順のまま A の前に並ぶ', async () => {
      selectRange('103', '104');
      dragOnto('103', '101', BEFORE);

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles(WORK)).toEqual(['C', 'D', 'A', 'B']);
    });

    it('前へ動かしたあと「元に戻す」で、元の並びに戻る', async () => {
      selectRange('103', '104');
      dragOnto('103', '101', BEFORE);
      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['C', 'D', 'A', 'B']);
      });

      await undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
    });
  });

  describe('複数選択を別のフォルダのブックマークの前後へ並び替えたとき', () => {
    it('選んだ項目がすべて別の場所で削除されていたら、何も並び替えず、「エラー」ダイアログで知らせる', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      selectRange('102', '103');
      bookmarks.removeBehindTheScenes('102');
      bookmarks.removeBehindTheScenes('103');

      dragOnto('102', '111', BEFORE);

      await vi.waitFor(() => {
        expect(errorMessage()).toBe(
          '❌ 2 件のブックマークを並び替えられませんでした。'
        );
      });
      expect(toastText()).toBeUndefined();
      expect(bookmarks.titles(HOBBY)).toEqual(['X']);
      expect(bookmarks.titles(WORK)).toEqual(['A', 'D']);
      expect(listenerErrors).toEqual([]);
    });

    it('並び替えの途中の 1 件が失敗しても残りを並び替え、失敗した件数を知らせる。「元に戻す」で元の並びに戻る', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      failMoveOf('103');
      selectRange('102', '104');

      dragOnto('102', '111', BEFORE);

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件を並び替えました（1 件は失敗）');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['B', 'D', 'X']);
      expect(bookmarks.titles(WORK)).toEqual(['A', 'C']);
      expect(errorMessage()).toBeUndefined();
      expect(changedActions).toContain('move');

      restoreMove();
      await undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X']);
    });

    it('X の前へ動かすと選んだ順で X の前に並び、「元に戻す」で両方のフォルダが元の並びに戻る', async () => {
      selectRange('102', '103');
      dragOnto('102', '111', BEFORE);
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['B', 'C', 'X']);
      expect(bookmarks.titles(WORK)).toEqual(['A', 'D']);

      await undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X']);
    });

    it('X の後ろへ動かすと、選んだ順で X の後ろに並ぶ', async () => {
      selectRange('102', '103');
      dragOnto('102', '111', AFTER);
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'B', 'C']);
    });
  });
});
