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
 * 複数選択したブックマークをドラッグしたときの、一括移動と一括並び替え。
 *
 * multi-select-order.test.ts が「選んだ順のまま並ぶ」「元に戻すで元の並びに戻る」の基本を
 * 確かめているので、ここではその周辺を確かめる。
 *
 * - 選択のうち動かさないもの（移動先に既にある項目、ドロップ先そのもの、見つからない項目）
 * - 2 つのフォルダにまたがる選択
 * - 選択していない項目を掴んだとき
 * - 途中で失敗したとき
 *
 * chrome.bookmarks は並び順を持つ代役（helpers/fake-bookmarks）で、確かめるのは
 * 操作の後・「元に戻す」の後のフォルダの並びと、画面に出る文言。
 * 操作は本物のレンダラが描いた一覧の上で、クリックとドラッグのイベントで行う。
 */
describe('複数選択したブックマークのドラッグ', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let dnd: BookmarkDragAndDrop;
  let selection: BookmarkSelection;
  let bookmarks: FakeBookmarks;
  let listenerErrors: string[];

  const url = (name: string) => `https://${name}.example.com/`;
  const WORK = '10';
  const HOBBY = '11';
  const ARCHIVE = '12';

  // 画面の上から 仕事 [A B C D] / 趣味 [X Y] / 保管 [Z] の順に並ぶ
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
      bookmarks: [
        { id: '111', title: 'X', url: url('x'), favicon: null },
        { id: '112', title: 'Y', url: url('y'), favicon: null },
      ],
    },
    {
      id: ARCHIVE,
      title: '保管',
      expanded: true,
      subfolders: [],
      bookmarks: [{ id: '121', title: 'Z', url: url('z'), favicon: null }],
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

  function selectedIds(): string[] {
    return Array.from(
      container.querySelectorAll('.bookmark-item.selected')
    ).map((el) => el.getAttribute('data-bookmark-id') ?? '');
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

  /** source を掴んで、フォルダのヘッダへ落とす。 */
  function dragToFolder(source: string, folderId: string): void {
    drag('dragstart', titleOf(source));
    drag('dragover', folderHeader(folderId));
    drag('drop', folderHeader(folderId));
  }

  const BEFORE = 385;
  const AFTER = 415;

  /**
   * source を掴んで、target のブックマークの前（BEFORE）か後ろ（AFTER）へ落とす。
   * happy-dom はレイアウトを持たないので target を top=380・高さ 40 に置く。
   * clientY 385 は上半分、415 は下半分。
   */
  function dragOnto(source: string, target: string, clientY: number): void {
    item(target).getBoundingClientRect = () =>
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
    drag('dragstart', titleOf(source));
    drag('dragover', titleOf(target), clientY);
    drag('drop', titleOf(target), clientY);
  }

  function toastText(): string | undefined {
    return document
      .querySelector('[role="status"] .app-toast-message')
      ?.textContent?.trim();
  }

  function undo(): void {
    const button = Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="status"] button')
    ).find((b) => b.textContent?.trim() === '元に戻す');
    expect(button).toBeDefined();
    button?.click();
  }

  function errorDialogText(): string | undefined {
    return document.getElementById('error-dialog')?.textContent ?? undefined;
  }

  /**
   * chrome.bookmarks.get が id のノードを「親フォルダ無し」で返すようにする。
   *
   * 型の上では parentId は省略できる（実際の Chrome ではルートのノードだけ）。
   * 親が分からない項目が選択に混ざっても操作全体が失敗しないことを確かめるために使う。
   */
  function hideParentOf(id: string): void {
    const get = chrome.bookmarks.get as unknown as ReturnType<typeof vi.fn>;
    const real = get.getMockImplementation() as (
      id: string
    ) => Promise<chrome.bookmarks.BookmarkTreeNode[]>;
    get.mockImplementation(async (requested: string) =>
      (await real(requested)).map((node) =>
        node.id === id ? { ...node, parentId: undefined } : node
      )
    );
  }

  describe('フォルダのヘッダへ落として移動する', () => {
    it('選択した全件が、選んだ順で移動先の末尾に入り、元のフォルダには残りが並ぶ', async () => {
      selectRange('102', '103');
      expect(selectedIds()).toEqual(['102', '103']);

      dragToFolder('102', HOBBY);

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを移動しました');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'Y', 'B', 'C']);
      expect(bookmarks.titles(WORK)).toEqual(['A', 'D']);
      expect(errorDialogText()).toBeUndefined();
      expect(listenerErrors).toEqual([]);
    });

    it('2 つのフォルダにまたがる選択を移したあと「元に戻す」で、どちらのフォルダも元の並びに戻る', async () => {
      // 仕事の末尾 D から、趣味の先頭 X までを選択する
      selectRange('104', '111');
      expect(selectedIds()).toEqual(['104', '111']);
      dragToFolder('104', ARCHIVE);
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを移動しました');
      });
      expect(bookmarks.titles(ARCHIVE)).toEqual(['Z', 'D', 'X']);
      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C']);
      expect(bookmarks.titles(HOBBY)).toEqual(['Y']);

      undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(ARCHIVE)).toEqual(['Z']);
      });
      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'Y']);
      expect(listenerErrors).toEqual([]);
    });

    it('移動先のフォルダに既にある選択項目は動かさず、並びも変えない (#105)', async () => {
      // 仕事の D と、移動先（趣味）に既にある X を選択して、D を掴んで趣味へ落とす
      selectRange('104', '111');
      expect(selectedIds()).toEqual(['104', '111']);

      dragToFolder('104', HOBBY);

      // 動かしたのは D の 1 件だけ。X は先頭のまま（動かすと末尾へ回ってしまう）
      await vi.waitFor(() => {
        expect(toastText()).toBe('1 件のブックマークを移動しました');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'Y', 'D']);
      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C']);

      undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'Y']);
      expect(listenerErrors).toEqual([]);
    });

    it('掴んだ項目が既に移動先のフォルダにあるときは、選択中の他の項目も含めて何も移動しない', async () => {
      // 仕事の D と趣味の X を選択し、趣味にある X を掴んで、趣味のヘッダへ落とす
      selectRange('104', '111');
      expect(selectedIds()).toEqual(['104', '111']);

      dragToFolder('111', HOBBY);
      // 移動が始まっていれば終わるだけの時間を待つ
      await new Promise((r) => setTimeout(r, 20));

      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'Y']);
      expect(document.querySelector('[role="status"]')).toBeNull();
      expect(errorDialogText()).toBeUndefined();
      expect(listenerErrors).toEqual([]);
    });

    it('選択していない項目を掴んだときは、その 1 件だけを移動する', async () => {
      selectRange('101', '102');
      expect(selectedIds()).toEqual(['101', '102']);

      dragToFolder('104', HOBBY);

      await vi.waitFor(() => {
        expect(toastText()).toBe('「D」を移動しました');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'Y', 'D']);
      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C']);
      expect(listenerErrors).toEqual([]);
    });

    it('選択した項目の一部が別の場所で削除されていても、残りを移動し、無かった分を失敗として知らせる', async () => {
      selectRange('101', '102');
      // B は、ドロップの直前に別のウィンドウで削除されていた
      bookmarks.removeBehindTheScenes('102');

      dragToFolder('101', HOBBY);

      await vi.waitFor(() => {
        expect(toastText()).toBe('1 件を移動しました（1 件は失敗）');
      });
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'Y', 'A']);
      expect(bookmarks.titles(WORK)).toEqual(['C', 'D']);
      expect(errorDialogText()).toBeUndefined();
      expect(listenerErrors).toEqual([]);
    });

    it('親フォルダが分からない項目が混ざっていても移動でき、「元に戻す」は親の分かる項目を元の並びに戻す', async () => {
      selectRange('104', '111');
      hideParentOf('111');

      dragToFolder('104', ARCHIVE);

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを移動しました');
      });
      expect(bookmarks.titles(ARCHIVE)).toEqual(['Z', 'D', 'X']);
      expect(errorDialogText()).toBeUndefined();

      undo();

      // D は元の位置へ戻る。X は戻り先が分からないので移動先に残る
      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
      expect(bookmarks.titles(ARCHIVE)).toEqual(['Z', 'X']);
      expect(bookmarks.titles(HOBBY)).toEqual(['Y']);
      expect(listenerErrors).toEqual([]);
    });

    it('全件の移動に失敗したら、件数つきで失敗を知らせ、「元に戻す」は出さない', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      selectRange('101', '102');
      (
        chrome.bookmarks.move as unknown as ReturnType<typeof vi.fn>
      ).mockRejectedValue(new Error('move failed'));

      dragToFolder('101', HOBBY);

      await vi.waitFor(() => {
        expect(errorDialogText()).toContain(
          '2 件のブックマークを移動できませんでした。'
        );
      });
      expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      expect(bookmarks.titles(HOBBY)).toEqual(['X', 'Y']);
      expect(document.querySelector('[role="status"]')).toBeNull();
      // 失敗の原因（move が投げたエラー）がコンソールに残る
      expect(
        errorSpy.mock.calls.some((args) =>
          args.some(
            (arg) => arg instanceof Error && arg.message === 'move failed'
          )
        )
      ).toBe(true);
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('ブックマークの前後へ落として並び替える', () => {
    it('ドロップ先そのものが選択に含まれていても、ドロップ先は動かさず、残りをその後ろに選んだ順で並べる (#105)', async () => {
      selectRange('101', '103');
      expect(selectedIds()).toEqual(['101', '102', '103']);

      dragOnto('101', '103', AFTER);

      // 動かしたのは A・B の 2 件。C は基準なので数えない
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles(WORK)).toEqual(['C', 'A', 'B', 'D']);
      expect(errorDialogText()).toBeUndefined();
      expect(listenerErrors).toEqual([]);
    });

    it('選択した項目の一部が別の場所で削除されていても、残りを並び替え、無かった分を失敗として知らせる (#105)', async () => {
      selectRange('101', '102');
      // 掴んだ A 自身が、ドロップの直前に別のウィンドウで削除されていた
      bookmarks.removeBehindTheScenes('101');

      dragOnto('101', '103', AFTER);

      await vi.waitFor(() => {
        expect(toastText()).toBe('1 件を並び替えました（1 件は失敗）');
      });
      expect(bookmarks.titles(WORK)).toEqual(['C', 'B', 'D']);
      expect(errorDialogText()).toBeUndefined();
      expect(listenerErrors).toEqual([]);
    });

    it('親フォルダが分からない項目が混ざっていても並び替えでき、「元に戻す」は親の分かる項目を元の並びに戻す (#105)', async () => {
      selectRange('104', '111');
      hideParentOf('111');

      dragOnto('104', '121', BEFORE);

      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles(ARCHIVE)).toEqual(['D', 'X', 'Z']);
      expect(errorDialogText()).toBeUndefined();

      undo();

      // D は元の位置へ戻る。X は戻り先が分からないので移動先に残る
      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['A', 'B', 'C', 'D']);
      });
      expect(bookmarks.titles(ARCHIVE)).toEqual(['X', 'Z']);
      expect(bookmarks.titles(HOBBY)).toEqual(['Y']);
      expect(listenerErrors).toEqual([]);
    });

    it('並び替えたあとに 1 件が別の場所で削除されていても、「元に戻す」は残りを元の並びに戻す', async () => {
      selectRange('101', '102');
      dragOnto('101', '104', AFTER);
      await vi.waitFor(() => {
        expect(toastText()).toBe('2 件のブックマークを並び替えました');
      });
      expect(bookmarks.titles(WORK)).toEqual(['C', 'D', 'A', 'B']);
      bookmarks.removeBehindTheScenes('101');

      undo();

      await vi.waitFor(() => {
        expect(bookmarks.titles(WORK)).toEqual(['B', 'C', 'D']);
      });
      expect(errorDialogText()).toBeUndefined();
      expect(listenerErrors).toEqual([]);
    });
  });
});
