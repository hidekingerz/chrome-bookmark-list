import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderCreator } from '../src/components/BookmarkActions/FolderCreator';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

describe('FolderCreator', () => {
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
        getTree: ReturnType<typeof vi.fn>;
        create: ReturnType<typeof vi.fn>;
        removeTree: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.bookmarks.getTree = vi.fn().mockResolvedValue([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: 'ブックマークバー',
            children: [{ id: '11', title: 'サブ', children: [] }],
          },
          { id: '2', title: 'その他のブックマーク', children: [] },
        ],
      },
    ]);
    mockChrome.bookmarks.create = vi
      .fn()
      .mockResolvedValue({ id: 'new-folder', title: '新規' });
    mockChrome.bookmarks.removeTree = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    dom.window.close();
    vi.clearAllMocks();
  });

  it('openCreateDialog でダイアログが表示される', async () => {
    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    const dialog = document.getElementById('folder-create-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('新しいフォルダを作成');
  });

  it('親フォルダの選択肢にすべてのフォルダが列挙される', async () => {
    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    const select = document.getElementById(
      'folder-create-parent'
    ) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('1');
    expect(options).toContain('2');
    expect(options).toContain('11');
  });

  it('defaultParentId で指定したフォルダが既定で選択される', async () => {
    const creator = new FolderCreator();
    await creator.openCreateDialog('11');

    const select = document.getElementById(
      'folder-create-parent'
    ) as HTMLSelectElement;
    expect(select.value).toBe('11');
  });

  it('作成ボタンで chrome.bookmarks.create が呼ばれ bookmarks-changed が発火される', async () => {
    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    const nameInput = document.getElementById(
      'folder-create-name'
    ) as HTMLInputElement;
    nameInput.value = '新規フォルダ';

    const changedSpy = vi.fn();
    document.addEventListener('bookmarks-changed', changedSpy);

    const confirmBtn = document.querySelector(
      '.folder-create-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: '1',
      title: '新規フォルダ',
    });
    expect(changedSpy).toHaveBeenCalled();
    expect(document.getElementById('folder-create-dialog')).toBeNull();

    document.removeEventListener('bookmarks-changed', changedSpy);
  });

  it('フォルダ名が空のときは作成されない', async () => {
    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    const confirmBtn = document.querySelector(
      '.folder-create-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.create).not.toHaveBeenCalled();
    expect(document.getElementById('folder-create-dialog')).not.toBeNull();
  });

  it('作成後に Undo Toast が表示され、Undo で removeTree が呼ばれる', async () => {
    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    const nameInput = document.getElementById(
      'folder-create-name'
    ) as HTMLInputElement;
    nameInput.value = '新規フォルダ';

    const confirmBtn = document.querySelector(
      '.folder-create-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('新規フォルダ');

    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.removeTree).toHaveBeenCalledWith('new-folder');
  });

  it('Enter キーで作成が実行される', async () => {
    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    const nameInput = document.getElementById(
      'folder-create-name'
    ) as HTMLInputElement;
    nameInput.value = 'Enter作成';

    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    });
    nameInput.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: '1',
      title: 'Enter作成',
    });
  });

  it('ESC キーでダイアログが閉じる', async () => {
    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    expect(document.getElementById('folder-create-dialog')).not.toBeNull();

    const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(document.getElementById('folder-create-dialog')).toBeNull();
  });

  it('getTree が失敗するとダイアログを表示せず console.error する', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (
      globalThis.chrome.bookmarks.getTree as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('tree failure'));

    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    expect(document.getElementById('folder-create-dialog')).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(
      '❌ フォルダ作成ダイアログの表示に失敗:',
      expect.any(Error)
    );

    errorSpy.mockRestore();
  });

  it('create が失敗すると console.error し Undo を登録しない', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (
      globalThis.chrome.bookmarks.create as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('create failure'));
    const registerSpy = vi.spyOn(UndoManager.getInstance(), 'register');

    const creator = new FolderCreator();
    await creator.openCreateDialog('1');

    const nameInput = document.getElementById(
      'folder-create-name'
    ) as HTMLInputElement;
    nameInput.value = '失敗フォルダ';

    const confirmBtn = document.querySelector(
      '.folder-create-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.create).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      '❌ フォルダの作成に失敗しました:',
      expect.any(Error)
    );
    expect(registerSpy).not.toHaveBeenCalled();
    // ダイアログは閉じられないまま残る
    expect(document.getElementById('folder-create-dialog')).not.toBeNull();

    registerSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
