import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

/**
 * ブックマーク間並び替え (#80) のテスト。
 */
describe('BookmarkDragAndDrop — ブックマーク間並び替え (#80)', () => {
  let dom: JSDOM;
  let dnd: BookmarkDragAndDrop;

  function buildDom(): void {
    document.body.innerHTML = `
      <div class="bookmark-container">
        <div class="bookmark-folder" data-folder-id="F">
          <div class="folder-header"><h2>F</h2></div>
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
      </div>
    `;
    // bookmark-item に rect を与える
    for (const item of document.querySelectorAll('.bookmark-item')) {
      const el = item as HTMLElement;
      el.getBoundingClientRect = vi.fn(
        () =>
          ({
            top: 0,
            left: 0,
            right: 200,
            bottom: 40,
            width: 200,
            height: 40,
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
    clientY = 20
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

    UndoManager.getInstance().clear();
    Toast.dismissCurrent();

    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: {
        search: ReturnType<typeof vi.fn>;
        get: ReturnType<typeof vi.fn>;
        move: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.bookmarks.search = vi.fn().mockImplementation(({ url }) => {
      if (url === 'https://a.example.com') {
        return Promise.resolve([
          {
            id: 'a',
            parentId: 'F',
            index: 0,
            title: 'A',
            url,
          },
        ]);
      }
      if (url === 'https://b.example.com') {
        return Promise.resolve([
          { id: 'b', parentId: 'F', index: 1, title: 'B', url },
        ]);
      }
      if (url === 'https://c.example.com') {
        return Promise.resolve([
          { id: 'c', parentId: 'F', index: 2, title: 'C', url },
        ]);
      }
      return Promise.resolve([]);
    });
    mockChrome.bookmarks.get = vi.fn().mockImplementation((id: string) => {
      if (id === 'a')
        return Promise.resolve([{ id: 'a', parentId: 'F', index: 0 }]);
      if (id === 'b')
        return Promise.resolve([{ id: 'b', parentId: 'F', index: 1 }]);
      if (id === 'c')
        return Promise.resolve([{ id: 'c', parentId: 'F', index: 2 }]);
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

  function dragStartFrom(url: string): void {
    const link = document.querySelector(
      `.bookmark-link[data-url="${url}"]`
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', link));
  }

  it('A を C の上半分にドロップ → move(a, {index: 2}) (Chrome側で -1 補正)', async () => {
    dragStartFrom('https://a.example.com');

    const targetItem = document.querySelector(
      '[data-bookmark-url="https://c.example.com"]'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetItem, 10));
    document.dispatchEvent(createDragEvent('drop', targetItem, 10));

    await new Promise((r) => setTimeout(r, 30));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('a', {
      parentId: 'F',
      index: 2,
    });
  });

  it('C を A の下半分にドロップ → move(c, {index: 1})', async () => {
    dragStartFrom('https://c.example.com');

    const targetItem = document.querySelector(
      '[data-bookmark-url="https://a.example.com"]'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetItem, 30));
    document.dispatchEvent(createDragEvent('drop', targetItem, 30));

    await new Promise((r) => setTimeout(r, 30));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('c', {
      parentId: 'F',
      index: 1,
    });
  });

  it('隣接 no-op (A → B の上半分) は drop-target-invalid', () => {
    dragStartFrom('https://a.example.com');

    const targetItem = document.querySelector(
      '[data-bookmark-url="https://b.example.com"]'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetItem, 10));

    expect(targetItem.classList.contains('drop-target-invalid')).toBe(true);
    expect(targetItem.classList.contains('drop-zone-before')).toBe(false);
  });

  it('自分自身へのドロップは drop-target-invalid', () => {
    dragStartFrom('https://a.example.com');

    const selfItem = document.querySelector(
      '[data-bookmark-url="https://a.example.com"]'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', selfItem, 10));

    expect(selfItem.classList.contains('drop-target-invalid')).toBe(true);
  });

  it('Undo で元の位置に戻る (currentIdx < originalIndex のとき +1 補正)', async () => {
    dragStartFrom('https://a.example.com');

    const targetItem = document.querySelector(
      '[data-bookmark-url="https://c.example.com"]'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetItem, 30));
    document.dispatchEvent(createDragEvent('drop', targetItem, 30));

    await new Promise((r) => setTimeout(r, 30));

    // Undo 時、A の現在 index は 2 (forward 移動後) で original は 0
    // currentIdx(2) > originalIndex(0) のため補正なし、undoIndex = 0
    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { get: ReturnType<typeof vi.fn> };
    };
    mockChrome.bookmarks.get.mockImplementation((id: string) => {
      if (id === 'a')
        return Promise.resolve([{ id: 'a', parentId: 'F', index: 2 }]);
      return Promise.resolve([]);
    });

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();
    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));

    expect(chrome.bookmarks.move).toHaveBeenLastCalledWith('a', {
      parentId: 'F',
      index: 0,
    });
  });
});
