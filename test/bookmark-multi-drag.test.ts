import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

/**
 * 複数選択ブックマークの DnD 移動テスト (#?)
 * Multi-select + drag → drop on another folder header で全件移動されること。
 */
describe('BookmarkDragAndDrop — 複数選択ドラッグでの一括移動', () => {
  let dom: JSDOM;
  let dnd: BookmarkDragAndDrop;

  function buildDom(): void {
    document.body.innerHTML = `
      <div class="bookmark-container">
        <div class="bookmark-folder" data-folder-id="src">
          <div class="folder-header"><h2>src</h2></div>
          <ul class="bookmark-list">
            <li class="bookmark-item selected" data-bookmark-url="https://a.example.com" data-bookmark-title="A">
              <a class="bookmark-link" data-url="https://a.example.com"><span class="bookmark-title">A</span></a>
            </li>
            <li class="bookmark-item selected" data-bookmark-url="https://b.example.com" data-bookmark-title="B">
              <a class="bookmark-link" data-url="https://b.example.com"><span class="bookmark-title">B</span></a>
            </li>
            <li class="bookmark-item" data-bookmark-url="https://c.example.com" data-bookmark-title="C">
              <a class="bookmark-link" data-url="https://c.example.com"><span class="bookmark-title">C</span></a>
            </li>
          </ul>
        </div>
        <div class="bookmark-folder" data-folder-id="dst">
          <div class="folder-header"><h2>dst</h2></div>
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
        move: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.bookmarks.search = vi.fn().mockImplementation(({ url }) => {
      if (url === 'https://a.example.com') {
        return Promise.resolve([
          { id: 'a', parentId: 'src', index: 0, title: 'A', url },
        ]);
      }
      if (url === 'https://b.example.com') {
        return Promise.resolve([
          { id: 'b', parentId: 'src', index: 1, title: 'B', url },
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

  it('選択中の項目をドラッグすると、選択中の全件が dst へ move される', async () => {
    // ドラッグ元: A (.selected の 1 つ)
    const link = document.querySelector(
      '.bookmark-link[data-url="https://a.example.com"]'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', link));

    const folderHeader = document.querySelector(
      '[data-folder-id="dst"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', folderHeader));
    document.dispatchEvent(createDragEvent('drop', folderHeader));

    await new Promise((r) => setTimeout(r, 30));

    // A と B の両方が move される
    expect(chrome.bookmarks.move).toHaveBeenCalledTimes(2);
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('a', {
      parentId: 'dst',
    });
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b', {
      parentId: 'dst',
    });
  });

  it('一括移動後に Undo Toast が表示され、Undo で元の位置に戻る', async () => {
    const link = document.querySelector(
      '.bookmark-link[data-url="https://a.example.com"]'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', link));

    const folderHeader = document.querySelector(
      '[data-folder-id="dst"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', folderHeader));
    document.dispatchEvent(createDragEvent('drop', folderHeader));

    await new Promise((r) => setTimeout(r, 30));

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('2 件のブックマークを移動しました');

    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 30));

    // 元の親 (src) + 元の index へ戻す move が 2 件呼ばれる
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('a', {
      parentId: 'src',
      index: 0,
    });
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b', {
      parentId: 'src',
      index: 1,
    });
  });

  it('移動先フォルダに既にある選択項目は再 move されない (#105)', async () => {
    // src の A と dst の D をどちらも選択した状態で A を掴み dst ヘッダーへドロップ。
    // D は既に dst 内にあるため move すると末尾へ並び替わる副作用が生じるので skip する。
    document.body.innerHTML = `
      <div class="bookmark-container">
        <div class="bookmark-folder" data-folder-id="src">
          <div class="folder-header"><h2>src</h2></div>
          <ul class="bookmark-list">
            <li class="bookmark-item selected" data-bookmark-url="https://a.example.com" data-bookmark-title="A">
              <a class="bookmark-link" data-url="https://a.example.com"><span class="bookmark-title">A</span></a>
            </li>
          </ul>
        </div>
        <div class="bookmark-folder" data-folder-id="dst">
          <div class="folder-header"><h2>dst</h2></div>
          <ul class="bookmark-list">
            <li class="bookmark-item selected" data-bookmark-url="https://d.example.com" data-bookmark-title="D">
              <a class="bookmark-link" data-url="https://d.example.com"><span class="bookmark-title">D</span></a>
            </li>
          </ul>
        </div>
      </div>
    `;

    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { search: ReturnType<typeof vi.fn> };
    };
    mockChrome.bookmarks.search = vi.fn().mockImplementation(({ url }) => {
      if (url === 'https://a.example.com') {
        return Promise.resolve([
          { id: 'a', parentId: 'src', index: 0, title: 'A', url },
        ]);
      }
      if (url === 'https://d.example.com') {
        return Promise.resolve([
          { id: 'd', parentId: 'dst', index: 0, title: 'D', url },
        ]);
      }
      return Promise.resolve([]);
    });

    const link = document.querySelector(
      '.bookmark-link[data-url="https://a.example.com"]'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', link));

    const folderHeader = document.querySelector(
      '[data-folder-id="dst"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', folderHeader));
    document.dispatchEvent(createDragEvent('drop', folderHeader));

    await new Promise((r) => setTimeout(r, 30));

    // A のみ move される。D は既に dst 内なので move されない。
    expect(chrome.bookmarks.move).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('a', {
      parentId: 'dst',
    });
    expect(chrome.bookmarks.move).not.toHaveBeenCalledWith('d', {
      parentId: 'dst',
    });
  });

  it('選択されていない項目のドラッグは単一移動 (従来挙動)', async () => {
    // C は .selected なし
    const link = document.querySelector(
      '.bookmark-link[data-url="https://c.example.com"]'
    ) as HTMLElement;
    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { search: ReturnType<typeof vi.fn> };
    };
    mockChrome.bookmarks.search.mockImplementation(({ url }) => {
      if (url === 'https://c.example.com') {
        return Promise.resolve([
          { id: 'c', parentId: 'src', index: 2, title: 'C', url },
        ]);
      }
      return Promise.resolve([]);
    });
    document.dispatchEvent(createDragEvent('dragstart', link));

    const folderHeader = document.querySelector(
      '[data-folder-id="dst"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', folderHeader));
    document.dispatchEvent(createDragEvent('drop', folderHeader));

    await new Promise((r) => setTimeout(r, 30));

    expect(chrome.bookmarks.move).toHaveBeenCalledTimes(1);
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('c', {
      parentId: 'dst',
    });
  });
});
