import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { BookmarkSelection } from '../src/components/BookmarkSelection/BookmarkSelection';
import { UndoManager } from '../src/components/UndoManager/index';
import {
  handleBookmarkDelete,
  handleBookmarkEdit,
} from '../src/scripts/newtab-core';

/**
 * #97 の回帰テスト。
 *
 * 同一 URL を複数フォルダにブックマークしている場合、対象の同定を
 * `chrome.bookmarks.search({ url })[0]` で行うと「操作したものとは別の
 * ブックマーク」を削除・編集・移動してしまう。DOM に付与された
 * `data-bookmark-id`（Chrome ノード ID）で一意に同定することを検証する。
 *
 * ここでは「search の先頭要素 = 誤ったノード(dupA)」「data-bookmark-id が
 * 指す = 正しいノード(dupB)」という重複を意図的に作り、正しい dupB が
 * 操作対象になることを確認する（修正前のコードは dupA を操作するため落ちる）。
 */
describe('#97 data-bookmark-id によるブックマーク同定', () => {
  const DUP = 'https://dup.example.com';

  let dom: JSDOM;

  function installGlobals(d: JSDOM): void {
    Object.defineProperty(globalThis, 'document', {
      value: d.window.document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: d.window,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
      value: d.window.CustomEvent,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'KeyboardEvent', {
      value: d.window.KeyboardEvent,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'HTMLElement', {
      value: d.window.HTMLElement,
      writable: true,
      configurable: true,
    });
  }

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
      url: 'chrome-extension://test/newtab.html',
    });
    installGlobals(dom);

    const mockChrome = globalThis.chrome as any;
    // search は重複を返す: 先頭 dupA（誤り）/ 2 件目 dupB（正しい対象）
    mockChrome.bookmarks.search = vi.fn().mockResolvedValue([
      { id: 'dupA', parentId: 'fa', index: 0, title: 'Dup A', url: DUP },
      { id: 'dupB', parentId: 'fb', index: 3, title: 'Dup B', url: DUP },
    ]);
    // get(id) は指定した ID のノードのみを返す
    mockChrome.bookmarks.get = vi.fn().mockImplementation((id: string) =>
      Promise.resolve(
        id === 'dupB'
          ? [
              {
                id: 'dupB',
                parentId: 'fb',
                index: 3,
                title: 'Dup B',
                url: DUP,
              },
            ]
          : id === 'target'
            ? [
                {
                  id: 'target',
                  parentId: 'fb',
                  index: 1,
                  title: 'T',
                  url: 'https://t.example.com',
                },
              ]
            : []
      )
    );
    mockChrome.bookmarks.remove = vi.fn().mockResolvedValue(undefined);
    mockChrome.bookmarks.move = vi.fn().mockResolvedValue(undefined);
    mockChrome.bookmarks.create = vi.fn().mockResolvedValue({});
    mockChrome.bookmarks.update = vi.fn().mockResolvedValue(undefined);
    mockChrome.bookmarks.getTree = vi.fn().mockResolvedValue([]);
    Object.defineProperty(globalThis, 'alert', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
    UndoManager.getInstance().clear();
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('削除は data-bookmark-id が指すノードを削除する（先頭 search 結果ではない）', async () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-bookmark-url', DUP);
    btn.setAttribute('data-bookmark-title', 'Dup B');
    btn.setAttribute('data-bookmark-id', 'dupB');

    const p = handleBookmarkDelete(btn);
    await new Promise((r) => setTimeout(r, 10));
    const confirmBtn = document
      .getElementById('delete-dialog')
      ?.querySelector('.delete-dialog-confirm') as HTMLElement;
    confirmBtn.click();
    await p;

    expect(chrome.bookmarks.remove).toHaveBeenCalledWith('dupB');
    expect(chrome.bookmarks.remove).not.toHaveBeenCalledWith('dupA');
  });

  it('編集は data-bookmark-id が指すノードをダイアログに表示する', async () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-bookmark-url', DUP);
    btn.setAttribute('data-bookmark-title', 'Dup B');
    btn.setAttribute('data-bookmark-id', 'dupB');

    await handleBookmarkEdit(btn);
    await new Promise((r) => setTimeout(r, 10));

    const titleInput = document.getElementById(
      'edit-title'
    ) as HTMLInputElement | null;
    expect(titleInput).toBeTruthy();
    // dupA(Dup A) ではなく dupB(Dup B) の情報が表示される
    expect(titleInput?.value).toBe('Dup B');
  });

  it('一括削除は選択要素の data-bookmark-id が指すノードを削除する', async () => {
    const container = document.createElement('div');
    container.innerHTML = `
      <ul class="bookmark-list">
        <li class="bookmark-item" data-bookmark-id="dupB">
          <a class="bookmark-link" data-url="${DUP}" href="#">
            <span class="bookmark-title">Dup B</span>
          </a>
        </li>
      </ul>
    `;
    document.body.appendChild(container);

    const selection = new BookmarkSelection();
    selection.initialize(container);
    const item = container.querySelector('.bookmark-item') as HTMLElement;
    selection.toggle(DUP, 'Dup B', item);

    const bulkPromise = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    const confirmBtn = document
      .getElementById('bulk-confirm-dialog')
      ?.querySelector('.delete-dialog-confirm') as HTMLElement;
    confirmBtn.click();
    await bulkPromise;

    expect(chrome.bookmarks.remove).toHaveBeenCalledWith('dupB');
    expect(chrome.bookmarks.remove).not.toHaveBeenCalledWith('dupA');
  });

  it('DnD reorder は data-bookmark-id が指すノードを移動する', async () => {
    document.body.innerHTML = `
      <div class="bookmark-folder" data-folder-id="fb">
        <div class="folder-header"></div>
        <ul class="bookmark-list">
          <li class="bookmark-item" data-bookmark-url="${DUP}" data-bookmark-title="Dup B" data-bookmark-id="dupB">
            <a class="bookmark-link" data-url="${DUP}" href="#">
              <span class="bookmark-title">Dup B</span>
            </a>
          </li>
          <li class="bookmark-item" data-bookmark-url="https://t.example.com" data-bookmark-title="T" data-bookmark-id="target">
            <a class="bookmark-link" data-url="https://t.example.com" href="#">
              <span class="bookmark-title">T</span>
            </a>
          </li>
        </ul>
      </div>
    `;

    const dnd = new BookmarkDragAndDrop();
    dnd.initialize();

    const sourceLink = document.querySelector(
      `.bookmark-link[data-url="${DUP}"]`
    ) as HTMLElement;
    const targetItem = document.querySelector(
      `.bookmark-item[data-bookmark-url="https://t.example.com"]`
    ) as HTMLElement;
    targetItem.getBoundingClientRect = () =>
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

    const makeEvent = (type: string, target: HTMLElement, clientY: number) => {
      const ev = new dom.window.Event(type, {
        bubbles: true,
        cancelable: true,
      }) as unknown as DragEvent;
      Object.defineProperty(ev, 'target', { value: target });
      Object.defineProperty(ev, 'clientY', { value: clientY });
      Object.defineProperty(ev, 'dataTransfer', {
        value: { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '' },
        writable: true,
      });
      return ev;
    };

    document.dispatchEvent(makeEvent('dragstart', sourceLink, 0));
    document.dispatchEvent(makeEvent('drop', targetItem, 90));
    await new Promise((r) => setTimeout(r, 30));

    expect(chrome.bookmarks.move).toHaveBeenCalledWith(
      'dupB',
      expect.objectContaining({ parentId: 'fb' })
    );
    const moveIds = (chrome.bookmarks.move as any).mock.calls.map(
      (c: unknown[]) => c[0]
    );
    expect(moveIds).not.toContain('dupA');
  });
});
