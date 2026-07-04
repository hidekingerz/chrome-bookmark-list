import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkSelection } from '../src/components/BookmarkSelection/BookmarkSelection';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

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

  it('一括削除で全件失敗すると失敗を通知し Undo を登録しない (#101)', async () => {
    // 旧挙動 (ループ全体を catch し console.error のみ) の assert を #101 の
    // 根本修正に合わせて意図的に更新: 各件を捕捉してログし、成功が0なら
    // Undo は登録せず Toast で失敗を通知する。
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve([{ id: `id-${url}`, parentId: '1', index: 0, url }])
    );
    mockChrome.bookmarks.remove.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const toastSpy = vi.spyOn(Toast, 'show').mockReturnValue({} as never);
    const registerSpy = vi
      .spyOn(UndoManager.getInstance(), 'register')
      .mockImplementation(() => {});

    selection.toggle(urlAt(0), 'A', itemAt(0));
    const p = selection.bulkDelete();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.delete-dialog-confirm') as HTMLElement).click();
    await p;

    expect(errSpy).toHaveBeenCalledWith(
      '❌ 一括削除中にブックマークの削除に失敗しました:',
      expect.any(Error)
    );
    expect(registerSpy).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith({
      message: '1 件のブックマークを削除できませんでした',
    });
    expect(selection.count).toBe(0);
    errSpy.mockRestore();
    toastSpy.mockRestore();
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

  it('一括移動の Undo で元の親フォルダへ戻す (親不明はスキップ)', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockImplementation(
      ({ url }: { url: string }) => {
        // a は親あり、b は親 undefined (Undo でスキップされる)
        if (url === urlAt(0)) {
          return Promise.resolve([
            { id: 'id-a', parentId: '1', index: 2, url },
          ]);
        }
        return Promise.resolve([
          { id: 'id-b', parentId: undefined, index: undefined, url },
        ]);
      }
    );
    mockChrome.bookmarks.move.mockResolvedValue(undefined);

    let captured: { undo: () => Promise<void> } | undefined;
    vi.spyOn(UndoManager.getInstance(), 'register').mockImplementation(
      (op: any) => {
        captured = op;
      }
    );

    selection.toggle(urlAt(0), 'A', itemAt(0));
    selection.toggle(urlAt(1), 'B', itemAt(1));

    const p = selection.bulkMove();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.bulk-move-confirm') as HTMLElement).click();
    await p;

    expect(mockChrome.bookmarks.move).toHaveBeenCalledTimes(2);
    mockChrome.bookmarks.move.mockClear();

    await captured?.undo();
    // 親ありの a のみ戻す
    expect(mockChrome.bookmarks.move).toHaveBeenCalledTimes(1);
    expect(mockChrome.bookmarks.move).toHaveBeenCalledWith('id-a', {
      parentId: '1',
      index: 2,
    });
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

  it('一括移動で全件失敗すると失敗を通知し Undo を登録しない (#101)', async () => {
    // 旧挙動の assert を #101 の根本修正に合わせて意図的に更新。
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve([{ id: `id-${url}`, parentId: '1', index: 0, url }])
    );
    mockChrome.bookmarks.move.mockRejectedValue(new Error('boom'));
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const toastSpy = vi.spyOn(Toast, 'show').mockReturnValue({} as never);
    const registerSpy = vi
      .spyOn(UndoManager.getInstance(), 'register')
      .mockImplementation(() => {});

    selection.toggle(urlAt(0), 'A', itemAt(0));
    const p = selection.bulkMove();
    await new Promise((r) => setTimeout(r, 10));
    (document.querySelector('.bulk-move-confirm') as HTMLElement).click();
    await p;

    expect(errSpy).toHaveBeenCalledWith(
      '❌ 一括移動中にブックマークの移動に失敗しました:',
      expect.any(Error)
    );
    expect(registerSpy).not.toHaveBeenCalled();
    expect(toastSpy).toHaveBeenCalledWith({
      message: '1 件のブックマークを移動できませんでした',
    });
    expect(selection.count).toBe(0);
    errSpy.mockRestore();
    toastSpy.mockRestore();
  });

  it('一括移動は途中失敗しても残りを処理し成功分を UI/Undo に反映する (#101)', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockImplementation(({ url }: { url: string }) =>
      Promise.resolve([
        { id: `id-${url}`, parentId: '1', index: 0, title: url, url },
      ])
    );
    // 2件目 (urlAt(1)) の移動だけ失敗させる。旧実装ではここで全体が中断する。
    mockChrome.bookmarks.move.mockImplementation((id: string) =>
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

    const p = selection.bulkMove();
    await new Promise((r) => setTimeout(r, 10));
    const select = document.getElementById(
      'bulk-move-parent'
    ) as HTMLSelectElement;
    select.value = '2';
    (document.querySelector('.bulk-move-confirm') as HTMLElement).click();
    await p;

    // 1件失敗しても 3件すべて move を試みる (中断しない)
    expect(mockChrome.bookmarks.move).toHaveBeenCalledTimes(3);
    expect(changedSpy).toHaveBeenCalled();
    expect(registered).toBeDefined();
    expect(registered?.message).toContain('2 件');
    expect(selection.count).toBe(0);
    toastSpy.mockRestore();
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
