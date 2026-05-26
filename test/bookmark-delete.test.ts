import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBookmarkDelete, renderFolder } from '../src/scripts/newtab-core';
import type { BookmarkFolder } from '../src/scripts/types';

// ブックマーク削除機能のテスト
describe('ブックマーク削除機能のテスト', () => {
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><body><div id="test"></div></body></html>`,
      { url: 'chrome-extension://test/newtab.html' }
    );

    document = dom.window.document;

    // グローバルオブジェクトを設定
    Object.defineProperty(globalThis, 'document', {
      value: document,
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

    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search = vi.fn();
    mockChrome.bookmarks.remove = vi.fn();
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('削除ボタンがブックマークアイテムに正しくレンダリングされる', () => {
    const testBookmark: BookmarkFolder = {
      id: 'folder-1',
      title: 'テストフォルダ',
      bookmarks: [
        {
          title: 'テストブックマーク',
          url: 'https://example.com',
          favicon: null,
        },
      ],
      subfolders: [],
      expanded: true,
    };

    const html = renderFolder(testBookmark);

    // 削除ボタンが含まれていることを確認
    expect(html).toContain('bookmark-delete-btn');
    expect(html).toContain('🗑️');
    expect(html).toContain('data-bookmark-url="https://example.com"');
    expect(html).toContain('data-bookmark-title="テストブックマーク"');
    expect(html).toContain('title="削除"');
  });

  it('削除確認でキャンセルを選択した場合は削除処理が実行されない', async () => {
    // テスト用の削除ボタン要素を作成
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-bookmark-url', 'https://example.com');
    deleteBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 削除処理を非同期で実行（ダイアログが表示されるまで待機）
    const deletePromise = handleBookmarkDelete(deleteBtn);

    // 少し待ってダイアログが表示されることを確認
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 削除ダイアログが表示されていることを確認
    const dialog = document.getElementById('delete-dialog');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain('テストブックマーク');
    expect(dialog?.textContent).toContain('以下のブックマークを削除しますか？');

    // キャンセルボタンをクリック
    const cancelBtn = dialog?.querySelector(
      '.edit-dialog-cancel'
    ) as HTMLElement;
    expect(cancelBtn).toBeTruthy();
    cancelBtn.click();

    // 削除処理の完了を待機
    await deletePromise;

    // Chrome API の削除メソッドが呼ばれないことを確認
    expect(chrome.bookmarks.search).not.toHaveBeenCalled();
    expect(chrome.bookmarks.remove).not.toHaveBeenCalled();

    // ダイアログが削除されていることを確認
    expect(document.getElementById('delete-dialog')).toBeNull();
  });

  it('削除確認でOKを選択した場合はChrome APIで削除し bookmarks-changed イベントを発火する', async () => {
    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([
      {
        id: 'bookmark-1',
        parentId: 'folder-1',
        index: 2,
        title: 'テストブックマーク',
        url: 'https://example.com',
      },
    ]);
    mockChrome.bookmarks.remove.mockResolvedValue(undefined);
    mockChrome.bookmarks.create = vi.fn().mockResolvedValue({});

    // bookmarks-changed イベントを監視
    const changedSpy = vi.fn();
    document.addEventListener('bookmarks-changed', changedSpy);

    // テスト用の削除ボタン要素を作成
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-bookmark-url', 'https://example.com');
    deleteBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 削除処理を非同期で実行
    const deletePromise = handleBookmarkDelete(deleteBtn);

    // 少し待ってダイアログが表示されることを確認
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 確認ボタンをクリック
    const dialog = document.getElementById('delete-dialog');
    const confirmBtn = dialog?.querySelector(
      '.delete-dialog-confirm'
    ) as HTMLElement;
    confirmBtn.click();

    // 削除処理の完了を待機
    await deletePromise;

    // Chrome API が正しく呼ばれることを確認
    expect(chrome.bookmarks.search).toHaveBeenCalledWith({
      url: 'https://example.com',
    });
    expect(chrome.bookmarks.remove).toHaveBeenCalledWith('bookmark-1');

    // bookmarks-changed イベントが発火されている
    expect(changedSpy).toHaveBeenCalled();

    // Undo Toast が表示されている
    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('テストブックマーク');
    expect(toast?.querySelector('.app-toast-action')?.textContent).toContain(
      '元に戻す'
    );

    // 「元に戻す」を押すと chrome.bookmarks.create が呼ばれる
    (toast?.querySelector('.app-toast-action') as HTMLButtonElement).click();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(chrome.bookmarks.create).toHaveBeenCalledWith({
      parentId: 'folder-1',
      index: 2,
      title: 'テストブックマーク',
      url: 'https://example.com',
    });

    document.removeEventListener('bookmarks-changed', changedSpy);
  });

  it('削除対象のブックマークが見つからない場合はエラーメッセージが表示される', async () => {
    // Chrome API のモック設定（ブックマークが見つからない）
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([]);

    // console.error のモック
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // テスト用の削除ボタン要素を作成
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-bookmark-url', 'https://example.com');
    deleteBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 削除処理を非同期で実行
    const deletePromise = handleBookmarkDelete(deleteBtn);

    // 削除確認ダイアログが表示されるまで待機
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 削除確認ダイアログで確認ボタンをクリック
    const dialog = document.getElementById('delete-dialog');
    const confirmBtn = dialog?.querySelector(
      '.delete-dialog-confirm'
    ) as HTMLElement;
    confirmBtn.click();

    // 削除処理の完了を待機
    await deletePromise;

    // エラーダイアログが表示されることを確認
    const errorDialog = document.getElementById('error-dialog');
    expect(errorDialog).toBeTruthy();
    expect(errorDialog?.textContent).toContain(
      'ブックマークの削除に失敗しました。'
    );

    // エラーメッセージが出力されることを確認
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ ブックマークの削除に失敗しました:',
      expect.any(Error)
    );
    expect(chrome.bookmarks.remove).not.toHaveBeenCalled();
  });

  it('削除処理でエラーが発生した場合はエラーメッセージが表示される', async () => {
    // Chrome API のモック設定（エラーを発生させる）
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([
      {
        id: 'bookmark-1',
        title: 'テストブックマーク',
        url: 'https://example.com',
      },
    ]);
    mockChrome.bookmarks.remove.mockRejectedValue(
      new Error('削除に失敗しました')
    );

    // console.error のモック
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // テスト用の削除ボタン要素を作成
    const deleteBtn = document.createElement('button');
    deleteBtn.setAttribute('data-bookmark-url', 'https://example.com');
    deleteBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 削除処理を非同期で実行
    const deletePromise = handleBookmarkDelete(deleteBtn);

    // 削除確認ダイアログが表示されるまで待機
    await new Promise((resolve) => setTimeout(resolve, 10));

    // 削除確認ダイアログで確認ボタンをクリック
    const dialog = document.getElementById('delete-dialog');
    const confirmBtn = dialog?.querySelector(
      '.delete-dialog-confirm'
    ) as HTMLElement;
    confirmBtn.click();

    // 削除処理の完了を待機
    await deletePromise;

    // エラーダイアログが表示されることを確認
    const errorDialog = document.getElementById('error-dialog');
    expect(errorDialog).toBeTruthy();
    expect(errorDialog?.textContent).toContain(
      'ブックマークの削除に失敗しました。'
    );

    // エラーメッセージが出力されることを確認
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ ブックマークの削除に失敗しました:',
      expect.any(Error)
    );
  });

  it('URLやタイトルが取得できない場合はエラーメッセージが表示される', async () => {
    // console.error のモック
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // テスト用の削除ボタン要素を作成（URLまたはタイトルが欠けている）
    const deleteBtn = document.createElement('button');
    // data-bookmark-url と data-bookmark-title を設定しない

    // 削除処理を直接実行
    await handleBookmarkDelete(deleteBtn);

    // エラーメッセージが出力されることを確認
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ ブックマークのURLまたはタイトルが取得できませんでした'
    );
    expect(chrome.bookmarks.search).not.toHaveBeenCalled();
    expect(chrome.bookmarks.remove).not.toHaveBeenCalled();
  });
});
