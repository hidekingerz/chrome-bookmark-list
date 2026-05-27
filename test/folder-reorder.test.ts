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

  it('ヘッダー上部 (clientY=5) で dragover すると drop-zone-before が付く', () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 5));

    expect(targetHeader.classList.contains('drop-zone-before')).toBe(true);
    expect(targetHeader.classList.contains('drop-zone-after')).toBe(false);
    expect(targetHeader.classList.contains('drop-target-highlight')).toBe(
      false
    );
  });

  it('ヘッダー下部 (clientY=45) で dragover すると drop-zone-after が付く', () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 45));

    expect(targetHeader.classList.contains('drop-zone-after')).toBe(true);
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

  it('before ドロップで chrome.bookmarks.move が target.index を引数に呼ばれる', async () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 5));
    document.dispatchEvent(createDragEvent('drop', targetHeader, 5));

    await new Promise((r) => setTimeout(r, 20));

    // B の index は 1。before なので新規 index = 1
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('A', {
      parentId: '1',
      index: 1,
    });
  });

  it('after ドロップで chrome.bookmarks.move が target.index + 1 を引数に呼ばれる', async () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 45));
    document.dispatchEvent(createDragEvent('drop', targetHeader, 45));

    await new Promise((r) => setTimeout(r, 20));

    // B の index は 1。after なので新規 index = 2
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('A', {
      parentId: '1',
      index: 2,
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
    const sourceHeader = document.querySelector(
      '[data-folder-id="A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader, 45));
    document.dispatchEvent(createDragEvent('drop', targetHeader, 45));

    await new Promise((r) => setTimeout(r, 20));

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();
    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 20));

    // Undo で元の parentId/index に戻る
    expect(chrome.bookmarks.move).toHaveBeenLastCalledWith('A', {
      parentId: '1',
      index: 0,
    });
  });
});
