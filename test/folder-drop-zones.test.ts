import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';
import type { BookmarkFolder } from '../src/types/bookmark';
import {
  type FakeBookmarks,
  installFakeBookmarks,
} from './helpers/fake-bookmarks';

/**
 * フォルダを別のフォルダのヘッダへドロップするときの、ドロップ位置の判定。
 *
 * ヘッダの上側 40% は「前へ並び替え」、中央 20% は「サブフォルダにする」、
 * 下側 40% は「後ろへ並び替え」。境界 (40%・60%) の 1% 内側と外側にドロップして、
 * 結果のフォルダの並びと親子、ドラッグ中の目印を確かめる。
 *
 * chrome.bookmarks は並び順を持つ代役（helpers/fake-bookmarks）。
 * 操作は本物のレンダラが描いた一覧の上で、ドラッグのイベントで行う。
 */
describe('フォルダをフォルダのヘッダへドロップする位置', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let dnd: BookmarkDragAndDrop;
  let bookmarks: FakeBookmarks;
  let listenerErrors: string[];

  const BAR = '1';
  const ALPHA = '10';
  const BRAVO = '11';
  const CHARLIE = '12';

  // ブックマークバーの下に Alpha / Bravo / Charlie の順で並ぶ。それぞれブックマークを 1 件持つ
  const folders: BookmarkFolder[] = [
    [ALPHA, 'Alpha', 'a'],
    [BRAVO, 'Bravo', 'b'],
    [CHARLIE, 'Charlie', 'c'],
  ].map(([id, title, name]) => ({
    id,
    title,
    expanded: true,
    subfolders: [],
    bookmarks: [
      {
        id: `${id}1`,
        title: name,
        url: `https://${name}.example.com/`,
        favicon: null,
      },
    ],
  }));

  // ドロップ先のヘッダは top=200・高さ 100。上から 40% は y=240、60% は y=260
  const HEADER_TOP = 200;
  const HEADER_HEIGHT = 100;
  const yAt = (percent: number) => HEADER_TOP + (HEADER_HEIGHT * percent) / 100;

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
        id: BAR,
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

    dnd = new BookmarkDragAndDrop();
    dnd.initialize();
  });

  afterEach(() => {
    document.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    dnd.destroy();
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    vi.restoreAllMocks();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function header(folderId: string): HTMLElement {
    return container.querySelector(
      `[data-folder-id="${folderId}"] > .folder-header`
    ) as HTMLElement;
  }

  /** happy-dom の DragEvent は clientY と dataTransfer を受け取らないので MouseEvent で代用する。 */
  function drag(type: string, target: HTMLElement, clientY: number): DragEvent {
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

  /** happy-dom はレイアウトを持たないので、ドロップ先のヘッダの位置と高さを決めておく。 */
  function placeHeader(folderId: string): void {
    header(folderId).getBoundingClientRect = () =>
      ({
        top: HEADER_TOP,
        height: HEADER_HEIGHT,
        bottom: HEADER_TOP + HEADER_HEIGHT,
        left: 0,
        right: 300,
        width: 300,
        x: 0,
        y: HEADER_TOP,
        toJSON() {},
      }) as DOMRect;
  }

  /** source のヘッダを掴み、target のヘッダの上から percent% の位置まで運ぶ（まだ落とさない）。 */
  function carryOver(source: string, target: string, percent: number): void {
    placeHeader(target);
    drag('dragstart', header(source), 400);
    const over = drag('dragover', header(target), yAt(percent));
    // ドロップできる位置では、ブラウザにドロップを許可させる
    expect(over.defaultPrevented).toBe(true);
  }

  function dropAt(target: string, percent: number): void {
    drag('drop', header(target), yAt(percent));
  }

  /** ドラッグ中にドロップ先のヘッダへ付いている目印。 */
  function marks(folderId: string) {
    const classes = header(folderId).classList;
    return {
      before: classes.contains('drop-zone-before'),
      into: classes.contains('drop-target-highlight'),
      after: classes.contains('drop-zone-after'),
    };
  }

  function toastText(): string | undefined {
    return document
      .querySelector('[role="status"] .app-toast-message')
      ?.textContent?.trim();
  }

  describe('上側 40%（そのフォルダの前へ並び替え）', () => {
    it('上から 39% の位置は「前へ」。Charlie を Alpha に落とすと Alpha の前に並ぶ', async () => {
      carryOver(CHARLIE, ALPHA, 39);
      expect(marks(ALPHA)).toEqual({ before: true, into: false, after: false });

      dropAt(ALPHA, 39);

      await vi.waitFor(() => {
        expect(toastText()).toBe('フォルダ「Charlie」を並び替えました');
      });
      expect(bookmarks.titles(BAR)).toEqual([
        '[Charlie]',
        '[Alpha]',
        '[Bravo]',
      ]);
      expect(bookmarks.titles(ALPHA)).toEqual(['a']);
      expect(listenerErrors).toEqual([]);
    });

    it('ヘッダの上端 (0%) も「前へ」', async () => {
      carryOver(CHARLIE, ALPHA, 0);
      expect(marks(ALPHA)).toEqual({ before: true, into: false, after: false });

      dropAt(ALPHA, 0);

      await vi.waitFor(() => {
        expect(bookmarks.titles(BAR)).toEqual([
          '[Charlie]',
          '[Alpha]',
          '[Bravo]',
        ]);
      });
    });
  });

  describe('中央 20%（そのフォルダのサブフォルダにする）', () => {
    it('上から 41% の位置は「中へ」。Charlie を Alpha に落とすと Alpha のサブフォルダになる', async () => {
      carryOver(CHARLIE, ALPHA, 41);
      expect(marks(ALPHA)).toEqual({ before: false, into: true, after: false });

      dropAt(ALPHA, 41);

      await vi.waitFor(() => {
        expect(toastText()).toBe('フォルダ「Charlie」を移動しました');
      });
      expect(bookmarks.titles(BAR)).toEqual(['[Alpha]', '[Bravo]']);
      expect(bookmarks.titles(ALPHA)).toEqual(['a', '[Charlie]']);
      expect(listenerErrors).toEqual([]);
    });

    it('真ん中 (50%) は「中へ」', async () => {
      carryOver(CHARLIE, ALPHA, 50);
      expect(marks(ALPHA)).toEqual({ before: false, into: true, after: false });

      dropAt(ALPHA, 50);

      await vi.waitFor(() => {
        expect(bookmarks.titles(ALPHA)).toEqual(['a', '[Charlie]']);
      });
      expect(bookmarks.titles(BAR)).toEqual(['[Alpha]', '[Bravo]']);
    });

    it('上から 59% の位置も「中へ」', async () => {
      carryOver(CHARLIE, ALPHA, 59);
      expect(marks(ALPHA)).toEqual({ before: false, into: true, after: false });

      dropAt(ALPHA, 59);

      await vi.waitFor(() => {
        expect(toastText()).toBe('フォルダ「Charlie」を移動しました');
      });
      expect(bookmarks.titles(BAR)).toEqual(['[Alpha]', '[Bravo]']);
      expect(bookmarks.titles(ALPHA)).toEqual(['a', '[Charlie]']);
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('下側 40%（そのフォルダの後ろへ並び替え）', () => {
    it('上から 61% の位置は「後ろへ」。Charlie を Alpha に落とすと Alpha のすぐ後ろに並ぶ', async () => {
      carryOver(CHARLIE, ALPHA, 61);
      expect(marks(ALPHA)).toEqual({ before: false, into: false, after: true });

      dropAt(ALPHA, 61);

      await vi.waitFor(() => {
        expect(toastText()).toBe('フォルダ「Charlie」を並び替えました');
      });
      expect(bookmarks.titles(BAR)).toEqual([
        '[Alpha]',
        '[Charlie]',
        '[Bravo]',
      ]);
      expect(bookmarks.titles(ALPHA)).toEqual(['a']);
      expect(listenerErrors).toEqual([]);
    });

    it('ヘッダの下端 (100%) も「後ろへ」', async () => {
      carryOver(CHARLIE, ALPHA, 100);
      expect(marks(ALPHA)).toEqual({ before: false, into: false, after: true });

      dropAt(ALPHA, 100);

      await vi.waitFor(() => {
        expect(bookmarks.titles(BAR)).toEqual([
          '[Alpha]',
          '[Charlie]',
          '[Bravo]',
        ]);
      });
    });
  });

  it('ドラッグ中に位置を変えると、目印は今の位置のものだけになる', () => {
    placeHeader(ALPHA);
    drag('dragstart', header(CHARLIE), 400);

    drag('dragover', header(ALPHA), yAt(39));
    expect(marks(ALPHA)).toEqual({ before: true, into: false, after: false });
    drag('dragover', header(ALPHA), yAt(41));
    expect(marks(ALPHA)).toEqual({ before: false, into: true, after: false });
    drag('dragover', header(ALPHA), yAt(61));
    expect(marks(ALPHA)).toEqual({ before: false, into: false, after: true });

    // 落とさずにやめれば、何も動かない
    drag('dragend', header(CHARLIE), 400);
    expect(marks(ALPHA)).toEqual({ before: false, into: false, after: false });
    expect(bookmarks.titles(BAR)).toEqual(['[Alpha]', '[Bravo]', '[Charlie]']);
    expect(listenerErrors).toEqual([]);
  });
});
