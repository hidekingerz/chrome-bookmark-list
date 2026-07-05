import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';

describe('BookmarkDragAndDrop — ドラッグプレビューとドロップ視覚', () => {
  let dom: JSDOM;
  let dnd: BookmarkDragAndDrop;

  function buildDom(): void {
    document.body.innerHTML = `
      <div class="bookmark-container">
        <div class="bookmark-folder" data-folder-id="src-folder">
          <div class="folder-header has-subfolders">
            <h2 class="folder-title">元フォルダ</h2>
          </div>
          <ul class="bookmark-list">
            <li class="bookmark-item">
              <a class="bookmark-link" data-url="https://a.example.com" draggable="true">
                <img class="bookmark-favicon" src="https://a.example.com/icon.png" />
                <span class="bookmark-title">A</span>
              </a>
            </li>
          </ul>
        </div>
        <div class="bookmark-folder" data-folder-id="dst-folder">
          <div class="folder-header has-subfolders">
            <h2 class="folder-title">移動先</h2>
          </div>
        </div>
      </div>
    `;
  }

  function createDragEvent(
    type: string,
    target: HTMLElement,
    overrides: Partial<DragEvent> = {}
  ): DragEvent {
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
    });
    for (const [k, v] of Object.entries(overrides)) {
      Object.defineProperty(event, k, { value: v });
    }
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
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: (cb: () => void) => {
        cb();
        return 0;
      },
      writable: true,
      configurable: true,
    });

    buildDom();
    dnd = new BookmarkDragAndDrop();
    dnd.initialize();
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('ドラッグ開始時にカスタムドラッグプレビューが setDragImage に渡される', () => {
    const link = document.querySelector('.bookmark-link') as HTMLElement;
    const event = createDragEvent('dragstart', link);
    document.dispatchEvent(event);

    expect(event.dataTransfer?.setDragImage).toHaveBeenCalled();
    // body にドラッグ状態マーカーが付与される
    expect(document.body.classList.contains('dragging-bookmark')).toBe(true);
    // 元フォルダにマーカー
    expect(
      document
        .querySelector('[data-folder-id="src-folder"]')
        ?.classList.contains('drag-source-folder')
    ).toBe(true);
  });

  it('複数選択時はプレビューに件数バッジが含まれる', () => {
    // 2 件を選択状態にする
    const items = document.querySelectorAll('.bookmark-item');
    for (const item of Array.from(items)) {
      item.classList.add('selected');
    }
    // ダミーで .bookmark-item.selected を計2件にする
    const extra = document.createElement('li');
    extra.className = 'bookmark-item selected';
    document.body.appendChild(extra);

    const link = document.querySelector('.bookmark-link') as HTMLElement;
    const event = createDragEvent('dragstart', link);

    // setDragImage に渡される preview 要素を捕捉する
    let capturedPreview: HTMLElement | null = null;
    (
      event.dataTransfer as unknown as { setDragImage: typeof vi.fn }
    ).setDragImage = vi.fn((el: HTMLElement) => {
      capturedPreview = el;
    });

    document.dispatchEvent(event);

    expect(capturedPreview).not.toBeNull();
    expect(
      (capturedPreview as unknown as HTMLElement)?.querySelector(
        '.bookmark-drag-preview-badge'
      )
    ).not.toBeNull();
  });

  it('favicon の src は防御的にエスケープされ属性インジェクションを防ぐ (#105)', () => {
    const faviconImg = document.querySelector(
      '.bookmark-favicon'
    ) as HTMLImageElement;
    // 実際は正規化済み img.src なので注入は起きないが、防御的エスケープを
    // 検証するため悪意ある文字列を返す getter に差し替える
    Object.defineProperty(faviconImg, 'src', {
      get: () => 'x" onerror="alert(1)',
      configurable: true,
    });

    const link = document.querySelector('.bookmark-link') as HTMLElement;
    const event = createDragEvent('dragstart', link);

    let capturedPreview: HTMLElement | null = null;
    (
      event.dataTransfer as unknown as { setDragImage: typeof vi.fn }
    ).setDragImage = vi.fn((el: HTMLElement) => {
      capturedPreview = el;
    });

    document.dispatchEvent(event);

    const icon = (capturedPreview as unknown as HTMLElement)?.querySelector(
      '.bookmark-drag-preview-icon'
    ) as HTMLImageElement | null;
    expect(icon).not.toBeNull();
    // 生補間だと onerror 属性が生成されてしまう。エスケープされていれば付かない
    expect(icon?.hasAttribute('onerror')).toBe(false);
    expect(icon?.getAttribute('src')).toBe('x" onerror="alert(1)');
  });

  it('元フォルダ上の dragover で drop-target-invalid が付与される', () => {
    const link = document.querySelector('.bookmark-link') as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', link));

    const srcHeader = document.querySelector(
      '[data-folder-id="src-folder"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', srcHeader));

    expect(srcHeader.classList.contains('drop-target-invalid')).toBe(true);
    expect(srcHeader.classList.contains('drop-target-highlight')).toBe(false);
  });

  it('別フォルダ上の dragover で drop-target-highlight が付与される', () => {
    const link = document.querySelector('.bookmark-link') as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', link));

    const dstHeader = document.querySelector(
      '[data-folder-id="dst-folder"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', dstHeader));

    expect(dstHeader.classList.contains('drop-target-highlight')).toBe(true);
    expect(dstHeader.classList.contains('drop-target-invalid')).toBe(false);
  });

  it('dragend で全てのドラッグ状態マーカーが除去される', () => {
    const link = document.querySelector('.bookmark-link') as HTMLElement;
    document.dispatchEvent(createDragEvent('dragstart', link));
    const srcHeader = document.querySelector(
      '[data-folder-id="src-folder"] .folder-header'
    ) as HTMLElement;
    document.dispatchEvent(createDragEvent('dragover', srcHeader));

    document.dispatchEvent(createDragEvent('dragend', link));

    expect(document.body.classList.contains('dragging-bookmark')).toBe(false);
    expect(srcHeader.classList.contains('drop-target-invalid')).toBe(false);
    expect(
      document
        .querySelector('[data-folder-id="src-folder"]')
        ?.classList.contains('drag-source-folder')
    ).toBe(false);
  });
});
