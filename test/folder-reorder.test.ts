import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

/**
 * フォルダ並び替え (#77) のテスト。
 * - ヘッダー上部 (40%) ドロップで before
 * - 中央 (20%) で into (既存挙動)
 * - 下部 (40%) で after
 */
describe('BookmarkDragAndDrop — フォルダ並び替え (#77)', () => {
  let dom: JSDOM;
  let dnd: BookmarkDragAndDrop;

  function buildDom(): void {
    // A(idx 0), B(idx 1), C(idx 2): 3 兄弟にして隣接 no-op を避けつつ
    // 並び替え判定が動くようにする
    document.body.innerHTML = `
      <div class="bookmark-container">
        <div class="bookmark-folder" data-folder-id="A">
          <div class="folder-header" draggable="true">
            <h2 class="folder-title">A</h2>
          </div>
        </div>
        <div class="bookmark-folder" data-folder-id="B">
          <div class="folder-header" draggable="true">
            <h2 class="folder-title">B</h2>
          </div>
        </div>
        <div class="bookmark-folder" data-folder-id="C">
          <div class="folder-header" draggable="true">
            <h2 class="folder-title">C</h2>
          </div>
        </div>
      </div>
    `;
    // 高さを与えて zone 判定で意味のある値になるようにする
    for (const header of document.querySelectorAll('.folder-header')) {
      const el = header as HTMLElement;
      el.getBoundingClientRect = vi.fn(
        () =>
          ({
            top: 0,
            left: 0,
            right: 100,
            bottom: 50,
            width: 100,
            height: 50,
            x: 0,
            y: 0,
            toJSON() {},
          }) as DOMRect
      );
    }
  }

  function createDragEvent(
    type: string,
    target: HTMLElement,
    clientY = 25
  ): DragEvent {
    const event = new dom.window.Event(type, {
      bubbles: true,
      cancelable: true,
    }) as unknown as DragEvent;
    Object.defineProperty(event, 'target', { value: target });
    Object.defineProperty(event, 'clientY', { value: clientY });
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        setData: vi.fn(),
        setDragImage: vi.fn(),
        effectAllowed: '',
        dropEffect: '',
      },
      writable: true,
    });
    return event;
  }

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);
    // Autoscroller が window.requestAnimationFrame / cancelAnimationFrame / scrollBy
    // を呼ぶので jsdom の window に注入する。rAF は無限ループを防ぐため no-op で良い。
    (
      dom.window as unknown as {
        requestAnimationFrame: (cb: () => void) => number;
      }
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

    UndoManager.getInstance().clear();
    Toast.dismissCurrent();

    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: {
        get: ReturnType<typeof vi.fn>;
        move: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.bookmarks.get = vi.fn().mockImplementation((id: string) => {
      if (id === 'A') {
        return Promise.resolve([
          { id: 'A', parentId: '1', index: 0, title: 'A' },
        ]);
      }
      if (id === 'B') {
        return Promise.resolve([
          { id: 'B', parentId: '1', index: 1, title: 'B' },
        ]);
      }
      if (id === 'C') {
        return Promise.resolve([
          { id: 'C', parentId: '1', index: 2, title: 'C' },
        ]);
      }
      return Promise.resolve([]);
    });
    mockChrome.bookmarks.move = vi.fn().mockResolvedValue(undefined);

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

  it('非隣接ターゲットの上部 (clientY=5) で dragover すると drop-zone-before が付く', () => {
    // A(0) を C(2) の上端にドロップ: A と C は隣接していないので valid
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="C"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 5));

    expect(targetHeader.classList.contains('drop-zone-before')).toBe(true);
    expect(targetHeader.classList.contains('drop-zone-after')).toBe(false);
    expect(targetHeader.classList.contains('drop-target-highlight')).toBe(
      false
    );
  });

  it('非隣接ターゲットの下部 (clientY=45) で dragover すると drop-zone-after が付く', () => {
    // C(2) を A(0) の下端にドロップ: 隣接していないので valid
    const sourceHeader = document.querySelector(
      '[data-folder-id="C"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 45));

    expect(targetHeader.classList.contains('drop-zone-after')).toBe(true);
    expect(targetHeader.classList.contains('drop-zone-before')).toBe(false);
  });

  it('隣接 no-op (A→B の上端) は drop-target-invalid になる', () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 5));

    expect(targetHeader.classList.contains('drop-target-invalid')).toBe(true);
    expect(targetHeader.classList.contains('drop-zone-before')).toBe(false);
  });

  it('ヘッダー中央 (clientY=25) で dragover すると drop-target-highlight (into) が付く', () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 25));

    expect(targetHeader.classList.contains('drop-target-highlight')).toBe(true);
    expect(targetHeader.classList.contains('drop-zone-before')).toBe(false);
    expect(targetHeader.classList.contains('drop-zone-after')).toBe(false);
  });

  it('A(0) を C(2) の前にドロップ → move(A, {index: 2}) を呼ぶ (Chrome 側で -1 補正)', async () => {
    // before zone なので newIndex = target.idx = 2
    // Chrome 側で src(0) < 2 のため最終位置 1 に補正される (= C の直前)
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="C"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 5));
    document.dispatchEvent(createDragEvent('drop', targetHeader, 5));

    await new Promise((r) => setTimeout(r, 20));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('A', {
      parentId: '1',
      index: 2,
    });
  });

  it('C(2) を A(0) の後にドロップ → move(C, {index: 1}) を呼ぶ', async () => {
    // after zone なので newIndex = target.idx + 1 = 1
    // Chrome 側で src(2) > 1 のため補正なし、最終位置 1 (= A の直後)
    const sourceHeader = document.querySelector(
      '[data-folder-id="C"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 45));
    document.dispatchEvent(createDragEvent('drop', targetHeader, 45));

    await new Promise((r) => setTimeout(r, 20));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('C', {
      parentId: '1',
      index: 1,
    });
  });

  it('自分自身に before/after をドロップしようとすると無効', () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));
    document.dispatchEvent(createDragEvent('dragover', sourceHeader, 5));

    expect(sourceHeader.classList.contains('drop-target-invalid')).toBe(true);
    expect(sourceHeader.classList.contains('drop-zone-before')).toBe(false);
  });

  it('並び替え後 Undo Toast から元の位置に戻せる', async () => {
    // C(idx=2) を A(idx=0) の後にドロップ → C は idx=1 へ移動
    // Undo 時、C は現在 idx=1 で original=2 (現在 < original) のため
    // undoIndex = 2 + 1 = 3 で move を呼ぶ。Chrome の補正で最終位置 2。
    const sourceHeader = document.querySelector(
      '[data-folder-id="C"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 45));
    document.dispatchEvent(createDragEvent('drop', targetHeader, 45));

    await new Promise((r) => setTimeout(r, 20));

    // Undo 前に C の現在位置を mock で更新 (move() 後の状態を模す)
    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { get: ReturnType<typeof vi.fn> };
    };
    mockChrome.bookmarks.get.mockImplementation((id: string) => {
      if (id === 'C') {
        return Promise.resolve([
          { id: 'C', parentId: '1', index: 1, title: 'C' },
        ]);
      }
      return Promise.resolve([]);
    });

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();
    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));

    // Undo: 現在 idx=1 < originalIndex=2 のため undoIndex = 3
    expect(chrome.bookmarks.move).toHaveBeenLastCalledWith('C', {
      parentId: '1',
      index: 3,
    });
  });
});
