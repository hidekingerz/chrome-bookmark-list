import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkSelection } from '../src/components/BookmarkSelection/BookmarkSelection';

/**
 * 複数選択ロジックのテスト。
 *
 * BookmarkSelection は次の動作を提供する:
 * - 修飾キーなしクリック: 選択がなければ通常クリック (consumed=false)、
 *   既に選択があれば選択解除のみ (consumed=true)
 * - Shift+クリック: 直前のアンカーから範囲選択 (アンカーなしなら単一選択)
 * - Cmd/Ctrl+クリック: PR #68 の「新タブで開く」に譲るため選択処理しない (consumed=false)
 * - 非連続な追加は selection.toggle() を直接呼ぶ (UI ではコンテキストメニュー等から)
 * - ESC: 選択解除
 * - bulkDelete / bulkMove: 確認ダイアログを経由して Chrome API を呼ぶ
 */
describe('BookmarkSelection', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let selection: BookmarkSelection;

  /**
   * テスト用に 3 つのブックマークアイテムを構築する。
   */
  function buildContainer(): HTMLElement {
    const div = document.createElement('div');
    div.innerHTML = `
      <ul class="bookmark-list">
        <li class="bookmark-item">
          <a class="bookmark-link" data-url="https://a.example.com" href="#">
            <span class="bookmark-title">A</span>
          </a>
        </li>
        <li class="bookmark-item">
          <a class="bookmark-link" data-url="https://b.example.com" href="#">
            <span class="bookmark-title">B</span>
          </a>
        </li>
        <li class="bookmark-item">
          <a class="bookmark-link" data-url="https://c.example.com" href="#">
            <span class="bookmark-title">C</span>
          </a>
        </li>
      </ul>
    `;
    document.body.appendChild(div);
    return div;
  }

  function clickEvent(
    modifiers: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean } = {}
  ): MouseEvent {
    return new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      shiftKey: modifiers.shiftKey ?? false,
      metaKey: modifiers.metaKey ?? false,
      ctrlKey: modifiers.ctrlKey ?? false,
    }) as unknown as MouseEvent;
  }

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
      url: 'chrome-extension://test/newtab.html',
    });
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
    Object.defineProperty(globalThis, 'CSS', {
      value: dom.window.CSS,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'HTMLElement', {
      value: dom.window.HTMLElement,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'KeyboardEvent', {
      value: dom.window.KeyboardEvent,
      writable: true,
      configurable: true,
    });

    container = buildContainer();
    selection = new BookmarkSelection();
    selection.initialize(container);

    // Chrome API モック
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search = vi.fn();
    mockChrome.bookmarks.remove = vi.fn();
    mockChrome.bookmarks.move = vi.fn();
    mockChrome.bookmarks.create = vi.fn();
    mockChrome.bookmarks.getTree = vi.fn().mockResolvedValue([
      {
        id: '0',
        title: '',
        children: [
          { id: '1', title: 'ブックマークバー', children: [] },
          { id: '2', title: 'その他のブックマーク', children: [] },
        ],
      },
    ]);
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  function itemAt(index: number): HTMLElement {
    return container.querySelectorAll('.bookmark-item')[index] as HTMLElement;
  }

  function urlAt(index: number): string {
    const link = container.querySelectorAll('.bookmark-link')[index];
    return link.getAttribute('data-url') ?? '';
  }

  it('修飾キーなし・未選択時は consumed=false で通常クリックを通す', () => {
    const item = itemAt(0);
    const consumed = selection.handleClick(urlAt(0), 'A', item, clickEvent());
    expect(consumed).toBe(false);
    expect(selection.count).toBe(0);
  });

  it('Cmd+クリックは consumed=false で新タブ動作 (#68) に譲る', () => {
    const consumed = selection.handleClick(
      urlAt(0),
      'A',
      itemAt(0),
      clickEvent({ metaKey: true })
    );
    expect(consumed).toBe(false);
    expect(selection.count).toBe(0);
  });

  it('Ctrl+クリックも同様に新タブ動作に譲る (consumed=false)', () => {
    const consumed = selection.handleClick(
      urlAt(0),
      'A',
      itemAt(0),
      clickEvent({ ctrlKey: true })
    );
    expect(consumed).toBe(false);
    expect(selection.count).toBe(0);
  });

  it('toggle() で非連続な選択を構築できる', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(2), 'C', itemAt(2));
    expect(selection.count).toBe(2);
    expect(selection.getSelectedUrls()).toEqual([urlAt(0), urlAt(2)]);

    // 再度トグルすると解除される
    selection.toggle(urlAt(0), 'A', itemAt(0));
    expect(selection.count).toBe(1);
  });

  it('Shift+クリックで範囲選択する', () => {
    // 最初のアイテムを toggle で選択し、anchor を確立するため Shift+click を経由
    selection.handleClick(
      urlAt(0),
      'A',
      itemAt(0),
      clickEvent({ shiftKey: true })
    );
    // Shift+クリックで 3 つ目まで範囲選択
    selection.handleClick(
      urlAt(2),
      'C',
      itemAt(2),
      clickEvent({ shiftKey: true })
    );
    expect(selection.count).toBe(3);
    expect(itemAt(0).classList.contains('selected')).toBe(true);
    expect(itemAt(1).classList.contains('selected')).toBe(true);
    expect(itemAt(2).classList.contains('selected')).toBe(true);
  });

  it('複数選択中に修飾キーなしクリックすると選択解除のみで consumed=true', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));
    expect(selection.count).toBe(2);

    const consumed = selection.handleClick(
      urlAt(2),
      'C',
      itemAt(2),
      clickEvent()
    );
    expect(consumed).toBe(true);
    expect(selection.count).toBe(0);
  });

  it('ESC キーで選択を解除する', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));
    expect(selection.count).toBe(2);

    const escEvent = new dom.window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(escEvent as unknown as Event);

    expect(selection.count).toBe(0);
  });

  it('選択件数が 1 件以上のときフローティングツールバーを表示する', () => {
    expect(document.querySelector('.selection-toolbar')).toBeNull();
    selection.toggle(urlAt(0), 'A', itemAt(0));
    const toolbar = document.querySelector('.selection-toolbar');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.textContent).toContain('1 件選択中');

    selection.toggle(urlAt(1), 'B', itemAt(1));
    expect(
      document.querySelector('.selection-toolbar-count')?.textContent
    ).toContain('2 件選択中');

    selection.clear();
    expect(document.querySelector('.selection-toolbar')).toBeNull();
  });

  it('一括削除を実行すると確認ダイアログを経て chrome.bookmarks.remove を呼ぶ', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve([
        { id: `id-${url}`, parentId: '1', index: 0, title: url, url },
      ])
    );
    mockChrome.bookmarks.remove.mockResolvedValue(undefined);

    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));

    const deletePromise = selection.bulkDelete();

    // 確認ダイアログが出るまで待機
    await new Promise((resolve) => setTimeout(resolve, 10));
    const dialog = document.getElementById('bulk-confirm-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('2 件');

    (dialog?.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await deletePromise;

    expect(mockChrome.bookmarks.remove).toHaveBeenCalledTimes(2);
    expect(selection.count).toBe(0);
  });

  it('一括削除をキャンセルすると Chrome API は呼ばれない', async () => {
    const mockChrome = globalThis.chrome as any;
    selection.toggle(urlAt(0), 'A', itemAt(0));

    const deletePromise = selection.bulkDelete();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const dialog = document.getElementById('bulk-confirm-dialog');
    (dialog?.querySelector('.edit-dialog-cancel') as HTMLElement).click();
    await deletePromise;

    expect(mockChrome.bookmarks.remove).not.toHaveBeenCalled();
    expect(selection.count).toBe(1);
  });

  it('一括移動はダイアログで親フォルダを選択し chrome.bookmarks.move を呼ぶ', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve([
        { id: `id-${url}`, parentId: '1', index: 0, title: url, url },
      ])
    );
    mockChrome.bookmarks.move.mockResolvedValue(undefined);

    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));

    const movePromise = selection.bulkMove();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const dialog = document.getElementById('bulk-move-dialog');
    expect(dialog).not.toBeNull();

    const select = dialog?.querySelector(
      '#bulk-move-parent'
    ) as HTMLSelectElement;
    select.value = '2';
    (dialog?.querySelector('.bulk-move-confirm') as HTMLElement).click();
    await movePromise;

    expect(mockChrome.bookmarks.move).toHaveBeenCalledTimes(2);
    expect(mockChrome.bookmarks.move).toHaveBeenCalledWith(
      'id-https://a.example.com',
      {
        parentId: '2',
      }
    );
    expect(selection.count).toBe(0);
  });
});
