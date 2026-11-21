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
 * ブックマークのドラッグ&ドロップを、本物のレンダラが描いた一覧の上で確かめる。
 *
 * - ドロップせずにドラッグを終えたとき、ドロップ先の目印が残らないこと
 * - フォルダへ移動したあと「元に戻す」で元のフォルダ・元の位置へ戻すこと
 * - 複数選択をドラッグして並び替えるとき、ドロップ先のブックマークが見つからない場合の通知
 *
 * 操作は dragstart / dragover / drop / dragend のイベントとクリックで行う。
 * chrome.bookmarks は並び順を持つ代役（helpers/fake-bookmarks）で、確かめるのは
 * DOM のクラス、操作の後のフォルダの並び、Toast とエラーダイアログの文言。
 */
describe('ブックマークのドラッグ&ドロップ（本物のレンダラが描いた一覧）', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let dnd: BookmarkDragAndDrop;
  let selection: BookmarkSelection;
  let bookmarks: FakeBookmarks;
  let listenerErrors: string[];
  let changedActions: string[];

  const A = 'https://a.example.com/';
  const B = 'https://b.example.com/';
  const C = 'https://c.example.com/';
  const D = 'https://d.example.com/';

  const folders: BookmarkFolder[] = [
    {
      id: '10',
      title: '仕事',
      expanded: true,
      subfolders: [],
      bookmarks: [
        { id: '101', title: 'A', url: A, favicon: null },
        { id: '102', title: 'B', url: B, favicon: null },
        { id: '103', title: 'C', url: C, favicon: null },
      ],
    },
    {
      id: '11',
      title: '趣味',
      expanded: true,
      subfolders: [],
      bookmarks: [{ id: '111', title: 'D', url: D, favicon: null }],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    // リスナー内の例外は dispatchEvent からは投げられず、window の error イベントになる
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
    // 開いたままのエラーダイアログを閉じ、document に付いたリスナーを外す
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

  /** ドラッグの掴みどころ・落としどころになる、項目のタイトル部分。 */
  function titleOf(bookmarkId: string): HTMLElement {
    return item(bookmarkId).querySelector('.bookmark-title') as HTMLElement;
  }

  function folderHeader(folderId: string): HTMLElement {
    return container.querySelector(
      `[data-folder-id="${folderId}"] > .folder-header`
    ) as HTMLElement;
  }

  /**
   * ドラッグ系のイベントを target で起こす。
   * happy-dom の DragEvent は clientY と dataTransfer を受け取らないので、
   * MouseEvent に dataTransfer を足して代用する。
   * clientY の既定値は画面の中ほど（オートスクロールが働かない位置）。
   */
  function drag(type: string, target: HTMLElement, clientY = 400): DragEvent {
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
    return event;
  }

  /** happy-dom はレイアウトを持たないので、項目の位置と高さを決めておく。 */
  function placeAt(el: HTMLElement, top: number, height: number): void {
    el.getBoundingClientRect = () =>
      ({
        top,
        height,
        bottom: top + height,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: top,
        toJSON() {},
      }) as DOMRect;
  }

  function toastText(): string | undefined {
    return document
      .querySelector('[role="status"] .app-toast-message')
      ?.textContent?.trim();
  }

  function toastButton(label: string): HTMLButtonElement | undefined {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="status"] button')
    ).find((button) => button.textContent?.trim() === label);
  }

  describe('ドロップせずにドラッグを終えたとき', () => {
    it('別のフォルダのヘッダに付いたドロップ先の強調表示が消える', () => {
      drag('dragstart', titleOf('101'));
      const over = drag('dragover', folderHeader('11'));
      expect(over.defaultPrevented).toBe(true);
      expect(
        folderHeader('11').classList.contains('drop-target-highlight')
      ).toBe(true);

      drag('dragend', titleOf('101'));

      expect(
        folderHeader('11').classList.contains('drop-target-highlight')
      ).toBe(false);
      expect(document.body.classList.contains('dragging-bookmark')).toBe(false);
      // ドロップしていないので、どのフォルダの並びも変わらない
      expect(bookmarks.titles('10')).toEqual(['A', 'B', 'C']);
      expect(bookmarks.titles('11')).toEqual(['D']);
      expect(listenerErrors).toEqual([]);
    });

    it('ブックマークの上半分に付いた「この前に挿入」の目印が消える', () => {
      placeAt(item('103'), 380, 40);
      drag('dragstart', titleOf('101'));
      const over = drag('dragover', titleOf('103'), 385);
      expect(over.defaultPrevented).toBe(true);
      expect(item('103').classList.contains('drop-zone-before')).toBe(true);
      expect(item('103').classList.contains('drop-zone-after')).toBe(false);

      drag('dragend', titleOf('101'));

      expect(item('103').classList.contains('drop-zone-before')).toBe(false);
      expect(item('103').classList.contains('drop-zone-after')).toBe(false);
      expect(item('103').classList.contains('drop-target-invalid')).toBe(false);
      expect(listenerErrors).toEqual([]);
    });

    it('ブックマークの下半分に付いた「この後に挿入」の目印が消える', () => {
      placeAt(item('103'), 380, 40);
      drag('dragstart', titleOf('101'));
      const over = drag('dragover', titleOf('103'), 415);
      expect(over.defaultPrevented).toBe(true);
      expect(item('103').classList.contains('drop-zone-after')).toBe(true);
      expect(item('103').classList.contains('drop-zone-before')).toBe(false);

      drag('dragend', titleOf('101'));

      expect(item('103').classList.contains('drop-zone-before')).toBe(false);
      expect(item('103').classList.contains('drop-zone-after')).toBe(false);
      expect(item('103').classList.contains('drop-target-invalid')).toBe(false);
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('別のフォルダへ移動したあとの「元に戻す」', () => {
    it('移動したブックマークを、元のフォルダの元の位置へ戻し、一覧の再読み込みを通知する', async () => {
      drag('dragstart', titleOf('102'));
      drag('dragover', folderHeader('11'));
      drag('drop', folderHeader('11'));

      await vi.waitFor(() => {
        expect(toastText()).toBe('「B」を移動しました');
      });
      expect(bookmarks.titles('11')).toEqual(['D', 'B']);
      expect(bookmarks.titles('10')).toEqual(['A', 'C']);
      expect(changedActions).toEqual(['move']);

      toastButton('元に戻す')?.click();

      await vi.waitFor(() => {
        expect(changedActions).toEqual(['move', 'undo-move']);
      });
      // B は元のフォルダの、A と C の間へ戻る
      expect(bookmarks.titles('10')).toEqual(['A', 'B', 'C']);
      expect(bookmarks.titles('11')).toEqual(['D']);
      expect(document.querySelector('[role="status"]')).toBeNull();
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('複数選択したブックマークを並び替えるとき', () => {
    /** A をクリックして起点にし、B を Shift+クリックして A・B を選択する。 */
    function selectAandB(): void {
      titleOf('101').dispatchEvent(
        new win.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        }) as unknown as Event
      );
      titleOf('102').dispatchEvent(
        new win.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          shiftKey: true,
        }) as unknown as Event
      );
    }

    it('ドロップ先のブックマークが見つからなければ、何も動かさず、失敗を知らせる', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      selectAandB();
      expect(
        Array.from(container.querySelectorAll('.bookmark-item.selected')).map(
          (el) => el.getAttribute('data-bookmark-id')
        )
      ).toEqual(['101', '102']);
      // ドロップ先の D は、ドロップの直前に別の場所で削除されていた
      bookmarks.removeBehindTheScenes('111');
      placeAt(item('111'), 380, 40);

      drag('dragstart', titleOf('101'));
      drag('dragover', titleOf('111'), 385);
      drag('drop', titleOf('111'), 385);

      await vi.waitFor(() => {
        expect(document.getElementById('error-dialog')?.textContent).toContain(
          'ブックマークの並び替えに失敗しました。'
        );
      });
      // 何も動かしていない
      expect(bookmarks.titles('10')).toEqual(['A', 'B', 'C']);
      expect(bookmarks.titles('11')).toEqual([]);
      expect(changedActions).toEqual([]);
      expect(document.querySelector('[role="status"]')).toBeNull();
      // 原因はコンソールに残す（ラベルの文言までは決めない）
      expect(
        errorSpy.mock.calls.some((args) =>
          args.some((arg) => arg instanceof Error)
        )
      ).toBe(true);
      expect(listenerErrors).toEqual([]);
    });

    it('ドロップ先が見つかれば、選択した 2 件を選んだ順でドロップ先の前へ移動し、一覧の再読み込みを通知する', async () => {
      selectAandB();
      placeAt(item('111'), 380, 40);

      drag('dragstart', titleOf('101'));
      drag('dragover', titleOf('111'), 385);
      drag('drop', titleOf('111'), 385);

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles('11')).toEqual(['A', 'B', 'D']);
      expect(bookmarks.titles('10')).toEqual(['C']);
      expect(document.getElementById('error-dialog')).toBeNull();
      expect(changedActions).toEqual(['move']);
      expect(listenerErrors).toEqual([]);
    });
  });
});
