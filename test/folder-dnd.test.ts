import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

describe('BookmarkDragAndDrop — フォルダ DnD (#54)', () => {
  let dom: JSDOM;
  let dnd: BookmarkDragAndDrop;

  function buildDom(): void {
    document.body.innerHTML = `
      <div class="bookmark-container">
        <div class="bookmark-folder" data-folder-id="parent-A">
          <div class="folder-header" draggable="true">
            <h2 class="folder-title">親A</h2>
          </div>
          <div class="subfolders-container">
            <div class="bookmark-folder" data-folder-id="child-A1">
              <div class="folder-header" draggable="true">
                <h2 class="folder-title">子A1</h2>
              </div>
            </div>
          </div>
        </div>
        <div class="bookmark-folder" data-folder-id="parent-B">
          <div class="folder-header" draggable="true">
            <h2 class="folder-title">親B</h2>
          </div>
        </div>
      </div>
    `;
  }

  function createDragEvent(type: string, target: HTMLElement): DragEvent {
    const event = new dom.window.Event(type, {
      bubbles: true,
      cancelable: true,
    }) as unknown as DragEvent;
    Object.defineProperty(event, 'target', { value: target });
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
    mockChrome.bookmarks.get = vi
      .fn()
      .mockResolvedValue([
        { id: 'parent-A', parentId: '1', index: 0, title: '親A' },
      ]);
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

  it('フォルダヘッダーから dragstart で body に dragging-folder クラスが付く', () => {
    const header = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', header));

    expect(document.body.classList.contains('dragging-folder')).toBe(true);
    expect(header.classList.contains('dragging')).toBe(true);
  });

  it('別フォルダの上で dragover すると drop-target-highlight が付く', () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="parent-B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader));

    expect(targetHeader.classList.contains('drop-target-highlight')).toBe(true);
    expect(targetHeader.classList.contains('drop-target-invalid')).toBe(false);
  });

  it('自分自身の上にドロップすると drop-target-invalid が付く', () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));
    document.dispatchEvent(createDragEvent('dragover', sourceHeader));

    expect(sourceHeader.classList.contains('drop-target-invalid')).toBe(true);
    expect(sourceHeader.classList.contains('drop-target-highlight')).toBe(
      false
    );
  });

  it('子フォルダを現在の親フォルダ上にドロップしても無効 (no-op 防止)', () => {
    // child-A1 (parent-A の子) を parent-A 上にドロップ
    const childHeader = document.querySelector(
      '[data-folder-id="child-A1"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', childHeader));

    const parentHeader = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', parentHeader));

    expect(parentHeader.classList.contains('drop-target-invalid')).toBe(true);
    expect(parentHeader.classList.contains('drop-target-highlight')).toBe(
      false
    );

    // drop しても move は呼ばれない
    document.dispatchEvent(createDragEvent('drop', parentHeader));
    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
  });

  it('自分の子孫の上にドロップすると drop-target-invalid が付く', () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const childHeader = document.querySelector(
      '[data-folder-id="child-A1"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', childHeader));

    expect(childHeader.classList.contains('drop-target-invalid')).toBe(true);
    expect(childHeader.classList.contains('drop-target-highlight')).toBe(false);
  });

  it('別フォルダにドロップで chrome.bookmarks.move が呼ばれる', async () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="parent-B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader));
    document.dispatchEvent(createDragEvent('drop', targetHeader));

    await new Promise((r) => setTimeout(r, 20));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('parent-A', {
      parentId: 'parent-B',
    });
  });

  it('子孫へのドロップでは chrome.bookmarks.move が呼ばれない', async () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const childHeader = document.querySelector(
      '[data-folder-id="child-A1"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('drop', childHeader));

    await new Promise((r) => setTimeout(r, 20));
    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
  });

  it('移動後 Undo Toast が表示され、Undo で元の位置に戻る', async () => {
    const sourceHeader = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', sourceHeader));

    const targetHeader = document.querySelector(
      '[data-folder-id="parent-B"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', targetHeader));
    document.dispatchEvent(createDragEvent('drop', targetHeader));

    await new Promise((r) => setTimeout(r, 20));

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();

    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 20));

    expect(chrome.bookmarks.move).toHaveBeenLastCalledWith('parent-A', {
      parentId: '1',
      index: 0,
    });
  });

  it('dragend で全状態マーカーがリセットされる', () => {
    const header = document.querySelector(
      '[data-folder-id="parent-A"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', header));
    document.dispatchEvent(createDragEvent('dragend', header));

    expect(document.body.classList.contains('dragging-folder')).toBe(false);
    expect(document.body.classList.contains('dragging-bookmark')).toBe(false);
    expect(header.classList.contains('dragging')).toBe(false);
  });
});
