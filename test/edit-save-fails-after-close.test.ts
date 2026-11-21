import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * 編集ダイアログの「保存」を押したあと、Chrome への更新が終わる前にダイアログを閉じ、
 * その更新が失敗した場合の通知。
 *
 * 編集ダイアログはもう無いので、失敗は別のエラーダイアログで知らせる。
 * 対になる「開いたままの失敗」は、編集ダイアログの中にエラー文を出す。
 *
 * 操作は本物のレンダラが描いた編集ボタンのクリック、ダイアログの入力・ボタン、Escape キーで行う。
 */
describe('編集の保存が、ダイアログを閉じたあとで失敗した場合', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let listenerErrors: string[];
  let changedActions: string[];
  /** 保留中の chrome.bookmarks.update を失敗させる。 */
  let rejectUpdate: (error: Error) => void;

  const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

  const folders: BookmarkFolder[] = [
    {
      id: '10',
      title: '仕事',
      expanded: true,
      subfolders: [],
      bookmarks: [
        {
          id: '101',
          title: 'メモ',
          url: 'https://memo.example.com/',
          favicon: null,
        },
      ],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    // リスナー内の例外は dispatchEvent からは投げられず、window の error イベントになる
    listenerErrors = [];
    win.addEventListener('error', (e) => {
      listenerErrors.push((e as unknown as ErrorEvent).message);
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    mock(chrome.bookmarks.get).mockResolvedValue([
      {
        id: '101',
        title: 'メモ',
        url: 'https://memo.example.com/',
        parentId: '10',
        index: 0,
      },
    ]);
    mock(chrome.bookmarks.getTree).mockResolvedValue([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: 'ブックマークバー',
            children: [{ id: '10', title: '仕事', children: [] }],
          },
        ],
      },
    ]);
    // 更新は、テストが失敗させるまで終わらない
    mock(chrome.bookmarks.update).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectUpdate = reject;
        })
    );

    changedActions = [];
    document.addEventListener('bookmarks-changed', (e) => {
      changedActions.push((e as CustomEvent).detail.action);
    });
  });

  afterEach(() => {
    pressEscape();
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    vi.restoreAllMocks();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function pressEscape(): void {
    document.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
  }

  /** 開いているダイアログの見出し。 */
  function dialogTitles(): string[] {
    return Array.from(document.querySelectorAll('[role="dialog"] h3')).map(
      (heading) => heading.textContent ?? ''
    );
  }

  function fieldByLabel<T extends HTMLElement>(labelText: string): T {
    const label = Array.from(
      document.querySelectorAll('[role="dialog"] label')
    ).find((el) => el.textContent?.trim() === labelText);
    return document.getElementById(label?.getAttribute('for') ?? '') as T;
  }

  function dialogButton(name: string): HTMLButtonElement {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')
    ).find(
      (button) => button.textContent?.trim() === name
    ) as HTMLButtonElement;
  }

  /** 一覧を描画して「メモ」の編集ダイアログを開き、名前を変えて「保存」を押す。 */
  async function renameAndSave(): Promise<void> {
    const container = document.createElement('div');
    container.id = 'bookmarkContainer';
    document.body.appendChild(container);
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
    new BookmarkFolderEvents().setupFolderClickHandler(container, folders);

    const editButton = container.querySelector(
      'button[aria-label="「メモ」を編集"]'
    ) as HTMLButtonElement;
    editButton.dispatchEvent(
      new win.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }) as unknown as Event
    );
    await vi.waitFor(() => {
      expect(dialogTitles()).toEqual(['ブックマークを編集']);
    });

    fieldByLabel<HTMLInputElement>('名前:').value = '議事録';
    dialogButton('保存').click();
    await vi.waitFor(() => {
      expect(mock(chrome.bookmarks.update).mock.calls).toEqual([
        ['101', { title: '議事録', url: 'https://memo.example.com/' }],
      ]);
    });
  }

  it('保存中に Escape で閉じ、その更新が失敗すると、エラーダイアログで失敗を知らせる', async () => {
    await renameAndSave();

    pressEscape();
    expect(dialogTitles()).toEqual([]);
    rejectUpdate(new Error('Can not modify this bookmark.'));

    await vi.waitFor(() => {
      expect(dialogTitles()).toEqual(['エラー']);
    });
    expect(
      document.querySelector('[role="dialog"] .error-message')?.textContent
    ).toContain('ブックマークの更新に失敗しました。');
    // 保存は成立していないので、一覧の再読み込みも「元に戻す」も出さない
    expect(changedActions).toEqual([]);
    expect(document.querySelector('[role="status"]')).toBeNull();
    expect(listenerErrors).toEqual([]);

    dialogButton('OK').click();
    expect(dialogTitles()).toEqual([]);
  });

  it('保存中に「キャンセル」で閉じた場合も、失敗はエラーダイアログで知らせる', async () => {
    await renameAndSave();

    dialogButton('キャンセル').click();
    expect(dialogTitles()).toEqual([]);
    rejectUpdate(new Error('Can not modify this bookmark.'));

    await vi.waitFor(() => {
      expect(dialogTitles()).toEqual(['エラー']);
    });
    expect(
      document.querySelector('[role="dialog"] .error-message')?.textContent
    ).toContain('ブックマークの更新に失敗しました。');
  });

  it('ダイアログを開いたまま更新が失敗すると、編集ダイアログの中にエラー文を出し、別のダイアログは開かない', async () => {
    await renameAndSave();

    rejectUpdate(new Error('Can not modify this bookmark.'));

    await vi.waitFor(() => {
      expect(
        document.querySelector('[role="dialog"] .dialog-error')?.textContent
      ).toBe('ブックマークの更新に失敗しました。');
    });
    expect(dialogTitles()).toEqual(['ブックマークを編集']);
    // 入力した値は残り、やり直せる
    expect(fieldByLabel<HTMLInputElement>('名前:').value).toBe('議事録');
    expect(changedActions).toEqual([]);
    expect(listenerErrors).toEqual([]);
  });
});
