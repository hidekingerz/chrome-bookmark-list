import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkEditor } from '../src/components/BookmarkActions/BookmarkEditor';
import { FolderCreator } from '../src/components/BookmarkActions/FolderCreator';
import { FolderDeleter } from '../src/components/BookmarkActions/FolderDeleter';
import { FolderRenamer } from '../src/components/BookmarkActions/FolderRenamer';
import { TabGroupOpener } from '../src/components/BookmarkActions/TabGroupOpener';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { BookmarkSelection } from '../src/components/BookmarkSelection/index';
import { ContextMenu } from '../src/components/ContextMenu/index';
import { KeyboardShortcuts } from '../src/components/KeyboardShortcuts/index';
import { RecentlyClosedPanel } from '../src/components/RecentlyClosedPanel/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';
import type { BookmarkFolder } from '../src/types/bookmark';
import {
  type FakeBookmarks,
  installFakeBookmarks,
} from './helpers/fake-bookmarks';

/**
 * 外部仕様 §17「操作の失敗は『エラー』ダイアログで知らせる」。
 *
 * 操作を画面から行い、Chrome の API が失敗したときに「エラー」ダイアログが
 * その操作の文言で出ることを確かめる。失敗をトーストだけで知らせたり、
 * 画面に何も出さなかったりしないこと。
 */
