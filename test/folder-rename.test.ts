import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderRenamer } from '../src/components/BookmarkActions/FolderRenamer';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

describe('FolderRenamer', () => {
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
        get: ReturnType<typeof vi.fn>;
        getChildren: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.bookmarks.get = vi
      .fn()
      .mockResolvedValue([{ id: 'f1', parentId: 'p1', title: '元の名前' }]);
    mockChrome.bookmarks.getChildren = vi.fn().mockResolvedValue([
      { id: 'f1', parentId: 'p1', title: '元の名前' },
      { id: 'f2', parentId: 'p1', title: '他のフォルダ' },
    ]);
    mockChrome.bookmarks.update = vi.fn().mockResolvedValue({});
  });

  afterEach(() => {
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    dom.window.close();
    vi.clearAllMocks();
  });

  it('openRenameDialog でダイアログが表示され、現在のフォルダ名が入力済みになる', async () => {
    const renamer = new FolderRenamer();
    await renamer.openRenameDialog('f1');

    const dialog = document.getElementById('folder-rename-dialog');
    expect(dialog).not.toBeNull();
    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement;
    expect(input.value).toBe('元の名前');
  });

  it('新しい名前で保存すると chrome.bookmarks.update が呼ばれる', async () => {
    const renamer = new FolderRenamer();
    await renamer.openRenameDialog('f1');

    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement;
    input.value = '新しい名前';

    const changedSpy = vi.fn();
    document.addEventListener('bookmarks-changed', changedSpy);

    const confirmBtn = document.querySelector(
      '.folder-rename-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.update).toHaveBeenCalledWith('f1', {
      title: '新しい名前',
    });
    expect(changedSpy).toHaveBeenCalled();
    expect(document.getElementById('folder-rename-dialog')).toBeNull();

    document.removeEventListener('bookmarks-changed', changedSpy);
  });

  it('空文字で保存しようとするとエラー表示され update は呼ばれない', async () => {
    const renamer = new FolderRenamer();
    await renamer.openRenameDialog('f1');

    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement;
    input.value = '   ';

    const confirmBtn = document.querySelector(
      '.folder-rename-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.update).not.toHaveBeenCalled();
    const errorEl = document.querySelector(
      '.folder-rename-error'
    ) as HTMLElement;
    expect(errorEl?.style.display).toBe('block');
    expect(errorEl?.textContent).toContain('フォルダ名を入力してください');
  });

  it('同階層に同名フォルダがある場合はエラー表示される', async () => {
    const renamer = new FolderRenamer();
    await renamer.openRenameDialog('f1');

    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement;
    input.value = '他のフォルダ';

    const confirmBtn = document.querySelector(
      '.folder-rename-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.update).not.toHaveBeenCalled();
    const errorEl = document.querySelector(
      '.folder-rename-error'
    ) as HTMLElement;
    expect(errorEl?.style.display).toBe('block');
    expect(errorEl?.textContent).toContain(
      '同じ名前のフォルダが既に存在します'
    );
  });

  it('変更がないとき (元の名前のまま) は update が呼ばれずダイアログだけ閉じる', async () => {
    const renamer = new FolderRenamer();
    await renamer.openRenameDialog('f1');

    const confirmBtn = document.querySelector(
      '.folder-rename-confirm'
    ) as HTMLButtonElement;
    confirmBtn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.update).not.toHaveBeenCalled();
    expect(document.getElementById('folder-rename-dialog')).toBeNull();
  });

  it('保存後に Undo Toast が表示され、Undo で元の名前に戻る', async () => {
    const renamer = new FolderRenamer();
    await renamer.openRenameDialog('f1');

    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement;
    input.value = '新しい名前';

    (
      document.querySelector('.folder-rename-confirm') as HTMLButtonElement
    ).click();
    await new Promise((r) => setTimeout(r, 10));

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();

    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.update).toHaveBeenLastCalledWith('f1', {
      title: '元の名前',
    });
  });

  it('Enter キーで保存が実行される', async () => {
    const renamer = new FolderRenamer();
    await renamer.openRenameDialog('f1');

    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement;
    input.value = 'Enter保存';

    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
    });
    input.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(chrome.bookmarks.update).toHaveBeenCalledWith('f1', {
      title: 'Enter保存',
    });
  });

  it('ESC キーでダイアログが閉じる', async () => {
    const renamer = new FolderRenamer();
    await renamer.openRenameDialog('f1');

    const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(document.getElementById('folder-rename-dialog')).toBeNull();
  });

  describe('未到達分岐の補完', () => {
    it('対象フォルダが見つからない場合 console.error しダイアログを表示しない', async () => {
      const mockChrome = globalThis.chrome as unknown as {
        bookmarks: { get: ReturnType<typeof vi.fn> };
      };
      mockChrome.bookmarks.get.mockResolvedValue([]);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const renamer = new FolderRenamer();
      await renamer.openRenameDialog('missing');

      expect(document.getElementById('folder-rename-dialog')).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        '❌ リネーム対象のフォルダが見つかりません:',
        'missing'
      );
      errorSpy.mockRestore();
    });

    it('chrome.bookmarks.get が失敗した場合 catch で console.error する', async () => {
      const mockChrome = globalThis.chrome as unknown as {
        bookmarks: { get: ReturnType<typeof vi.fn> };
      };
      mockChrome.bookmarks.get.mockRejectedValue(new Error('API Error'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const renamer = new FolderRenamer();
      await renamer.openRenameDialog('f1');

      expect(document.getElementById('folder-rename-dialog')).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        '❌ リネームダイアログの表示に失敗:',
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });

    it('parentId を持たないフォルダでは getChildren を呼ばず兄弟チェックなしで保存できる', async () => {
      const mockChrome = globalThis.chrome as unknown as {
        bookmarks: {
          get: ReturnType<typeof vi.fn>;
          getChildren: ReturnType<typeof vi.fn>;
          update: ReturnType<typeof vi.fn>;
        };
      };
      // parentId 無し → siblings は [] になり getChildren は呼ばれない
      mockChrome.bookmarks.get.mockResolvedValue([
        { id: 'root', title: 'ルート直下' },
      ]);

      const renamer = new FolderRenamer();
      await renamer.openRenameDialog('root');

      expect(mockChrome.bookmarks.getChildren).not.toHaveBeenCalled();

      const input = document.getElementById(
        'folder-rename-name'
      ) as HTMLInputElement;
      input.value = '新ルート名';
      (
        document.querySelector('.folder-rename-confirm') as HTMLButtonElement
      ).click();
      await new Promise((r) => setTimeout(r, 10));

      expect(mockChrome.bookmarks.update).toHaveBeenCalledWith('root', {
        title: '新ルート名',
      });
    });

    it('chrome.bookmarks.update が失敗した場合エラー表示しダイアログは閉じない', async () => {
      const mockChrome = globalThis.chrome as unknown as {
        bookmarks: { update: ReturnType<typeof vi.fn> };
      };
      mockChrome.bookmarks.update.mockRejectedValue(new Error('update failed'));
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const renamer = new FolderRenamer();
      await renamer.openRenameDialog('f1');

      const input = document.getElementById(
        'folder-rename-name'
      ) as HTMLInputElement;
      input.value = '失敗する名前';
      (
        document.querySelector('.folder-rename-confirm') as HTMLButtonElement
      ).click();
      await new Promise((r) => setTimeout(r, 10));

      expect(document.getElementById('folder-rename-dialog')).not.toBeNull();
      const errorEl = document.querySelector(
        '.folder-rename-error'
      ) as HTMLElement;
      expect(errorEl?.style.display).toBe('block');
      expect(errorEl?.textContent).toContain('フォルダ名の変更に失敗しました');
      expect(errorSpy).toHaveBeenCalledWith(
        '❌ フォルダ名の変更に失敗しました:',
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });

    it('×（閉じる）ボタンでダイアログが閉じる', async () => {
      const renamer = new FolderRenamer();
      await renamer.openRenameDialog('f1');

      (
        document.querySelector('.edit-dialog-close') as HTMLButtonElement
      ).click();

      expect(document.getElementById('folder-rename-dialog')).toBeNull();
    });

    it('キャンセルボタンでダイアログが閉じる', async () => {
      const renamer = new FolderRenamer();
      await renamer.openRenameDialog('f1');

      (
        document.querySelector('.edit-dialog-cancel') as HTMLButtonElement
      ).click();

      expect(document.getElementById('folder-rename-dialog')).toBeNull();
    });

    it('Enter 以外のキーでは保存されずダイアログが開いたまま', async () => {
      const renamer = new FolderRenamer();
      await renamer.openRenameDialog('f1');

      const input = document.getElementById(
        'folder-rename-name'
      ) as HTMLInputElement;
      input.value = '別の名前';
      input.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'a', bubbles: true })
      );
      await new Promise((r) => setTimeout(r, 10));

      expect(chrome.bookmarks.update).not.toHaveBeenCalled();
      expect(document.getElementById('folder-rename-dialog')).not.toBeNull();
    });

    it('Escape 以外のキーではダイアログが閉じない', async () => {
      const renamer = new FolderRenamer();
      await renamer.openRenameDialog('f1');

      document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'Tab' })
      );

      expect(document.getElementById('folder-rename-dialog')).not.toBeNull();
    });
  });
});
