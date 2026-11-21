import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderCreator } from '../src/components/BookmarkActions/FolderCreator';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * 編集ダイアログとフォルダ作成ダイアログで、Chrome が返すノードに値が欠けている場合の表示。
 *
 * - 編集対象のノードに URL が無い場合の URL 欄と、保存後の「元に戻す」
 * - 名前が空のフォルダを親フォルダの候補に出すときのラベル
 *
 * 操作は本物のレンダラが描いた編集ボタンのクリックと、ダイアログの入力・ボタンで行う。
 * 入力欄はラベルの文言で、ボタンは表示名で選ぶ。
 */
describe('値の欠けたノードを扱うダイアログ', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let listenerErrors: string[];

  const mock = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

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

    mock(chrome.bookmarks.getTree).mockResolvedValue([
      {
        id: '0',
        title: '',
        children: [
          {
            id: '1',
            title: 'ブックマークバー',
            children: [
              { id: '10', title: '仕事', children: [] },
              // 名前を付けていないフォルダ
              { id: '12', title: '', children: [] },
            ],
          },
        ],
      },
    ]);
    mock(chrome.bookmarks.update).mockResolvedValue({});
    mock(chrome.bookmarks.move).mockResolvedValue({});
  });

  afterEach(() => {
    // 開いたままのダイアログを閉じ、document に付いたリスナーを外す
    document.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function dialog(): HTMLElement | null {
    return document.querySelector('[role="dialog"]');
  }

  /** ダイアログの中から、ラベルの文言に対応する入力欄を返す。 */
  function fieldByLabel<T extends HTMLElement>(labelText: string): T {
    const label = Array.from(dialog()?.querySelectorAll('label') ?? []).find(
      (el) => el.textContent?.trim() === labelText
    );
    return document.getElementById(label?.getAttribute('for') ?? '') as T;
  }

  function dialogButton(name: string): HTMLButtonElement {
    return Array.from(
      dialog()?.querySelectorAll<HTMLButtonElement>('button') ?? []
    ).find(
      (button) => button.textContent?.trim() === name
    ) as HTMLButtonElement;
  }

  /**
   * selected 属性の付いた選択肢の value。
   * happy-dom 21 は、3 件以上ある選択肢の 3 件目以降に selected を付けても
   * select.value に反映しないので、描画された属性そのものを見る。
   */
  function preselectedValues(select: HTMLSelectElement): string[] {
    return Array.from(select.querySelectorAll('option'))
      .filter((option) => option.hasAttribute('selected'))
      .map((option) => option.getAttribute('value') ?? '');
  }

  function toastButton(label: string): HTMLButtonElement | undefined {
    return Array.from(
      document.querySelectorAll<HTMLButtonElement>('[role="status"] button')
    ).find((button) => button.textContent?.trim() === label);
  }

  describe('URL の無いノードの編集', () => {
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

    /** 一覧を描画し、「メモ」の編集ボタンを押してダイアログが開くのを待つ。 */
    async function openEditDialog(): Promise<void> {
      const container = document.createElement('div');
      container.id = 'bookmarkContainer';
      document.body.appendChild(container);
      container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
      new BookmarkFolderEvents().setupFolderClickHandler(container, folders);

      // 一覧を描いたあとで、Chrome 側のノードから URL が失われていた
      mock(chrome.bookmarks.get).mockResolvedValue([
        { id: '101', title: 'メモ', parentId: '10', index: 0 },
      ]);

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
        expect(dialog()).not.toBeNull();
      });
    }

    it('URL 欄は空で開き、名前とフォルダは Chrome のノードの値で埋まる', async () => {
      await openEditDialog();

      expect(mock(chrome.bookmarks.get)).toHaveBeenCalledWith('101');
      expect(fieldByLabel<HTMLInputElement>('URL:').value).toBe('');
      expect(fieldByLabel<HTMLInputElement>('名前:').value).toBe('メモ');
      expect(
        preselectedValues(fieldByLabel<HTMLSelectElement>('フォルダー:'))
      ).toEqual(['10']);
      expect(listenerErrors).toEqual([]);
    });

    it('URL を入力して保存し「元に戻す」を押すと、URL を空に戻す更新を Chrome に送る', async () => {
      await openEditDialog();
      fieldByLabel<HTMLInputElement>('URL:').value = 'https://new.example.com/';

      dialogButton('保存').click();

      await vi.waitFor(() => {
        expect(
          document.querySelector('[role="status"] .app-toast-message')
            ?.textContent
        ).toBe('「メモ」を編集しました');
      });
      expect(dialog()).toBeNull();
      expect(mock(chrome.bookmarks.update).mock.calls).toEqual([
        ['101', { title: 'メモ', url: 'https://new.example.com/' }],
      ]);

      toastButton('元に戻す')?.click();

      await vi.waitFor(() => {
        expect(mock(chrome.bookmarks.update)).toHaveBeenCalledTimes(2);
      });
      expect(mock(chrome.bookmarks.update).mock.calls[1]).toEqual([
        '101',
        { title: 'メモ', url: '' },
      ]);
      // フォルダは変えていないので、移動は起きない
      expect(mock(chrome.bookmarks.move)).not.toHaveBeenCalled();
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('フォルダ作成ダイアログの親フォルダ候補', () => {
    it('名前が空のフォルダは「(ルート: <ID>)」と表示し、ルート (id=0) は候補に出さない', async () => {
      await new FolderCreator().openCreateDialog('12');

      const parentSelect = fieldByLabel<HTMLSelectElement>('親フォルダ:');
      const options = Array.from(parentSelect.querySelectorAll('option')).map(
        (option) => [option.getAttribute('value'), option.textContent]
      );
      expect(options).toEqual([
        ['1', 'ブックマークバー'],
        ['10', '仕事'],
        ['12', '(ルート: 12)'],
      ]);
      expect(preselectedValues(parentSelect)).toEqual(['12']);
    });

    it('名前が空のフォルダを親に選んで作成すると、そのフォルダの ID を親として Chrome に送る', async () => {
      mock(chrome.bookmarks.create).mockResolvedValue({ id: '99' });
      await new FolderCreator().openCreateDialog('10');
      fieldByLabel<HTMLInputElement>('フォルダ名:').value = '資料';
      // 候補から、名前が空のフォルダを選び直す
      fieldByLabel<HTMLSelectElement>('親フォルダ:').value = '12';

      dialogButton('作成').click();

      await vi.waitFor(() => {
        expect(dialog()).toBeNull();
      });
      expect(mock(chrome.bookmarks.create).mock.calls).toEqual([
        [{ parentId: '12', title: '資料' }],
      ]);
      expect(
        document.querySelector('[role="status"] .app-toast-message')
          ?.textContent
      ).toBe('フォルダ「資料」を作成しました');
    });
  });
});
