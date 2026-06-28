import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

/**
 * ブックマーク (非フォルダ) DnD の未到達パスを補完するテスト。
 * - handleDragStart のガード分岐 (リンク無し / url・title・folderId 欠落 / dataTransfer 無し)
 * - ブックマーク間 reorder (#80): handleBookmarkReorderOver / handleBookmarkReorderDrop /
 *   reorderBookmark (Undo の補正分岐・例外含む)
 * - handleDragLeave の bookmark-item 分岐 / handleDrop のガード分岐
 * - moveSingleBookmark / moveMultipleBookmarks のエラー・空ヒット・undo スキップ分岐
 * - makeBookmarksDraggable / destroy
 */
describe('BookmarkDragAndDrop — ブックマーク reorder / move の未到達パス', () => {
  let dom: JSDOM;
  let dnd: BookmarkDragAndDrop;
  let alertSpy: ReturnType<typeof vi.fn>;

  /** 3 ブックマーク (A,B,C) を 1 フォルダ (f1) に、別フォルダ (f2) を並べた DOM。 */
  function buildDom(): void {
    document.body.innerHTML = `
      <div class="bookmark-container">
        <div class="bookmark-folder" data-folder-id="f1">
          <div class="folder-header"><h2>F1</h2></div>
          <ul class="bookmark-list">
            <li class="bookmark-item" data-bookmark-url="https://a.example.com" data-bookmark-title="A">
              <a class="bookmark-link" data-url="https://a.example.com"><span class="bookmark-title">A</span></a>
            </li>
            <li class="bookmark-item" data-bookmark-url="https://b.example.com" data-bookmark-title="B">
              <a class="bookmark-link" data-url="https://b.example.com"><span class="bookmark-title">B</span></a>
            </li>
            <li class="bookmark-item" data-bookmark-url="https://c.example.com" data-bookmark-title="C">
              <a class="bookmark-link" data-url="https://c.example.com"><span class="bookmark-title">C</span></a>
            </li>
          </ul>
        </div>
        <div class="bookmark-folder" data-folder-id="f2">
          <div class="folder-header"><h2>F2</h2></div>
        </div>
      </div>
    `;
  }

  function createDragEvent(
    type: string,
    target: HTMLElement,
    opts: { clientY?: number; withDataTransfer?: boolean } = {}
  ): DragEvent {
    const { clientY = 0, withDataTransfer = true } = opts;
    const event = new dom.window.Event(type, {
      bubbles: true,
      cancelable: true,
    }) as unknown as DragEvent;
    Object.defineProperty(event, 'target', { value: target });
    Object.defineProperty(event, 'clientY', { value: clientY });
    if (withDataTransfer) {
      Object.defineProperty(event, 'dataTransfer', {
        value: {
          setData: vi.fn(),
          setDragImage: vi.fn(),
          effectAllowed: '',
          dropEffect: '',
        },
        writable: true,
      });
    }
    return event;
  }

  /** 指定要素の getBoundingClientRect を top 0 / height 100 に固定する。 */
  function stubRect(el: HTMLElement): void {
    el.getBoundingClientRect = () =>
      ({
        top: 0,
        height: 100,
        bottom: 100,
        left: 0,
        right: 0,
        width: 0,
        x: 0,
        y: 0,
        toJSON() {},
      }) as DOMRect;
  }

  function link(url: string): HTMLElement {
    return document.querySelector(
      `.bookmark-link[data-url="${url}"]`
    ) as HTMLElement;
  }

  function item(url: string): HTMLElement {
    return document.querySelector(
      `.bookmark-item[data-bookmark-url="${url}"]`
    ) as HTMLElement;
  }

  const A = 'https://a.example.com';
  const B = 'https://b.example.com';
  const C = 'https://c.example.com';

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    (
      dom.window as unknown as { requestAnimationFrame: () => number }
    ).requestAnimationFrame = () => 0;
    (
      dom.window as unknown as { cancelAnimationFrame: () => void }
    ).cancelAnimationFrame = () => {};
    (dom.window as unknown as { scrollBy: () => void }).scrollBy = () => {};

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
    alertSpy = vi.fn();
    Object.defineProperty(globalThis, 'alert', {
      value: alertSpy,
      writable: true,
      configurable: true,
    });

    UndoManager.getInstance().clear();
    Toast.dismissCurrent();

    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: {
        search: ReturnType<typeof vi.fn>;
        move: ReturnType<typeof vi.fn>;
        get: ReturnType<typeof vi.fn>;
      };
    };
    const byUrl: Record<
      string,
      { id: string; parentId: string; index: number; title: string }
    > = {
      [A]: { id: 'a', parentId: 'f1', index: 0, title: 'A' },
      [B]: { id: 'b', parentId: 'f1', index: 1, title: 'B' },
      [C]: { id: 'c', parentId: 'f1', index: 2, title: 'C' },
    };
    mockChrome.bookmarks.search = vi.fn().mockImplementation(({ url }) => {
      const rec = byUrl[url as string];
      return Promise.resolve(rec ? [{ ...rec, url }] : []);
    });
    mockChrome.bookmarks.move = vi.fn().mockResolvedValue(undefined);
    mockChrome.bookmarks.get = vi.fn().mockResolvedValue([]);

    buildDom();
    dnd = new BookmarkDragAndDrop();
    dnd.initialize();
  });

  afterEach(() => {
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    dom.window.close();
    vi.clearAllMocks();
  });

  /** A のリンクから単一ドラッグを開始する。 */
  function startDragA(): void {
    document.dispatchEvent(createDragEvent('dragstart', link(A)));
  }

  // --- handleDragStart のガード分岐 ---

  it('bookmark-link でも folder-header でもない要素の dragstart は何もしない', () => {
    const container = document.querySelector(
      '.bookmark-container'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', container));
    // ドラッグ状態を示す body クラスが付かない (draggedBookmark/Folder 未設定)
    expect(document.body.classList.contains('dragging-bookmark')).toBe(false);
  });

  it('title 要素が無い bookmark-link の dragstart は早期 return する', () => {
    const li = document.createElement('li');
    li.className = 'bookmark-item';
    li.setAttribute('data-bookmark-url', 'https://no-title.example.com');
    li.innerHTML =
      '<a class="bookmark-link" data-url="https://no-title.example.com"></a>';
    (
      document.querySelector('[data-folder-id="f1"] .bookmark-list') as Element
    ).appendChild(li);

    const a = li.querySelector('.bookmark-link') as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', a));

    // title 欠落で draggedBookmark がセットされず、dragging クラスも付かない
    expect(a.classList.contains('dragging')).toBe(false);
    expect(document.body.classList.contains('dragging-bookmark')).toBe(false);
  });

  it('dataTransfer 無しの dragstart でも draggedBookmark はセットされる (setCustomDragImage 早期 return)', () => {
    document.dispatchEvent(
      createDragEvent('dragstart', link(A), { withDataTransfer: false })
    );
    // dataTransfer 無しでもドラッグ状態クラスは付く
    expect(link(A).classList.contains('dragging')).toBe(true);
    expect(document.body.classList.contains('dragging-bookmark')).toBe(true);
  });

  // --- handleBookmarkReorderOver ---

  it('別アイテム上半分の dragover で drop-zone-before が付く (valid reorder)', () => {
    startDragA();
    const target = item(C);
    stubRect(target);
    const ev = createDragEvent('dragover', target, { clientY: 10 });
    document.dispatchEvent(ev);

    expect(target.classList.contains('drop-zone-before')).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    expect(ev.dataTransfer?.dropEffect).toBe('move');
  });

  it('別アイテム下半分の dragover で drop-zone-after が付く', () => {
    startDragA();
    const target = item(C);
    stubRect(target);
    document.dispatchEvent(
      createDragEvent('dragover', target, { clientY: 90 })
    );
    expect(target.classList.contains('drop-zone-after')).toBe(true);
  });

  it('自分自身への dragover は invalid 扱い (drop-target-invalid)', () => {
    startDragA();
    const target = item(A);
    stubRect(target);
    const ev = createDragEvent('dragover', target, { clientY: 10 });
    document.dispatchEvent(ev);

    expect(target.classList.contains('drop-target-invalid')).toBe(true);
    expect(ev.dataTransfer?.dropEffect).toBe('none');
    expect(target.classList.contains('drop-zone-before')).toBe(false);
  });

  it('直後の要素への before ドロップは隣接 no-op で invalid (A→B before)', () => {
    startDragA();
    const target = item(B);
    stubRect(target);
    document.dispatchEvent(
      createDragEvent('dragover', target, { clientY: 10 })
    );
    expect(target.classList.contains('drop-target-invalid')).toBe(true);
  });

  it('直前の要素への after ドロップは隣接 no-op で invalid (B→A after)', () => {
    document.dispatchEvent(createDragEvent('dragstart', link(B)));
    const target = item(A);
    stubRect(target);
    document.dispatchEvent(
      createDragEvent('dragover', target, { clientY: 90 })
    );
    expect(target.classList.contains('drop-target-invalid')).toBe(true);
  });

  it('data-bookmark-url が無い bookmark-item の dragover は早期 return する', () => {
    startDragA();
    const li = document.createElement('li');
    li.className = 'bookmark-item';
    (
      document.querySelector('[data-folder-id="f1"] .bookmark-list') as Element
    ).appendChild(li);
    stubRect(li);
    // 例外なく no-op で返る (クラスが付かない)
    document.dispatchEvent(createDragEvent('dragover', li, { clientY: 10 }));
    expect(li.classList.contains('drop-zone-before')).toBe(false);
    expect(li.classList.contains('drop-target-invalid')).toBe(false);
  });

  // --- handleDragLeave (bookmark-item 分岐) ---

  it('bookmark-item からの dragleave で drop-zone クラスが除去される', () => {
    const target = item(C);
    target.classList.add('drop-zone-before', 'drop-target-invalid');
    document.dispatchEvent(createDragEvent('dragleave', target));
    expect(target.classList.contains('drop-zone-before')).toBe(false);
    expect(target.classList.contains('drop-target-invalid')).toBe(false);
  });

  // --- handleBookmarkReorderDrop + reorderBookmark ---

  it('別アイテムへの drop で reorderBookmark が実行され move される (A→C after)', async () => {
    startDragA();
    const target = item(C);
    stubRect(target);
    document.dispatchEvent(createDragEvent('drop', target, { clientY: 90 }));
    await new Promise((r) => setTimeout(r, 30));

    // C(index2) の after → newIndex = 3
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('a', {
      parentId: 'f1',
      index: 3,
    });
  });

  it('同一 URL への reorder drop は早期 return する (move されない)', async () => {
    startDragA();
    const target = item(A);
    stubRect(target);
    document.dispatchEvent(createDragEvent('drop', target, { clientY: 10 }));
    await new Promise((r) => setTimeout(r, 30));
    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
  });

  it('reorder の Undo は元 index へ戻す (現在位置が前方なら +1 補正)', async () => {
    const registerSpy = vi.spyOn(UndoManager.getInstance(), 'register');
    // C(index2) を A(index0) の before へ → newIndex 0
    document.dispatchEvent(createDragEvent('dragstart', link(C)));
    const target = item(A);
    stubRect(target);
    document.dispatchEvent(createDragEvent('drop', target, { clientY: 10 }));
    await new Promise((r) => setTimeout(r, 30));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('c', {
      parentId: 'f1',
      index: 0,
    });

    const op = registerSpy.mock.calls[0][0];
    // undo 実行時、c は現在 index 0 (元 index 2 より前) → +1 補正で index 3 へ
    (chrome.bookmarks.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
      { id: 'c', parentId: 'f1', index: 0 },
    ]);
    await op.undo();
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('c', {
      parentId: 'f1',
      index: 3,
    });
  });

  it('reorder の Undo で get が失敗してもフォールバックで元 index へ戻す', async () => {
    const registerSpy = vi.spyOn(UndoManager.getInstance(), 'register');
    document.dispatchEvent(createDragEvent('dragstart', link(C)));
    const target = item(A);
    stubRect(target);
    document.dispatchEvent(createDragEvent('drop', target, { clientY: 10 }));
    await new Promise((r) => setTimeout(r, 30));

    const op = registerSpy.mock.calls[0][0];
    (chrome.bookmarks.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('boom')
    );
    await op.undo();
    // フォールバック: 元 index 2 のまま戻す
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('c', {
      parentId: 'f1',
      index: 2,
    });
  });

  it('reorder でソースが見つからないと例外 → catch で alert する', async () => {
    startDragA();
    (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockImplementation(
      ({ url }) => {
        // source(A) は見つからない / target(C) は見つかる
        if (url === C) {
          return Promise.resolve([
            { id: 'c', parentId: 'f1', index: 2, title: 'C', url },
          ]);
        }
        return Promise.resolve([]);
      }
    );
    const target = item(C);
    stubRect(target);
    document.dispatchEvent(createDragEvent('drop', target, { clientY: 90 }));
    await new Promise((r) => setTimeout(r, 30));
    expect(alertSpy).toHaveBeenCalledWith(
      'ブックマークの並び替えに失敗しました。'
    );
  });

  it('reorder でターゲットの親が取得できないと例外 → catch で alert する', async () => {
    startDragA();
    (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockImplementation(
      ({ url }) => {
        if (url === A) {
          return Promise.resolve([
            { id: 'a', parentId: 'f1', index: 0, title: 'A', url },
          ]);
        }
        // target(C) は parentId 無し
        return Promise.resolve([{ id: 'c', index: 2, title: 'C', url }]);
      }
    );
    const target = item(C);
    stubRect(target);
    document.dispatchEvent(createDragEvent('drop', target, { clientY: 90 }));
    await new Promise((r) => setTimeout(r, 30));
    expect(alertSpy).toHaveBeenCalledWith(
      'ブックマークの並び替えに失敗しました。'
    );
  });

  it('reorder でソースに parentId が無い場合は Undo 登録しない', async () => {
    const registerSpy = vi.spyOn(UndoManager.getInstance(), 'register');
    document.dispatchEvent(createDragEvent('dragstart', link(A)));
    (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockImplementation(
      ({ url }) => {
        if (url === A) {
          // source に parentId 無し
          return Promise.resolve([{ id: 'a', index: 0, title: 'A', url }]);
        }
        return Promise.resolve([
          { id: 'c', parentId: 'f1', index: 2, title: 'C', url },
        ]);
      }
    );
    const target = item(C);
    stubRect(target);
    document.dispatchEvent(createDragEvent('drop', target, { clientY: 90 }));
    await new Promise((r) => setTimeout(r, 30));
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('a', {
      parentId: 'f1',
      index: 3,
    });
    expect(registerSpy).not.toHaveBeenCalled();
  });

  // --- handleDrop のガード分岐 (フォルダ移動側) ---

  it('フォルダヘッダーでもアイテムでもない場所への drop は何もしない', async () => {
    startDragA();
    const container = document.querySelector(
      '.bookmark-container'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('drop', container));
    await new Promise((r) => setTimeout(r, 10));
    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
  });

  it('元と同じフォルダヘッダーへの drop は移動しない', async () => {
    startDragA();
    const sameHeader = document.querySelector(
      '[data-folder-id="f1"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('drop', sameHeader));
    await new Promise((r) => setTimeout(r, 10));
    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
  });

  // --- moveSingleBookmark のエラー分岐 ---

  it('単一移動でブックマークが見つからないと alert する', async () => {
    document.dispatchEvent(createDragEvent('dragstart', link(C)));
    (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    const dstHeader = document.querySelector(
      '[data-folder-id="f2"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('drop', dstHeader));
    await new Promise((r) => setTimeout(r, 30));
    expect(alertSpy).toHaveBeenCalledWith('ブックマークの移動に失敗しました。');
  });

  it('単一移動でソースに parentId が無い場合は Undo 登録しない', async () => {
    const registerSpy = vi.spyOn(UndoManager.getInstance(), 'register');
    document.dispatchEvent(createDragEvent('dragstart', link(C)));
    (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockImplementation(
      ({ url }) => {
        if (url === C) {
          return Promise.resolve([{ id: 'c', index: 2, title: 'C', url }]);
        }
        return Promise.resolve([]);
      }
    );
    const dstHeader = document.querySelector(
      '[data-folder-id="f2"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('drop', dstHeader));
    await new Promise((r) => setTimeout(r, 30));
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('c', {
      parentId: 'f2',
    });
    expect(registerSpy).not.toHaveBeenCalled();
  });

  // --- moveMultipleBookmarks の空ヒット / undo スキップ分岐 ---

  it('一括移動で一部 URL が見つからなくても残りを移動する (空ヒットは skip)', async () => {
    // A と B を選択状態にする
    item(A).classList.add('selected');
    item(B).classList.add('selected');
    item(A).setAttribute('data-bookmark-url', A);
    item(B).setAttribute('data-bookmark-url', B);

    (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockImplementation(
      ({ url }) => {
        // A はヒット、B は見つからない → skip
        if (url === A) {
          return Promise.resolve([
            { id: 'a', parentId: 'f1', index: 0, title: 'A', url },
          ]);
        }
        return Promise.resolve([]);
      }
    );

    document.dispatchEvent(createDragEvent('dragstart', link(A)));
    const dstHeader = document.querySelector(
      '[data-folder-id="f2"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('drop', dstHeader));
    await new Promise((r) => setTimeout(r, 30));

    // ヒットした A のみ move される
    expect(chrome.bookmarks.move).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('a', {
      parentId: 'f2',
    });
  });

  it('一括移動の Undo は previousParentId が無い項目を skip する', async () => {
    const registerSpy = vi.spyOn(UndoManager.getInstance(), 'register');
    item(A).classList.add('selected');
    item(B).classList.add('selected');

    (chrome.bookmarks.search as ReturnType<typeof vi.fn>).mockImplementation(
      ({ url }) => {
        if (url === A) {
          // previousParentId 無し
          return Promise.resolve([{ id: 'a', index: 0, title: 'A', url }]);
        }
        if (url === B) {
          return Promise.resolve([
            { id: 'b', parentId: 'f1', index: 1, title: 'B', url },
          ]);
        }
        return Promise.resolve([]);
      }
    );

    document.dispatchEvent(createDragEvent('dragstart', link(A)));
    const dstHeader = document.querySelector(
      '[data-folder-id="f2"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('drop', dstHeader));
    await new Promise((r) => setTimeout(r, 30));

    const op = registerSpy.mock.calls[0][0];
    (chrome.bookmarks.move as ReturnType<typeof vi.fn>).mockClear();
    await op.undo();
    // A は previousParentId 無しで skip、B のみ戻す
    expect(chrome.bookmarks.move).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b', {
      parentId: 'f1',
      index: 1,
    });
  });

  it('一括移動で API が失敗すると alert する', async () => {
    item(A).classList.add('selected');
    item(B).classList.add('selected');
    (chrome.bookmarks.move as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('move failed')
    );

    document.dispatchEvent(createDragEvent('dragstart', link(A)));
    const dstHeader = document.querySelector(
      '[data-folder-id="f2"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('drop', dstHeader));
    await new Promise((r) => setTimeout(r, 30));
    expect(alertSpy).toHaveBeenCalledWith('ブックマークの移動に失敗しました。');
  });

  // --- makeBookmarksDraggable / destroy ---

  it('makeBookmarksDraggable で全 bookmark-link が draggable になる', () => {
    // 一旦 draggable を消してから検証
    for (const el of Array.from(document.querySelectorAll('.bookmark-link'))) {
      (el as HTMLElement).draggable = false;
    }
    dnd.makeBookmarksDraggable();
    for (const el of Array.from(document.querySelectorAll('.bookmark-link'))) {
      expect((el as HTMLElement).getAttribute('draggable')).toBe('true');
    }
  });

  it('destroy で dropIndicator が DOM から除去される', () => {
    expect(document.querySelector('.bookmark-drop-indicator')).not.toBeNull();
    dnd.destroy();
    expect(document.querySelector('.bookmark-drop-indicator')).toBeNull();
  });
});
