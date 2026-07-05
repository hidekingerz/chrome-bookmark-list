import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderDeleter } from '../src/components/BookmarkActions/FolderDeleter';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

describe('FolderDeleter', () => {
  let dom: JSDOM;

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

    UndoManager.getInstance().clear();
    Toast.dismissCurrent();

    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: {
        getSubTree: ReturnType<typeof vi.fn>;
        removeTree: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
      };
    };
    // 削除対象のサブツリー: フォルダの中にブックマーク2件とサブフォルダ1件（中にブックマーク1件）
    mockChrome.bookmarks.getSubTree = vi.fn().mockResolvedValue([
      {
        id: 'target',
        parentId: 'parent',
        index: 3,
        title: '削除対象フォルダ',
        children: [
          { id: 'b1', title: 'B1', url: 'https://b1.example.com' },
          { id: 'b2', title: 'B2', url: 'https://b2.example.com' },
          {
            id: 'sub',
            title: 'サブ',
            children: [
              { id: 'b3', title: 'B3', url: 'https://b3.example.com' },
            ],
          },
        ],
      },
    ]);
    mockChrome.bookmarks.removeTree = vi.fn().mockResolvedValue(undefined);

    // create は呼ばれるたびに連番のIDを返す
    let createId = 1000;
    mockChrome.bookmarks.create = vi.fn().mockImplementation(async () => ({
      id: `restored-${createId++}`,
    }));
  });

  afterEach(() => {
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    dom.window.close();
    vi.clearAllMocks();
  });

  it('openDeleteDialog で確認ダイアログが表示される', async () => {
    const deleter = new FolderDeleter();
    void deleter.openDeleteDialog('target');
    await new Promise((r) => setTimeout(r, 10));

    const dialog = document.getElementById('folder-delete-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('削除対象フォルダ');
  });

  it('中身がある場合は警告メッセージに件数が表示される', async () => {
    const deleter = new FolderDeleter();
    void deleter.openDeleteDialog('target');
    await new Promise((r) => setTimeout(r, 10));

    const dialog = document.getElementById('folder-delete-dialog');
    // ブックマーク3件 (b1, b2, b3) + サブフォルダ1件 (sub)
    expect(dialog?.textContent).toContain('3件のブックマーク');
    expect(dialog?.textContent).toContain('1件のサブフォルダ');
  });

  it('キャンセルすると removeTree が呼ばれない', async () => {
    const deleter = new FolderDeleter();
    const promise = deleter.openDeleteDialog('target');
    await new Promise((r) => setTimeout(r, 10));

    const cancelBtn = document.querySelector(
      '.edit-dialog-cancel'
    ) as HTMLButtonElement;
    cancelBtn.click();
    await promise;

    expect(chrome.bookmarks.removeTree).not.toHaveBeenCalled();
    expect(document.getElementById('folder-delete-dialog')).toBeNull();
  });

  it('削除を確認すると removeTree が呼ばれ bookmarks-changed が発火する', async () => {
    const deleter = new FolderDeleter();
    const changedSpy = vi.fn();
    document.addEventListener('bookmarks-changed', changedSpy);

    const promise = deleter.openDeleteDialog('target');
    await new Promise((r) => setTimeout(r, 10));

    const confirmBtn = document.querySelector(
      '.folder-delete-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await promise;

    expect(chrome.bookmarks.removeTree).toHaveBeenCalledWith('target');
    expect(changedSpy).toHaveBeenCalled();
    document.removeEventListener('bookmarks-changed', changedSpy);
  });

  it('Undo で削除されたサブツリーが再帰的に復元される', async () => {
    const deleter = new FolderDeleter();

    const promise = deleter.openDeleteDialog('target');
    await new Promise((r) => setTimeout(r, 10));
    (
      document.querySelector('.folder-delete-confirm') as HTMLButtonElement
    ).click();
    await promise;

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();

    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 50));

    // ルートフォルダ + サブフォルダ + ブックマーク3件 = 5回 create が呼ばれる
    expect(chrome.bookmarks.create).toHaveBeenCalledTimes(5);
    // 最初のcreateは元のparentId/index/titleで呼ばれる
    expect(chrome.bookmarks.create).toHaveBeenNthCalledWith(1, {
      parentId: 'parent',
      index: 3,
      title: '削除対象フォルダ',
      url: undefined,
    });
  });

  it('ESC でダイアログが閉じる', async () => {
    const deleter = new FolderDeleter();
    void deleter.openDeleteDialog('target');
    await new Promise((r) => setTimeout(r, 10));

    const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(document.getElementById('folder-delete-dialog')).toBeNull();
  });

  it('削除対象が見つからない場合は console.error しダイアログを出さない', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { getSubTree: ReturnType<typeof vi.fn> };
    };
    // getSubTree が空配列を返す → 分割代入で subtree が undefined になる
    mockChrome.bookmarks.getSubTree = vi.fn().mockResolvedValue([]);

    const deleter = new FolderDeleter();
    await deleter.openDeleteDialog('missing');

    expect(consoleSpy).toHaveBeenCalledWith(
      '❌ 削除対象のフォルダが見つかりません:',
      'missing'
    );
    expect(document.getElementById('folder-delete-dialog')).toBeNull();
    expect(chrome.bookmarks.removeTree).not.toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('getSubTree が失敗すると catch で console.error する', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { getSubTree: ReturnType<typeof vi.fn> };
    };
    mockChrome.bookmarks.getSubTree = vi
      .fn()
      .mockRejectedValue(new Error('API error'));

    const deleter = new FolderDeleter();
    await deleter.openDeleteDialog('target');

    expect(consoleSpy).toHaveBeenCalledWith(
      '❌ フォルダの削除に失敗しました:',
      expect.any(Error)
    );
    expect(document.getElementById('folder-delete-dialog')).toBeNull();

    consoleSpy.mockRestore();
  });

  it('removeTree 失敗時に Toast でエラーを通知する (#105)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (
      globalThis.chrome.bookmarks.removeTree as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('remove failure'));
    const registerSpy = vi.spyOn(UndoManager.getInstance(), 'register');

    const deleter = new FolderDeleter();
    const promise = deleter.openDeleteDialog('target');
    await new Promise((r) => setTimeout(r, 10));

    (
      document.querySelector('.folder-delete-confirm') as HTMLButtonElement
    ).click();
    await promise;
    await new Promise((r) => setTimeout(r, 10));

    // 失敗はユーザーへ Toast で通知される（console のみで握りつぶさない）
    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('削除に失敗');
    // 削除自体が失敗したため Undo アクションは付かない
    expect(toast?.querySelector('.app-toast-action')).toBeNull();
    expect(registerSpy).not.toHaveBeenCalled();

    registerSpy.mockRestore();
    consoleSpy.mockRestore();
  });

  it('parentId が無いフォルダの削除では Undo が登録されない', async () => {
    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { getSubTree: ReturnType<typeof vi.fn> };
    };
    // ルート直下など parentId を持たないフォルダ
    mockChrome.bookmarks.getSubTree = vi.fn().mockResolvedValue([
      {
        id: 'noparent',
        title: 'ルート直下フォルダ',
        children: [{ id: 'b1', title: 'B1', url: 'https://b1.example.com' }],
      },
    ]);
    const registerSpy = vi.spyOn(UndoManager.getInstance(), 'register');

    const deleter = new FolderDeleter();
    const promise = deleter.openDeleteDialog('noparent');
    await new Promise((r) => setTimeout(r, 10));
    (
      document.querySelector('.folder-delete-confirm') as HTMLButtonElement
    ).click();
    await promise;

    expect(chrome.bookmarks.removeTree).toHaveBeenCalledWith('noparent');
    // parentId が無いため Undo は登録されず Toast も出ない
    expect(registerSpy).not.toHaveBeenCalled();
    expect(document.querySelector('.app-toast')).toBeNull();

    registerSpy.mockRestore();
  });

  it('×（閉じる）ボタンでキャンセル扱いになり removeTree が呼ばれない', async () => {
    const deleter = new FolderDeleter();
    const promise = deleter.openDeleteDialog('target');
    await new Promise((r) => setTimeout(r, 10));

    const closeBtn = document.querySelector(
      '.edit-dialog-close'
    ) as HTMLButtonElement;
    closeBtn.click();
    await promise;

    expect(chrome.bookmarks.removeTree).not.toHaveBeenCalled();
    expect(document.getElementById('folder-delete-dialog')).toBeNull();
  });

  it('中身が空のフォルダでは警告メッセージが表示されない', async () => {
    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { getSubTree: ReturnType<typeof vi.fn> };
    };
    mockChrome.bookmarks.getSubTree = vi.fn().mockResolvedValue([
      {
        id: 'empty',
        parentId: 'parent',
        index: 0,
        title: '空フォルダ',
        children: [],
      },
    ]);

    const deleter = new FolderDeleter();
    void deleter.openDeleteDialog('empty');
    await new Promise((r) => setTimeout(r, 10));

    const dialog = document.getElementById('folder-delete-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('.delete-warning')).toBeNull();
    expect(dialog?.textContent).not.toContain('件のブックマーク');
  });

  it('ブックマークのみでサブフォルダ無しの場合はサブフォルダ件数を表示しない', async () => {
    const mockChrome = globalThis.chrome as unknown as {
      bookmarks: { getSubTree: ReturnType<typeof vi.fn> };
    };
    mockChrome.bookmarks.getSubTree = vi.fn().mockResolvedValue([
      {
        id: 'onlybm',
        parentId: 'parent',
        index: 0,
        title: 'ブックマークのみ',
        children: [{ id: 'b1', title: 'B1', url: 'https://b1.example.com' }],
      },
    ]);

    const deleter = new FolderDeleter();
    void deleter.openDeleteDialog('onlybm');
    await new Promise((r) => setTimeout(r, 10));

    const dialog = document.getElementById('folder-delete-dialog');
    expect(dialog?.textContent).toContain('1件のブックマーク');
    expect(dialog?.textContent).not.toContain('サブフォルダ');
  });
});