describe('操作の失敗は「エラー」ダイアログで知らせる', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let selection: BookmarkSelection;
  let bookmarks: FakeBookmarks;

  const folders: BookmarkFolder[] = [
    {
      id: '10',
      title: '仕事',
      expanded: true,
      subfolders: [],
      bookmarks: [
        { id: '101', title: 'A', url: 'https://a.example.com/', favicon: null },
        { id: '102', title: 'B', url: 'https://b.example.com/', favicon: null },
      ],
    },
    { id: '11', title: '趣味', expanded: true, subfolders: [], bookmarks: [] },
  ];

  const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;
    // 失敗の原因はコンソールに残る。テストの出力には出さない
    vi.spyOn(console, 'error').mockImplementation(() => {});

    bookmarks = installFakeBookmarks([
      {
        id: '1',
        title: 'ブックマークバー',
        children: folders.map((folder) => ({
          id: folder.id,
          title: folder.title,
          children: folder.bookmarks.map((b) => ({
            id: b.id as string,
            title: b.title,
            url: b.url,
          })),
        })),
      },
    ]);

    container = document.createElement('div');
    container.id = 'bookmarkContainer';
    document.body.appendChild(container);
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
    selection = new BookmarkSelection();
    new BookmarkFolderEvents(selection).setupFolderClickHandler(
      container,
      folders
    );
  });

  afterEach(() => {
    document.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
    selection.clear();
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    vi.restoreAllMocks();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  /** 「エラー」ダイアログの見出しと本文。出ていなければ null。 */
  function errorDialog(): { title?: string; message?: string } | null {
    const dialog = document.getElementById('error-dialog');
    if (!dialog) return null;
    return {
      title: dialog.querySelector('h3')?.textContent?.trim(),
      message: dialog.querySelector('.error-message')?.textContent?.trim(),
    };
  }

  function toastText(): string | undefined {
    return document
      .querySelector('[role="status"] .app-toast-message')
      ?.textContent?.trim();
  }

  async function expectErrorDialog(message: string): Promise<void> {
    await vi.waitFor(() => {
      expect(errorDialog()).toEqual({ title: 'エラー', message });
    });
  }

  function click(selector: string): void {
    (document.querySelector(selector) as HTMLElement).click();
  }

  async function clickWhenShown(selector: string): Promise<void> {
    await vi.waitFor(() => {
      expect(document.querySelector(selector)).not.toBeNull();
    });
    click(selector);
  }

  function selectAandB(): void {
    const title = (id: string) =>
      container.querySelector(
        `.bookmark-item[data-bookmark-id="${id}"] .bookmark-title`
      ) as HTMLElement;
    title('101').dispatchEvent(
      new win.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }) as unknown as Event
    );
    title('102').dispatchEvent(
      new win.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        shiftKey: true,
      }) as unknown as Event
    );
  }

  it('フォルダの削除に失敗したとき', async () => {
    mocked(chrome.bookmarks.removeTree).mockRejectedValue(new Error('boom'));

    const deleting = new FolderDeleter().openDeleteDialog('10');
    await clickWhenShown('.delete-dialog-confirm');
    await deleting;

    await expectErrorDialog('❌ フォルダの削除に失敗しました。');
    expect(toastText()).toBeUndefined();
    expect(bookmarks.has('10')).toBe(true);
  });

  it('選択したブックマークの一括削除が、すべて失敗したとき', async () => {
    mocked(chrome.bookmarks.remove).mockRejectedValue(new Error('boom'));
    selectAandB();

    click('[role="toolbar"] .selection-toolbar-delete');
    await clickWhenShown('.delete-dialog-confirm');

    await expectErrorDialog('❌ 2 件のブックマークを削除できませんでした。');
    expect(toastText()).toBeUndefined();
    expect(bookmarks.titles('10')).toEqual(['A', 'B']);
  });

  it('選択したブックマークの一括移動が、すべて失敗したとき', async () => {
    mocked(chrome.bookmarks.move).mockRejectedValue(new Error('boom'));
    selectAandB();

    click('[role="toolbar"] .selection-toolbar-move');
    await vi.waitFor(() => {
      expect(document.getElementById('bulk-move-parent')).not.toBeNull();
    });
    (document.getElementById('bulk-move-parent') as HTMLSelectElement).value =
      '11';
    click('.bulk-move-confirm');

    await expectErrorDialog('❌ 2 件のブックマークを移動できませんでした。');
    expect(toastText()).toBeUndefined();
    expect(bookmarks.titles('10')).toEqual(['A', 'B']);
  });

  it('「元に戻す」が失敗したとき', async () => {
    UndoManager.getInstance().register({
      message: 'ブックマークを削除しました',
      undo: async () => {
        throw new Error('undo boom');
      },
    });

    click('[role="status"] button');

    await expectErrorDialog('❌ 操作の取り消しに失敗しました。');
    expect(toastText()).toBeUndefined();
  });

  it('最近閉じたタブの復元に失敗したとき', async () => {
    mocked(chrome.sessions.getRecentlyClosed).mockResolvedValue([
      { tab: { sessionId: 's1', title: 'T', url: 'https://r.example.com/' } },
    ]);
    mocked(chrome.sessions.restore).mockRejectedValue(new Error('boom'));
    const panelRoot = document.createElement('div');
    document.body.appendChild(panelRoot);
    await new RecentlyClosedPanel(panelRoot).activate();

    (
      panelRoot.querySelector(
        '.history-item[data-session-id="s1"]'
      ) as HTMLElement
    ).click();

    await expectErrorDialog('❌ タブの復元に失敗しました。');
  });

  it('編集しようとしたブックマークが、別の場所で削除されていたとき', async () => {
    bookmarks.removeBehindTheScenes('101');
    const editButton = container.querySelector(
      '.bookmark-item[data-bookmark-id="101"] .bookmark-edit-btn'
    ) as HTMLElement;

    await new BookmarkEditor().handleBookmarkEdit(editButton);

    await expectErrorDialog('❌ 編集するブックマークが見つかりませんでした。');
    expect(document.getElementById('edit-dialog')).toBeNull();
  });

  it('名前を変えようとしたフォルダが、別の場所で削除されていたとき', async () => {
    bookmarks.removeBehindTheScenes('11');

    await new FolderRenamer().openRenameDialog('11');

    await expectErrorDialog(
      '❌ 名前を変更するフォルダが見つかりませんでした。'
    );
    expect(document.getElementById('folder-rename-dialog')).toBeNull();
  });

  it('新しいフォルダの作成ダイアログを開く準備に失敗したとき', async () => {
    mocked(chrome.bookmarks.getTree).mockRejectedValue(new Error('boom'));

    await new FolderCreator().openCreateDialog('10');

    await expectErrorDialog('❌ フォルダの作成を開始できませんでした。');
    expect(document.getElementById('folder-create-dialog')).toBeNull();
  });

  it('削除しようとしたフォルダが見つからないとき', async () => {
    mocked(chrome.bookmarks.getSubTree).mockResolvedValue([]);

    await new FolderDeleter().openDeleteDialog('10');

    await expectErrorDialog('❌ 削除するフォルダが見つかりませんでした。');
  });

  describe('一括操作で、選んだブックマークが別の場所で削除されていたとき', () => {
    it('一括削除で全件が既に無ければ、「エラー」ダイアログで知らせる', async () => {
      selectAandB();
      bookmarks.removeBehindTheScenes('101');
      bookmarks.removeBehindTheScenes('102');

      click('[role="toolbar"] .selection-toolbar-delete');
      await clickWhenShown('.delete-dialog-confirm');

      await expectErrorDialog('❌ 2 件のブックマークを削除できませんでした。');
      expect(toastText()).toBeUndefined();
    });

    it('一括削除で一部が既に無ければ、残りを削除し、無かった分を失敗として知らせる', async () => {
      selectAandB();
      bookmarks.removeBehindTheScenes('102');

      click('[role="toolbar"] .selection-toolbar-delete');
      await clickWhenShown('.delete-dialog-confirm');

      await vi.waitFor(() => {
        expect(toastText()).toBe('1 件を削除しました（1 件は失敗）');
      });
      expect(bookmarks.titles('10')).toEqual([]);
      expect(errorDialog()).toBeNull();
    });

    it('一括移動で全件が既に無ければ、「エラー」ダイアログで知らせる', async () => {
      selectAandB();
      bookmarks.removeBehindTheScenes('101');
      bookmarks.removeBehindTheScenes('102');

      click('[role="toolbar"] .selection-toolbar-move');
      await vi.waitFor(() => {
        expect(document.getElementById('bulk-move-parent')).not.toBeNull();
      });
      (document.getElementById('bulk-move-parent') as HTMLSelectElement).value =
        '11';
      click('.bulk-move-confirm');

      await expectErrorDialog('❌ 2 件のブックマークを移動できませんでした。');
      expect(toastText()).toBeUndefined();
    });
  });

  describe('タブを開く・コピーする・メニューの項目を実行する操作の失敗', () => {
    function bookmarkItem(id: string): HTMLElement {
      return container.querySelector(
        `.bookmark-item[data-bookmark-id="${id}"]`
      ) as HTMLElement;
    }

    function openMenuOn(target: HTMLElement): void {
      target.dispatchEvent(
        new win.MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 10,
          clientY: 10,
        }) as unknown as Event
      );
    }

    function chooseMenuItem(label: string): void {
      const item = Array.from(
        document.querySelectorAll<HTMLElement>('.context-menu-item')
      ).find((el) => el.textContent?.includes(label));
      expect(item).toBeDefined();
      item?.click();
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('ブックマークをクリックして、タブを開くのに失敗したとき', async () => {
      mocked(chrome.tabs.create).mockRejectedValue(new Error('boom'));

      (
        bookmarkItem('101').querySelector('.bookmark-title') as HTMLElement
      ).dispatchEvent(
        new win.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        }) as unknown as Event
      );

      await expectErrorDialog('❌ タブを開けませんでした。');
    });

    it('メニューの「新しいタブで開く」で、タブを開くのに失敗したとき', async () => {
      mocked(chrome.tabs.create).mockRejectedValue(new Error('boom'));

      openMenuOn(bookmarkItem('101'));
      chooseMenuItem('新しいタブで開く');

      await expectErrorDialog('❌ タブを開けませんでした。');
    });

    it('フォルダのメニューの「全て新しいタブで開く」で、タブを開くのに失敗したとき', async () => {
      mocked(chrome.tabs.create).mockRejectedValue(new Error('boom'));

      openMenuOn(
        container.querySelector(
          '[data-folder-id="10"] > .folder-header'
        ) as HTMLElement
      );
      chooseMenuItem('全て新しいタブで開く');

      await expectErrorDialog('❌ タブを開けませんでした。');
    });

    it('メニューの「URLをコピー」に失敗したとき', async () => {
      vi.stubGlobal('navigator', {
        clipboard: { writeText: vi.fn().mockRejectedValue(new Error('boom')) },
      });

      openMenuOn(bookmarkItem('101'));
      chooseMenuItem('URLをコピー');

      await expectErrorDialog('❌ URLのコピーに失敗しました。');
    });

    it('メニューの項目の処理が失敗したとき（個別の通知を持たない項目）', async () => {
      new ContextMenu().open(10, 10, [
        {
          label: '失敗する項目',
          onSelect: async () => {
            throw new Error('boom');
          },
        },
      ]);

      chooseMenuItem('失敗する項目');

      await expectErrorDialog('❌ 操作に失敗しました。');
    });

    it('メニューの項目の処理が、その場で例外を投げたとき', async () => {
      new ContextMenu().open(10, 10, [
        {
          label: '例外を投げる項目',
          onSelect: () => {
            throw new Error('boom');
          },
        },
      ]);

      chooseMenuItem('例外を投げる項目');

      await expectErrorDialog('❌ 操作に失敗しました。');
    });

    it('タブグループの API が使えない環境で、個別のタブを開くのに失敗したとき', async () => {
      const group = chrome.tabs.group;
      (chrome.tabs as unknown as Record<string, unknown>).group = undefined;
      mocked(chrome.tabs.create).mockRejectedValue(new Error('boom'));
      vi.spyOn(console, 'warn').mockImplementation(() => {});

      try {
        await new TabGroupOpener().openAsGroup(
          ['https://a.example.com/'],
          '仕事'
        );
      } finally {
        (chrome.tabs as unknown as Record<string, unknown>).group = group;
      }

      await expectErrorDialog('❌ タブを開けませんでした。');
    });

    it('一括移動の移動先フォルダの一覧を取得できなかったとき', async () => {
      selectAandB();
      mocked(chrome.bookmarks.getTree).mockRejectedValue(new Error('boom'));

      click('[role="toolbar"] .selection-toolbar-move');

      await expectErrorDialog('❌ ブックマークの移動を開始できませんでした。');
      expect(document.getElementById('bulk-move-dialog')).toBeNull();
    });
  });

  describe('「エラー」ダイアログを開いている間のキー操作', () => {
    function press(key: string): void {
      (document.activeElement ?? document.body).dispatchEvent(
        new win.KeyboardEvent('keydown', {
          key,
          bubbles: true,
          cancelable: true,
        }) as unknown as Event
      );
    }

    beforeEach(() => {
      KeyboardShortcuts.resetInstance();
      KeyboardShortcuts.getInstance().initialize();
    });

    afterEach(() => {
      KeyboardShortcuts.resetInstance();
    });

    it('↓ を押しても背後の一覧へフォーカスが移らず、Enter や Delete も背後のブックマークに届かない', async () => {
      (
        container.querySelector(
          '.bookmark-item[data-bookmark-id="101"]'
        ) as HTMLElement
      ).focus();
      UndoManager.getInstance().register({
        message: 'ブックマークを削除しました',
        undo: async () => {
          throw new Error('undo boom');
        },
      });
      click('[role="status"] button');
      await expectErrorDialog('❌ 操作の取り消しに失敗しました。');

      press('ArrowDown');
      press('ArrowDown');
      const focused = document.activeElement as HTMLElement;
      press('Enter');
      press('Delete');
      press('F2');

      expect(focused.closest('#error-dialog')).not.toBeNull();
      expect(mocked(chrome.tabs.create)).not.toHaveBeenCalled();
      // 「エラー」ダイアログは開いたまま。削除の確認や編集のダイアログに差し替わらない
      expect(errorDialog()?.message).toBe('❌ 操作の取り消しに失敗しました。');
      expect(document.querySelectorAll('.edit-dialog-overlay')).toHaveLength(1);
    });
  });
});
