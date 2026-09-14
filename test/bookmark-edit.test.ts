import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { handleBookmarkEdit, renderFolder } from '../src/scripts/newtab-core';
import type { BookmarkFolder } from '../src/types/bookmark';

// ブックマーク編集機能のテスト
describe('ブックマーク編集機能のテスト', () => {
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

    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search = vi.fn();
    mockChrome.bookmarks.update = vi.fn();
    mockChrome.bookmarks.move = vi.fn();
    mockChrome.bookmarks.getTree = vi.fn();
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('編集ボタンがブックマークアイテムに正しくレンダリングされる', () => {
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

    // 編集ボタンが含まれていることを確認
    expect(html).toContain('bookmark-edit-btn');
    expect(html).toContain('✏️');
    expect(html).toContain('data-bookmark-url="https://example.com"');
    expect(html).toContain('data-bookmark-title="テストブックマーク"');
    expect(html).toContain('title="編集"');
  });

  it('編集ボタンと削除ボタンが両方表示される', () => {
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

    // 両方のボタンが含まれていることを確認
    expect(html).toContain('bookmark-edit-btn');
    expect(html).toContain('bookmark-delete-btn');
    expect(html).toContain('bookmark-actions');
    expect(html).toContain('✏️');
    expect(html).toContain('🗑️');
  });

  it('ブックマークが見つからない場合はエラーメッセージが表示される', async () => {
    // Chrome API のモック設定（ブックマークが見つからない）
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([]);

    // console.error のモック
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // テスト用の編集ボタン要素を作成
    const editBtn = document.createElement('button');
    editBtn.setAttribute('data-bookmark-url', 'https://example.com');
    editBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 編集処理を直接実行
    await handleBookmarkEdit(editBtn);

    // エラーメッセージが出力されることを確認
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ 編集対象のブックマークが見つかりませんでした'
    );
    expect(mockChrome.bookmarks.update).not.toHaveBeenCalled();
    expect(mockChrome.bookmarks.move).not.toHaveBeenCalled();
  });

  it('URLやタイトルが取得できない場合はエラーメッセージが表示される', async () => {
    // console.error のモック
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    // テスト用の編集ボタン要素を作成（URLまたはタイトルが欠けている）
    const editBtn = document.createElement('button');
    // data-bookmark-url と data-bookmark-title を設定しない

    // 編集処理を直接実行
    await handleBookmarkEdit(editBtn);

    // エラーメッセージが出力されることを確認
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ ブックマークのURLまたはタイトルが取得できませんでした'
    );
    expect(chrome.bookmarks.search).not.toHaveBeenCalled();
  });

  it('編集ダイアログが正しく表示される', async () => {
    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([
      {
        id: 'bookmark-1',
        title: 'テストブックマーク',
        url: 'https://example.com',
        parentId: 'folder-1',
      },
    ]);

    mockChrome.bookmarks.getTree.mockResolvedValue([
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'ブックマークバー',
            children: [
              {
                id: 'folder-1',
                title: 'フォルダ1',
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    // テスト用の編集ボタン要素を作成
    const editBtn = document.createElement('button');
    editBtn.setAttribute('data-bookmark-url', 'https://example.com');
    editBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 編集処理を実行
    await handleBookmarkEdit(editBtn);

    // ダイアログが表示されることを確認
    const dialog = document.getElementById('edit-dialog');
    expect(dialog).toBeTruthy();

    // ダイアログの内容を確認
    expect(dialog?.querySelector('#edit-title')).toBeTruthy();
    expect(dialog?.querySelector('#edit-url')).toBeTruthy();
    expect(dialog?.querySelector('#edit-folder')).toBeTruthy();
    expect(dialog?.querySelector('.edit-dialog-save')).toBeTruthy();
    expect(dialog?.querySelector('.edit-dialog-cancel')).toBeTruthy();
  });

  it('編集ダイアログの初期値が正しく設定される', async () => {
    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([
      {
        id: 'bookmark-1',
        title: 'テストブックマーク',
        url: 'https://example.com',
        parentId: 'folder-1',
      },
    ]);

    mockChrome.bookmarks.getTree.mockResolvedValue([
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'ブックマークバー',
            children: [
              {
                id: 'folder-1',
                title: 'フォルダ1',
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    // テスト用の編集ボタン要素を作成
    const editBtn = document.createElement('button');
    editBtn.setAttribute('data-bookmark-url', 'https://example.com');
    editBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 編集処理を実行
    await handleBookmarkEdit(editBtn);

    // 入力フィールドの初期値を確認
    const titleInput = document.getElementById(
      'edit-title'
    ) as HTMLInputElement;
    const urlInput = document.getElementById('edit-url') as HTMLInputElement;
    const folderSelect = document.getElementById(
      'edit-folder'
    ) as HTMLSelectElement;

    expect(titleInput?.value).toBe('テストブックマーク');
    expect(urlInput?.value).toBe('https://example.com');
    expect(folderSelect?.value).toBe('folder-1');
  });

  it('キャンセルボタンでダイアログが閉じる', async () => {
    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([
      {
        id: 'bookmark-1',
        title: 'テストブックマーク',
        url: 'https://example.com',
        parentId: 'folder-1',
      },
    ]);

    mockChrome.bookmarks.getTree.mockResolvedValue([
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'ブックマークバー',
            children: [
              {
                id: 'folder-1',
                title: 'フォルダ1',
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    // テスト用の編集ボタン要素を作成
    const editBtn = document.createElement('button');
    editBtn.setAttribute('data-bookmark-url', 'https://example.com');
    editBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 編集処理を実行
    await handleBookmarkEdit(editBtn);

    // ダイアログが表示されることを確認
    let dialog = document.getElementById('edit-dialog');
    expect(dialog).toBeTruthy();

    // キャンセルボタンをクリック
    const cancelBtn = dialog?.querySelector(
      '.edit-dialog-cancel'
    ) as HTMLElement;
    cancelBtn?.click();

    // ダイアログが閉じることを確認
    dialog = document.getElementById('edit-dialog');
    expect(dialog).toBeFalsy();
  });

  it('バリデーション: 空の名前でエラーが表示される', async () => {
    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([
      {
        id: 'bookmark-1',
        title: 'テストブックマーク',
        url: 'https://example.com',
        parentId: 'folder-1',
      },
    ]);

    mockChrome.bookmarks.getTree.mockResolvedValue([
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'ブックマークバー',
            children: [
              {
                id: 'folder-1',
                title: 'フォルダ1',
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    // alert のモック
    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});

    // テスト用の編集ボタン要素を作成
    const editBtn = document.createElement('button');
    editBtn.setAttribute('data-bookmark-url', 'https://example.com');
    editBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 編集処理を実行
    await handleBookmarkEdit(editBtn);

    // 名前を空にして保存ボタンをクリック
    const titleInput = document.getElementById(
      'edit-title'
    ) as HTMLInputElement;
    const saveBtn = document.querySelector('.edit-dialog-save') as HTMLElement;

    titleInput.value = '';
    saveBtn?.click();

    // バリデーションエラーが表示されることを確認
    expect(alertSpy).toHaveBeenCalledWith('名前とURLは必須です。');
    expect(mockChrome.bookmarks.update).not.toHaveBeenCalled();
  });

  it('編集処理でエラーが発生した場合はエラーメッセージが表示される', async () => {
    // Chrome API のモック設定
    const mockChrome = globalThis.chrome as any;
    mockChrome.bookmarks.search.mockResolvedValue([
      {
        id: 'bookmark-1',
        title: 'テストブックマーク',
        url: 'https://example.com',
        parentId: 'folder-1',
      },
    ]);

    mockChrome.bookmarks.getTree.mockResolvedValue([
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1',
            title: 'ブックマークバー',
            children: [
              {
                id: 'folder-1',
                title: 'フォルダ1',
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    // 更新でエラーを発生させる
    mockChrome.bookmarks.update.mockRejectedValue(
      new Error('更新に失敗しました')
    );

    // console.error と alert のモック
    const consoleErrorSpy = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const alertSpy = vi.spyOn(globalThis, 'alert').mockImplementation(() => {});

    // location.reload のモック
    const reloadSpy = vi.fn();
    globalThis.location = { reload: reloadSpy } as any;

    // テスト用の編集ボタン要素を作成
    const editBtn = document.createElement('button');
    editBtn.setAttribute('data-bookmark-url', 'https://example.com');
    editBtn.setAttribute('data-bookmark-title', 'テストブックマーク');

    // 編集処理を実行
    await handleBookmarkEdit(editBtn);

    // 保存ボタンをクリック
    const saveBtn = document.querySelector('.edit-dialog-save') as HTMLElement;
    saveBtn?.click();

    // 非同期処理の完了を待つ
    await new Promise((resolve) => setTimeout(resolve, 0));

    // エラーメッセージが出力されることを確認
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '❌ ブックマークの更新に失敗しました:',
      expect.any(Error)
    );
    expect(alertSpy).toHaveBeenCalledWith('ブックマークの更新に失敗しました。');
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});
