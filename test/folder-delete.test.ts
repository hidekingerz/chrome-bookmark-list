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
});
