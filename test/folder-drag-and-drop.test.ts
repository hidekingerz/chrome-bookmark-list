import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

/**
 * フォルダ DnD (#54) のテスト。
 * handleFolderDragStart / handleFolderDragOver / handleFolderDrop /
 * detectFolderDropZone / isInvalidFolderDropTarget / isInvalidFolderReorder /
 * moveFolder / reorderFolder の未到達パスを実 assert で検証する。
 */
describe('BookmarkDragAndDrop — フォルダ DnD', () => {
  let dom: JSDOM;
  let dnd: BookmarkDragAndDrop;
  let alertSpy: ReturnType<typeof vi.fn>;

  /** 3 フォルダ (f1, f2, f3) を縦に並べた DOM を作る。 */
  function buildDom(): void {
    document.body.innerHTML = `
      <div class="bookmark-container">
        <div class="bookmark-folder" data-folder-id="f1">
          <div class="folder-header" draggable="true">
            <span class="folder-title">F1</span>
          </div>
        </div>
        <div class="bookmark-folder" data-folder-id="f2">
          <div class="folder-header" draggable="true">
            <span class="folder-title">F2</span>
          </div>
        </div>
        <div class="bookmark-folder" data-folder-id="f3">
          <div class="folder-header" draggable="true">
            <span class="folder-title">F3</span>
          </div>
        </div>
      </div>
    `;
  }

  /** 指定 folder-header の getBoundingClientRect を高さ 100 / top 0 に固定する。 */
  function stubRect(header: HTMLElement): void {
    header.getBoundingClientRect = () =>
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

  function header(folderId: string): HTMLElement {
    return document.querySelector(
      `[data-folder-id="${folderId}"] .folder-header`
    ) as HTMLElement;
  }

  function createDragEvent(
    type: string,
    target: HTMLElement,
    clientY = 0
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
        get: ReturnType<typeof vi.fn>;
        move: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.bookmarks.get = vi.fn().mockImplementation((id: string) => {
      const indexById: Record<string, number> = { f1: 0, f2: 1, f3: 2 };
      if (id in indexById) {
        return Promise.resolve([
          { id, parentId: 'root', index: indexById[id], title: id },
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

  /** f1 をドラッグ開始する (draggedFolder をセットする)。 */
  function startDragF1(): void {
    document.dispatchEvent(createDragEvent('dragstart', header('f1')));
  }

  it('フォルダヘッダーの dragstart で draggedFolder がセットされクラスが付く', () => {
    const event = createDragEvent('dragstart', header('f1'));
    document.dispatchEvent(event);

    expect(event.dataTransfer?.setData).toHaveBeenCalledWith(
      'application/x-bookmark-folder-source',
      'f1'
    );
    expect(document.body.classList.contains('dragging-folder')).toBe(true);
    expect(header('f1').classList.contains('dragging')).toBe(true);
    expect(
      document
        .querySelector('[data-folder-id="f1"]')
        ?.classList.contains('drag-source-folder')
    ).toBe(true);
  });

  it('data-folder-id の無いフォルダの dragstart は早期 return (draggedFolder 未設定)', () => {
    document.body.innerHTML = `
      <div class="bookmark-folder">
        <div class="folder-header" draggable="true">
          <span class="folder-title">NoId</span>
        </div>
      </div>`;
    const target = document.querySelector('.folder-header') as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', target));

    // draggedFolder 未設定 → body に dragging-folder クラスが付かない
    expect(document.body.classList.contains('dragging-folder')).toBe(false);
  });

  it('dragover into ゾーン (中央) で drop-target-highlight が付く', () => {
    startDragF1();
    stubRect(header('f2'));
    const event = createDragEvent('dragover', header('f2'), 50); // ratio 0.5 → into
    document.dispatchEvent(event);

    expect(header('f2').classList.contains('drop-target-highlight')).toBe(true);
    expect(event.dataTransfer?.dropEffect).toBe('move');
  });

  it('dragover before ゾーン (上部) で drop-zone-before が付く', () => {
    startDragF1();
    stubRect(header('f3'));
    const event = createDragEvent('dragover', header('f3'), 10); // ratio 0.1 → before
    document.dispatchEvent(event);

    expect(header('f3').classList.contains('drop-zone-before')).toBe(true);
  });

  it('dragover after ゾーン (下部) で drop-zone-after が付く', () => {
    startDragF1();
    stubRect(header('f3'));
    const event = createDragEvent('dragover', header('f3'), 80); // ratio 0.8 → after
    document.dispatchEvent(event);

    expect(header('f3').classList.contains('drop-zone-after')).toBe(true);
  });

  it('自分自身への into ドロップは invalid (drop-target-invalid + dropEffect none)', () => {
    startDragF1();
    stubRect(header('f1'));
    const event = createDragEvent('dragover', header('f1'), 50); // into 自分自身
    document.dispatchEvent(event);

    expect(header('f1').classList.contains('drop-target-invalid')).toBe(true);
    expect(event.dataTransfer?.dropEffect).toBe('none');
  });

  it('隣接フォルダへの before 並び替えは no-op として invalid', () => {
    // f1(idx0) を f2(idx1) の before に → srcIdx === tgtIdx-1 で no-op
    startDragF1();
    stubRect(header('f2'));
    const event = createDragEvent('dragover', header('f2'), 10); // before
    document.dispatchEvent(event);

    expect(header('f2').classList.contains('drop-target-invalid')).toBe(true);
  });

  it('into ドロップで moveFolder が呼ばれ Undo Toast が表示される', async () => {
    startDragF1();
    stubRect(header('f3'));
    document.dispatchEvent(createDragEvent('drop', header('f3'), 50)); // into f3

    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('f1', {
      parentId: 'f3',
    });
    const toast = document.querySelector('.app-toast');
    expect(toast?.textContent).toContain('フォルダ「F1」を移動しました');

    // Undo 実行で元の親 (root, index 0) へ戻る
    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('f1', {
      parentId: 'root',
      index: 0,
    });
  });

  it('after 並び替えドロップで reorderFolder が呼ばれる', async () => {
    // f1(idx0) を f3(idx2) の after に → newIndex = 2 + 1 = 3
    startDragF1();
    stubRect(header('f3'));
    document.dispatchEvent(createDragEvent('drop', header('f3'), 80)); // after

    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('f1', {
      parentId: 'root',
      index: 3,
    });
    const toast = document.querySelector('.app-toast');
    expect(toast?.textContent).toContain('フォルダ「F1」を並び替えました');
  });

  it('before 並び替えドロップで reorderFolder の Undo が元位置へ戻す', async () => {
    // f1(idx0) を f3(idx2) の before に → newIndex = 2
    startDragF1();
    stubRect(header('f3'));
    document.dispatchEvent(createDragEvent('drop', header('f3'), 10)); // before

    await new Promise((r) => setTimeout(r, 10));
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('f1', {
      parentId: 'root',
      index: 2,
    });

    // Undo: get で現在 index 0 (< originalIndex 0 ではない) → undoIndex = 0
    const toast = document.querySelector('.app-toast');
    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));
    expect(chrome.bookmarks.move).toHaveBeenCalledWith('f1', {
      parentId: 'root',
      index: 0,
    });
  });

  it('invalid なドロップ (自分自身への into) では move されない', async () => {
    startDragF1();
    stubRect(header('f1'));
    document.dispatchEvent(createDragEvent('drop', header('f1'), 50));

    await new Promise((r) => setTimeout(r, 10));
    expect(chrome.bookmarks.move).not.toHaveBeenCalled();
  });

  it('moveFolder で対象フォルダが見つからない場合は alert で通知する', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // get が空配列を返すよう差し替え → moveFolder 内で throw
    (
      globalThis.chrome as unknown as {
        bookmarks: { get: ReturnType<typeof vi.fn> };
      }
    ).bookmarks.get = vi.fn().mockResolvedValue([]);

    startDragF1();
    stubRect(header('f3'));
    document.dispatchEvent(createDragEvent('drop', header('f3'), 50)); // into

    await new Promise((r) => setTimeout(r, 10));

    expect(alertSpy).toHaveBeenCalledWith('フォルダの移動に失敗しました。');
    errorSpy.mockRestore();
  });

  it('reorderFolder で並び替え先の親が取得できない場合は alert で通知する', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // target (f3) の parentId が undefined → reorderFolder 内で throw
    (
      globalThis.chrome as unknown as {
        bookmarks: { get: ReturnType<typeof vi.fn> };
      }
    ).bookmarks.get = vi.fn().mockImplementation((id: string) => {
      if (id === 'f3') {
        return Promise.resolve([{ id: 'f3', index: 2 }]); // parentId 無し
      }
      return Promise.resolve([{ id, parentId: 'root', index: 0 }]);
    });

    startDragF1();
    stubRect(header('f3'));
    document.dispatchEvent(createDragEvent('drop', header('f3'), 80)); // after

    await new Promise((r) => setTimeout(r, 10));

    expect(alertSpy).toHaveBeenCalledWith('フォルダの移動に失敗しました。');
    errorSpy.mockRestore();
  });
});
