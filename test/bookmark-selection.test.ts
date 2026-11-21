import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkSelection } from '../src/components/BookmarkSelection/BookmarkSelection';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';
import {
  type FakeBookmarks,
  installFakeBookmarks,
} from './helpers/fake-bookmarks';

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
    selection.refresh(container);

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
    // 各テストが仕掛けた Toast / UndoManager のスパイを次のテストへ持ち越さない
    vi.restoreAllMocks();
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
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

  /**
   * 並び順を持つ chrome.bookmarks の代役を入れる。
   * ブックマークバー (1) に A・B・C、その他のブックマーク (2) は空。
   */
  function installTree(): FakeBookmarks {
    return installFakeBookmarks([
      {
        id: '1',
        title: 'ブックマークバー',
        children: [
          { id: 'a', title: 'A', url: urlAt(0) },
          { id: 'b', title: 'B', url: urlAt(1) },
          { id: 'c', title: 'C', url: urlAt(2) },
        ],
      },
      { id: '2', title: 'その他のブックマーク', children: [] },
    ]);
  }

  function errorDialogMessage(): string | undefined {
    return document
      .querySelector('#error-dialog .error-message')
      ?.textContent?.trim();
  }

  function toastMessage(): string | undefined {
    return document.querySelector('.app-toast-message')?.textContent?.trim();
  }

  function undoButton(): HTMLElement | null {
    return document.querySelector('.app-toast-action');
  }

  /** 一括移動のダイアログで移動先を選んで「移動」を押す。 */
  async function confirmMoveTo(parentId: string): Promise<void> {
    await vi.waitFor(() => {
      expect(document.getElementById('bulk-move-parent')).not.toBeNull();
    });
    (document.getElementById('bulk-move-parent') as HTMLSelectElement).value =
      parentId;
    (document.querySelector('.bulk-move-confirm') as HTMLElement).click();
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

    (dialog!.querySelector('.delete-dialog-confirm') as HTMLElement).click();
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
    (dialog!.querySelector('.edit-dialog-cancel') as HTMLElement).click();
    await deletePromise;

    expect(mockChrome.bookmarks.remove).not.toHaveBeenCalled();
    expect(selection.count).toBe(1);
  });

  it('一括移動はダイアログで選んだフォルダへ、選んだ順のまま移し、選択を解除する', async () => {
    const bookmarks = installTree();
    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));

    const moving = selection.bulkMove();
    await confirmMoveTo('2');
    await moving;

    expect(bookmarks.titles('2')).toEqual(['A', 'B']);
    expect(bookmarks.titles('1')).toEqual(['C']);
    expect(toastMessage()).toBe('2 件のブックマークを移動しました');
    expect(selection.count).toBe(0);
  });

  // -------------------------------------------------------------------
  // 範囲選択 (selectRange) の分岐
  // -------------------------------------------------------------------

  it('container 未設定のとき selectRange は toggle にフォールバックする', () => {
    const noContainer = new BookmarkSelection();
    noContainer.selectRange(urlAt(0), 'A', itemAt(0));
    expect(noContainer.count).toBe(1);
    expect(noContainer.getSelectedUrls()).toEqual([urlAt(0)]);
  });

  it('アンカー未確立の Shift+クリックは単一選択になる', () => {
    // lastClickedUrl が null の状態で直接 selectRange を呼ぶ
    selection.selectRange(urlAt(1), 'B', itemAt(1));
    expect(selection.count).toBe(1);
    expect(selection.getSelectedUrls()).toEqual([urlAt(1)]);
    expect(itemAt(1).classList.contains('selected')).toBe(true);
  });

  it('アンカーが現在の表示順に存在しない場合は単一選択にフォールバックする', () => {
    // 存在しない URL をアンカーに見せかける
    (selection as unknown as { lastClickedUrl: string }).lastClickedUrl =
      'https://gone.example.com';
    selection.selectRange(urlAt(2), 'C', itemAt(2));
    expect(selection.count).toBe(1);
    expect(selection.getSelectedUrls()).toEqual([urlAt(2)]);
  });

  it('アンカーより前のアイテムへ Shift+クリックすると逆順でも範囲選択する', () => {
    // index 2 をアンカーに
    selection.handleClick(
      urlAt(2),
      'C',
      itemAt(2),
      clickEvent({ shiftKey: true })
    );
    // index 0 へ Shift+クリック (anchorIdx > targetIdx の分岐)
    selection.handleClick(
      urlAt(0),
      'A',
      itemAt(0),
      clickEvent({ shiftKey: true })
    );
    expect(selection.count).toBe(3);
    expect(itemAt(0).classList.contains('selected')).toBe(true);
    expect(itemAt(1).classList.contains('selected')).toBe(true);
    expect(itemAt(2).classList.contains('selected')).toBe(true);
  });

  // -------------------------------------------------------------------
  // clear / blur / clearInternal の分岐
  // -------------------------------------------------------------------

  it('clear() はフォーカス中のブックマーク要素から focus を外す', () => {
    const link = itemAt(0).querySelector('.bookmark-link') as HTMLElement;
    selection.toggle(urlAt(0), 'A', itemAt(0));
    link.focus();
    expect(document.activeElement).toBe(link);

    selection.clear();
    expect(document.activeElement).not.toBe(link);
  });

  it('clearInternal は map 管理外の .selected 要素も除去する', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    // map に無いが DOM 上は selected な要素を作る
    itemAt(1).classList.add('selected');

    selection.clear();
    expect(itemAt(0).classList.contains('selected')).toBe(false);
    expect(itemAt(1).classList.contains('selected')).toBe(false);
  });

  // -------------------------------------------------------------------
  // refresh による DOM 再適用 (reapplySelectionToDom)
  // -------------------------------------------------------------------

  it('refresh は、選択していない項目に残っていたハイライトを外す', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    // 選択していないのに、DOM 上はハイライトが残っている項目
    itemAt(1).classList.add('selected');

    selection.refresh(container);

    expect(itemAt(0).classList.contains('selected')).toBe(true);
    expect(itemAt(1).classList.contains('selected')).toBe(false);
    expect(selection.count).toBe(1);
  });

  it('URL を持たない項目は、範囲選択の対象に数えない', () => {
    // A と B の間に、リンクを持たない項目が挟まっている
    const broken = document.createElement('li');
    broken.className = 'bookmark-item';
    itemAt(1).before(broken);
    selection.refresh(container);

    selection.handleClick(urlAt(0), 'A', itemAt(0), clickEvent());
    const itemB = container.querySelectorAll(
      '.bookmark-item'
    )[2] as HTMLElement;
    selection.handleClick(urlAt(1), 'B', itemB, clickEvent({ shiftKey: true }));

    expect(selection.count).toBe(2);
    expect(selection.getSelectedUrls()).toEqual([urlAt(0), urlAt(1)]);
    expect(broken.classList.contains('selected')).toBe(false);
  });

  it('refresh は新しい DOM 要素へ選択ハイライトを再適用する', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    // 同じ構造の新コンテナへ差し替え
    container.remove();
    const next = buildContainer();
    selection.refresh(next);

    const newItem = next.querySelectorAll('.bookmark-item')[0] as HTMLElement;
    expect(newItem.classList.contains('selected')).toBe(true);
    expect(selection.count).toBe(1);
  });

  it('refresh 後に選択 URL が存在しない場合はハイライトを付けない', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    // 選択中 URL を含まない空コンテナへ差し替え
    container.remove();
    const empty = document.createElement('div');
    empty.innerHTML = '<ul class="bookmark-list"></ul>';
    document.body.appendChild(empty);
    selection.refresh(empty);

    // map には残るがハイライト対象要素は無い
    expect(selection.count).toBe(1);
    expect(empty.querySelector('.selected')).toBeNull();
  });

  // -------------------------------------------------------------------
  // ESC キーハンドラの分岐
  // -------------------------------------------------------------------

  it('入力欄にフォーカスがあるとき ESC では選択解除しない', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    expect(selection.count).toBe(1);
  });

  it('モーダル表示中は ESC をモーダルに委ねて選択解除しない', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    const overlay = document.createElement('div');
    overlay.className = 'edit-dialog-overlay';
    document.body.appendChild(overlay);

    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    expect(selection.count).toBe(1);
  });

  // -------------------------------------------------------------------
  // ツールバーのボタン
  // -------------------------------------------------------------------

  it('ツールバーの移動/削除ボタンが対応する一括操作を呼ぶ', () => {
    const moveSpy = vi
      .spyOn(selection, 'bulkMove')
      .mockResolvedValue(undefined);
    const deleteSpy = vi
      .spyOn(selection, 'bulkDelete')
      .mockResolvedValue(undefined);

    selection.toggle(urlAt(0), 'A', itemAt(0));
    const toolbar = document.querySelector('.selection-toolbar') as HTMLElement;
    (toolbar.querySelector('.selection-toolbar-move') as HTMLElement).click();
    (toolbar.querySelector('.selection-toolbar-delete') as HTMLElement).click();

    expect(moveSpy).toHaveBeenCalledTimes(1);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('ツールバーの選択解除ボタンで選択がクリアされる', () => {
    selection.toggle(urlAt(0), 'A', itemAt(0));
    const toolbar = document.querySelector('.selection-toolbar') as HTMLElement;
    (toolbar.querySelector('.selection-toolbar-clear') as HTMLElement).click();

    expect(selection.count).toBe(0);
    expect(document.querySelector('.selection-toolbar')).toBeNull();
  });

  // -------------------------------------------------------------------
  // bulkDelete: undo / 空ヒット / 例外
  // -------------------------------------------------------------------

  it('一括削除の Undo で削除したブックマークを復元する', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve([
        { id: `id-${url}`, parentId: '1', index: 3, title: `T-${url}`, url },
      ])
    );
    mockChrome.bookmarks.remove.mockResolvedValue(undefined);
    mockChrome.bookmarks.create.mockResolvedValue(undefined);

    let captured: { undo: () => Promise<void> } | undefined;
    vi.spyOn(UndoManager.getInstance(), 'register').mockImplementation(
      (op: any) => {
        captured = op;
      }
    );

    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));

    const p = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await p;

    expect(captured).toBeDefined();
    await captured?.undo();
    expect(mockChrome.bookmarks.create).toHaveBeenCalledTimes(2);
    expect(mockChrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: '1',
      index: 3,
      title: 'T-https://a.example.com',
      url: 'https://a.example.com',
    });
  });

  it('一括削除で見つからないアイテムはスキップする', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([]);
    mockChrome.bookmarks.remove.mockResolvedValue(undefined);

    selection.toggle(urlAt(0), 'A', itemAt(0));
    const p = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await p;

    expect(mockChrome.bookmarks.remove).not.toHaveBeenCalled();
    expect(selection.count).toBe(0);
  });

  it('一括削除は、選んだ順が並び順と逆でも、「元に戻す」で元の並びに作り直す', async () => {
    const bookmarks = installTree();
    // B → A の順に選ぶ（並び順とは逆）
    selection.toggle(urlAt(1), 'B', itemAt(1));
    selection.toggle(urlAt(0), 'A', itemAt(0));

    const deleting = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await deleting;
    expect(bookmarks.titles('1')).toEqual(['C']);

    undoButton()?.click();

    await vi.waitFor(() => {
      expect(bookmarks.titles('1')).toEqual(['A', 'B', 'C']);
    });
  });

  it('一括削除で、対象を調べる段階で失敗した分も失敗として数え、残りは削除する', async () => {
    const bookmarks = installTree();
    // B だけ、どのブックマークかを調べる検索が失敗する
    const search = globalThis.chrome.bookmarks.search as ReturnType<
      typeof vi.fn
    >;
    const realSearch = search.getMockImplementation() as (query: {
      url: string;
    }) => Promise<unknown>;
    search.mockImplementation((query: { url: string }) =>
      query.url === urlAt(1)
        ? Promise.reject(new Error('boom'))
        : realSearch(query)
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));
    const deleting = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await deleting;

    expect(bookmarks.titles('1')).toEqual(['B', 'C']);
    expect(toastMessage()).toBe('1 件を削除しました（1 件は失敗）');
  });

  it('一括移動で、対象を調べる段階で失敗した分も失敗として数え、残りは移動する', async () => {
    const bookmarks = installTree();
    const search = globalThis.chrome.bookmarks.search as ReturnType<
      typeof vi.fn
    >;
    const realSearch = search.getMockImplementation() as (query: {
      url: string;
    }) => Promise<unknown>;
    search.mockImplementation((query: { url: string }) =>
      query.url === urlAt(1)
        ? Promise.reject(new Error('boom'))
        : realSearch(query)
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});

    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));
    const moving = selection.bulkMove();
    await confirmMoveTo('2');
    await moving;

    expect(bookmarks.titles('2')).toEqual(['A']);
    expect(bookmarks.titles('1')).toEqual(['B', 'C']);
    expect(toastMessage()).toBe('1 件を移動しました（1 件は失敗）');
  });

  it('一括削除で全件失敗すると「エラー」ダイアログで知らせ、「元に戻す」は出さない (#101)', async () => {
    const bookmarks = installTree();
    (
      globalThis.chrome.bookmarks.remove as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    selection.toggle(urlAt(0), 'A', itemAt(0));
    const p = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await p;

    await vi.waitFor(() => {
      expect(errorDialogMessage()).toBe(
        '❌ 1 件のブックマークを削除できませんでした。'
      );
    });
    expect(undoButton()).toBeNull();
    expect(toastMessage()).toBeUndefined();
    expect(bookmarks.titles('1')).toEqual(['A', 'B', 'C']);
    expect(errSpy).toHaveBeenCalled();
    expect(selection.count).toBe(0);
    errSpy.mockRestore();
  });

  it('一括削除は途中失敗しても残りを処理し成功分を UI/Undo に反映する (#101)', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve([
        { id: `id-${url}`, parentId: '1', index: 0, title: url, url },
      ])
    );
    // 2件目 (urlAt(1)) の削除だけ失敗させる。旧実装ではここで全体が中断し、
    // 成功済みの 1件目・未処理の 3件目が UI/Undo に反映されない。
    mockChrome.bookmarks.remove.mockImplementation((id: string) =>
      id === `id-${urlAt(1)}`
        ? Promise.reject(new Error('boom'))
        : Promise.resolve(undefined)
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const toastSpy = vi.spyOn(Toast, 'show').mockReturnValue({} as never);
    const changedSpy = vi.fn();
    document.addEventListener('bookmarks-changed', changedSpy);

    let registered: { message: string } | undefined;
    vi.spyOn(UndoManager.getInstance(), 'register').mockImplementation(
      (op: any) => {
        registered = op;
      }
    );

    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));
    selection.toggle(urlAt(2), 'C', itemAt(2));

    const p = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await p;

    // 1件失敗しても 3件すべて remove を試みる (中断しない)
    expect(mockChrome.bookmarks.remove).toHaveBeenCalledTimes(3);
    // 成功分について UI 同期イベントが発火する
    expect(changedSpy).toHaveBeenCalled();
    // 成功した 2件分の Undo が登録される
    expect(registered).toBeDefined();
    expect(registered?.message).toContain('2 件');
    // 選択は解除される
    expect(selection.count).toBe(0);
    toastSpy.mockRestore();
  });

  it('未選択での bulkDelete は何もしない', async () => {
    const mockChrome = globalThis.chrome as any;
    await selection.bulkDelete();
    expect(mockChrome.bookmarks.search).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // bulkMove: undo / キャンセル / 空ヒット / 例外 / ルートラベル
  // -------------------------------------------------------------------

  it('一括移動の Undo で、元のフォルダの元の並びへ戻す', async () => {
    const bookmarks = installTree();
    selection.toggle(urlAt(1), 'B', itemAt(1));
    selection.toggle(urlAt(2), 'C', itemAt(2));

    const moving = selection.bulkMove();
    await confirmMoveTo('2');
    await moving;
    expect(bookmarks.titles('1')).toEqual(['A']);

    undoButton()?.click();

    await vi.waitFor(() => {
      expect(bookmarks.titles('1')).toEqual(['A', 'B', 'C']);
    });
    expect(bookmarks.titles('2')).toEqual([]);
  });

  it('一括移動ダイアログをキャンセルすると move を呼ばない', async () => {
    const mockChrome = globalThis.chrome as any;
    selection.toggle(urlAt(0), 'A', itemAt(0));

    const p = selection.bulkMove();
    await new Promise((r) => setTimeout(r, 10));
    (
      document.querySelector(
        '#bulk-move-dialog .edit-dialog-cancel'
      ) as HTMLElement
    ).click();
    await p;

    expect(mockChrome.bookmarks.move).not.toHaveBeenCalled();
    expect(selection.count).toBe(1);
  });

  it('一括移動で見つからないアイテムはスキップする', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([]);
    mockChrome.bookmarks.move.mockResolvedValue(undefined);

    selection.toggle(urlAt(0), 'A', itemAt(0));
    const p = selection.bulkMove();
    await new Promise((r) => setTimeout(r, 10));
    const select = document.getElementById(
      'bulk-move-parent'
    ) as HTMLSelectElement;
    select.value = '2';
    (document.querySelector('.bulk-move-confirm') as HTMLElement).click();
    await p;

    expect(mockChrome.bookmarks.move).not.toHaveBeenCalled();
    expect(selection.count).toBe(0);
  });

  it('一括移動で全件失敗すると「エラー」ダイアログで知らせ、「元に戻す」は出さない (#101)', async () => {
    const bookmarks = installTree();
    (
      globalThis.chrome.bookmarks.move as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    selection.toggle(urlAt(0), 'A', itemAt(0));
    const moving = selection.bulkMove();
    await confirmMoveTo('2');
    await moving;

    await vi.waitFor(() => {
      expect(errorDialogMessage()).toBe(
        '❌ 1 件のブックマークを移動できませんでした。'
      );
    });
    expect(undoButton()).toBeNull();
    expect(toastMessage()).toBeUndefined();
    expect(bookmarks.titles('1')).toEqual(['A', 'B', 'C']);
    expect(errSpy).toHaveBeenCalled();
    expect(selection.count).toBe(0);
    errSpy.mockRestore();
  });

  it('一括移動は途中の 1 件が失敗しても残りを移し、「元に戻す」は移せた分を元の並びへ戻す (#101)', async () => {
    const bookmarks = installTree();
    // B の移動だけ失敗させる。それ以外は代役がそのまま動かす
    const move = globalThis.chrome.bookmarks.move as ReturnType<typeof vi.fn>;
    const realMove = move.getMockImplementation() as (
      ...args: unknown[]
    ) => Promise<unknown>;
    move.mockImplementation((id: string, ...rest: unknown[]) =>
      id === 'b' ? Promise.reject(new Error('boom')) : realMove(id, ...rest)
    );
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const changedSpy = vi.fn();
    document.addEventListener('bookmarks-changed', changedSpy);

    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));
    selection.toggle(urlAt(2), 'C', itemAt(2));

    const moving = selection.bulkMove();
    await confirmMoveTo('2');
    await moving;

    expect(bookmarks.titles('2')).toEqual(['A', 'C']);
    expect(bookmarks.titles('1')).toEqual(['B']);
    expect(toastMessage()).toBe('2 件を移動しました（1 件は失敗）');
    expect(changedSpy).toHaveBeenCalled();
    expect(selection.count).toBe(0);

    move.mockImplementation(realMove);
    undoButton()?.click();

    await vi.waitFor(() => {
      expect(bookmarks.titles('1')).toEqual(['A', 'B', 'C']);
    });
    expect(bookmarks.titles('2')).toEqual([]);
  });

  it('未選択での bulkMove は何もしない', async () => {
    const mockChrome = globalThis.chrome as any;
    await selection.bulkMove();
    expect(mockChrome.bookmarks.getTree).not.toHaveBeenCalled();
  });

  it('タイトル無しフォルダは「(ルート: id)」ラベルで移動先候補に出す', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.getTree = vi.fn().mockResolvedValue([
      {
        id: '0',
        title: '',
        children: [{ id: '1', title: '', children: [] }],
      },
    ]);

    selection.toggle(urlAt(0), 'A', itemAt(0));
    const p = selection.bulkMove();
    await new Promise((r) => setTimeout(r, 10));
    const dialog = document.getElementById('bulk-move-dialog');
    expect(dialog?.textContent).toContain('(ルート: 1)');

    // Escape でキャンセル
    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    await p;
    expect(mockChrome.bookmarks.move).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------
  // ダイアログの Escape ハンドラ
  // -------------------------------------------------------------------

  it('一括削除確認ダイアログは Escape で閉じてキャンセル扱いになる', async () => {
    const mockChrome = globalThis.chrome as any;
    selection.toggle(urlAt(0), 'A', itemAt(0));

    const p = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById('bulk-confirm-dialog')).not.toBeNull();

    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    await p;

    expect(document.getElementById('bulk-confirm-dialog')).toBeNull();
    expect(mockChrome.bookmarks.remove).not.toHaveBeenCalled();
  });
});
