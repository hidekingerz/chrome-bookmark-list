import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkEditor } from '../src/components/BookmarkActions/BookmarkEditor';
import { UndoManager } from '../src/components/UndoManager/index';
import type { ChromeBookmarkNode } from '../src/types/bookmark';

// BookmarkEditor クラスの保存・Undo・補助パスを直接検証するテスト
// （test/bookmark-edit.test.ts は newtab-core 経由でダイアログ表示までを検証しており、
//  成功保存時の update/move 実行・Undo コールバック・補助分岐が未到達のため補完する）
describe('BookmarkEditor の保存と Undo', () => {
  let dom: JSDOM;
  let document: Document;
  let editor: BookmarkEditor;

  // ブックマークバー配下に folder-1 / folder-2 を持つツリー
  const tree: ChromeBookmarkNode[] = [
    {
      id: '0',
      title: 'root',
      children: [
        {
          id: '1',
          title: 'ブックマークバー',
          children: [
            { id: 'folder-1', title: 'フォルダ1', children: [] },
            { id: 'folder-2', title: 'フォルダ2', children: [] },
          ],
        },
      ],
    },
  ];

  const bookmark: ChromeBookmarkNode = {
    id: 'bookmark-1',
    title: '元のタイトル',
    url: 'https://example.com',
    parentId: 'folder-1',
    index: 3,
  };

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
      url: 'chrome-extension://test/newtab.html',
    });
    document = dom.window.document;

    Object.defineProperty(globalThis, 'document', {
      value: document,
      writable: true,
      configurable: true,
    });
    // ESC キーハンドラ用に KeyboardEvent をグローバルへ
    Object.defineProperty(globalThis, 'KeyboardEvent', {
      value: dom.window.KeyboardEvent,
      writable: true,
      configurable: true,
    });
    // dispatchBookmarksChanged が new CustomEvent するため JSDOM のものへ揃える
    // （別レルムの Event だと JSDOM document のリスナーが発火しない）
    Object.defineProperty(globalThis, 'CustomEvent', {
      value: dom.window.CustomEvent,
      writable: true,
      configurable: true,
    });

    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search = vi.fn().mockResolvedValue([bookmark]);
    mockChrome.bookmarks.getTree = vi.fn().mockResolvedValue(tree);
    mockChrome.bookmarks.update = vi.fn().mockResolvedValue(undefined);
    mockChrome.bookmarks.move = vi.fn().mockResolvedValue(undefined);

    editor = new BookmarkEditor();
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  function makeEditBtn(): HTMLElement {
    const editBtn = document.createElement('button');
    editBtn.setAttribute('data-bookmark-url', 'https://example.com');
    editBtn.setAttribute('data-bookmark-title', '元のタイトル');
    return editBtn;
  }

  it('タイトル・URL変更＋フォルダ移動の保存で update/move を呼び Undo を登録、Undo で元に戻す', async () => {
    // UndoManager.register をスパイして登録された undo コールバックを捕捉する
    const registerSpy = vi
      .spyOn(UndoManager.getInstance(), 'register')
      .mockImplementation(() => {});

    // bookmarks-changed イベントの発火を監視
    const changedActions: string[] = [];
    document.addEventListener('bookmarks-changed', (e) => {
      changedActions.push((e as CustomEvent).detail.action);
    });

    await editor.handleBookmarkEdit(makeEditBtn());

    // 値を変更（タイトル・URL・フォルダすべて変更）
    const titleInput = document.getElementById(
      'edit-title'
    ) as HTMLInputElement;
    const urlInput = document.getElementById('edit-url') as HTMLInputElement;
    const folderSelect = document.getElementById(
      'edit-folder'
    ) as HTMLSelectElement;
    titleInput.value = '新しいタイトル';
    urlInput.value = 'https://new.example.com';
    folderSelect.value = 'folder-2';

    const saveBtn = document.querySelector('.edit-dialog-save') as HTMLElement;
    saveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const mockChrome = globalThis.chrome as any;
    // updateBookmark（266行）が新しい値で呼ばれる
    expect(mockChrome.bookmarks.update).toHaveBeenCalledWith('bookmark-1', {
      title: '新しいタイトル',
      url: 'https://new.example.com',
    });
    // moveBookmark（272-276行）が新しい親で呼ばれる
    expect(mockChrome.bookmarks.move).toHaveBeenCalledWith('bookmark-1', {
      parentId: 'folder-2',
    });
    // ダイアログが閉じ、edit アクションが発火
    expect(document.getElementById('edit-dialog')).toBeFalsy();
    expect(changedActions).toContain('edit');
    // Undo が登録される
    expect(registerSpy).toHaveBeenCalledTimes(1);
    const registered = registerSpy.mock.calls[0][0];
    expect(registered.message).toBe('「新しいタイトル」を編集しました');

    // 捕捉した undo コールバックを実行（229-244行）
    mockChrome.bookmarks.update.mockClear();
    mockChrome.bookmarks.move.mockClear();
    await registered.undo();

    // 元のタイトル・URLへ戻す
    expect(mockChrome.bookmarks.update).toHaveBeenCalledWith('bookmark-1', {
      title: '元のタイトル',
      url: 'https://example.com',
    });
    // 元の親・index へ戻す
    expect(mockChrome.bookmarks.move).toHaveBeenCalledWith('bookmark-1', {
      parentId: 'folder-1',
      index: 3,
    });
    // undo-edit アクションが発火
    expect(changedActions).toContain('undo-edit');
  });

  it('変更が無い保存では update/move も Undo 登録も行わない', async () => {
    const registerSpy = vi
      .spyOn(UndoManager.getInstance(), 'register')
      .mockImplementation(() => {});

    await editor.handleBookmarkEdit(makeEditBtn());

    // 値を一切変更せず保存
    const saveBtn = document.querySelector('.edit-dialog-save') as HTMLElement;
    saveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const mockChrome = globalThis.chrome as any;
    expect(mockChrome.bookmarks.update).not.toHaveBeenCalled();
    expect(mockChrome.bookmarks.move).not.toHaveBeenCalled();
    expect(registerSpy).not.toHaveBeenCalled();
    // ダイアログは閉じる
    expect(document.getElementById('edit-dialog')).toBeFalsy();
  });

  it('入力要素が欠落している場合は早期 return し保存しない（186行）', async () => {
    await editor.handleBookmarkEdit(makeEditBtn());

    // URL 入力欄を削除してから保存
    document.getElementById('edit-url')?.remove();
    const saveBtn = document.querySelector('.edit-dialog-save') as HTMLElement;
    saveBtn.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const mockChrome = globalThis.chrome as any;
    expect(mockChrome.bookmarks.update).not.toHaveBeenCalled();
    expect(mockChrome.bookmarks.move).not.toHaveBeenCalled();
    // ダイアログは閉じられない（早期 return のため）
    expect(document.getElementById('edit-dialog')).toBeTruthy();
  });

  it('既存ダイアログがある状態で再度開くと古いダイアログを置き換える（78行）', async () => {
    await editor.handleBookmarkEdit(makeEditBtn());
    const first = document.getElementById('edit-dialog');
    expect(first).toBeTruthy();

    // 2回目の編集 → 既存ダイアログ削除 → 新しいダイアログ
    await editor.handleBookmarkEdit(makeEditBtn());
    const dialogs = document.querySelectorAll('#edit-dialog');
    expect(dialogs.length).toBe(1);
  });

  it('ESC キーでダイアログが閉じる（158-160行）', async () => {
    await editor.handleBookmarkEdit(makeEditBtn());
    expect(document.getElementById('edit-dialog')).toBeTruthy();

    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape' })
    );

    expect(document.getElementById('edit-dialog')).toBeFalsy();
  });

  it('検索で例外が発生した場合はエラー表示する（42-43行）', async () => {
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockRejectedValue(new Error('検索失敗'));
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});

    await editor.handleBookmarkEdit(makeEditBtn());

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ ブックマークの編集準備に失敗しました:',
      expect.any(Error)
    );
    expect(alertSpy).toHaveBeenCalledWith(
      'ブックマークの編集準備に失敗しました。'
    );
    expect(document.getElementById('edit-dialog')).toBeFalsy();
  });
});
