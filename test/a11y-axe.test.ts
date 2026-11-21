// axe-core による自動のアクセシビリティ検査。
// 実際の src/newtab.html に本物のレンダラが描いた一覧を載せ、ダイアログなどを
// 本物のコードで開いた状態を axe にかける。違反は 0 件であること。
//
// ここで守れるのは、名前・role・aria 属性・ランドマークの違反。文字のコントラストは
// テスト用の DOM では計算できないので、実ブラウザで確かめる（docs/TESTING_GUIDE.md）。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkDeleter } from '../src/components/BookmarkActions/BookmarkDeleter';
import { BookmarkEditor } from '../src/components/BookmarkActions/BookmarkEditor';
import { FolderCreator } from '../src/components/BookmarkActions/FolderCreator';
import { FolderDeleter } from '../src/components/BookmarkActions/FolderDeleter';
import { FolderRenamer } from '../src/components/BookmarkActions/FolderRenamer';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { BookmarkSelection } from '../src/components/BookmarkSelection/index';
import { CalendarHistoryPanel } from '../src/components/CalendarHistoryPanel/index';
import { ContextMenu } from '../src/components/ContextMenu/index';
import { errorDialog } from '../src/components/Dialog/index';
import { HistoryPanel } from '../src/components/HistoryPanel/index';
import { RecentlyClosedPanel } from '../src/components/RecentlyClosedPanel/index';
import { ShortcutHelp } from '../src/components/ShortcutHelp/index';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';
import type { BookmarkFolder } from '../src/types/bookmark';
import { axeViolations } from './helpers/axe';
import { installFakeBookmarks } from './helpers/fake-bookmarks';

const html = readFileSync(resolve(process.cwd(), 'src/newtab.html'), 'utf8');

const GLOBAL_KEYS = [
  'document',
  'window',
  'HTMLElement',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'CustomEvent',
  'Node',
  'CSS',
] as const;

describe('アクセシビリティの自動検査（axe-core）', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let selection: BookmarkSelection;
  const saved = new Map<string, PropertyDescriptor | undefined>();

  // サブフォルダを持つフォルダ・持たないフォルダ・空のフォルダを含む一覧
  const folders: BookmarkFolder[] = [
    {
      id: '10',
      title: '仕事',
      expanded: true,
      bookmarks: [
        { id: '101', title: 'A', url: 'https://a.example.com/', favicon: null },
        { id: '102', title: 'B', url: 'https://b.example.com/', favicon: null },
      ],
      subfolders: [
        {
          id: '12',
          title: '資料',
          expanded: true,
          subfolders: [],
          bookmarks: [
            {
              id: '121',
              title: 'C',
              url: 'https://c.example.com/',
              favicon: null,
            },
          ],
        },
      ],
    },
    { id: '11', title: '趣味', expanded: true, subfolders: [], bookmarks: [] },
  ];

  const toSeed = (
    folder: BookmarkFolder
  ): {
    id: string;
    title: string;
    children: { id: string; title: string; url?: string }[];
  } => ({
    id: folder.id,
    title: folder.title,
    children: [
      ...folder.bookmarks.map((b) => ({
        id: b.id as string,
        title: b.title,
        url: b.url,
      })),
      ...folder.subfolders.map(toSeed),
    ],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    dom = new JSDOM(html, {
      url: 'chrome-extension://test-id/newtab.html',
      runScripts: 'outside-only',
    });
    for (const key of GLOBAL_KEYS) {
      saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, {
        value: key === 'window' ? dom.window : dom.window[key],
        writable: true,
        configurable: true,
      });
    }

    installFakeBookmarks([
      { id: '1', title: 'ブックマークバー', children: folders.map(toSeed) },
    ]);

    container = document.getElementById('bookmarkContainer') as HTMLElement;
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
    selection = new BookmarkSelection();
    new BookmarkFolderEvents(selection).setupFolderClickHandler(
      container,
      folders
    );
  });

  afterEach(() => {
    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    selection.clear();
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    vi.restoreAllMocks();
    for (const key of GLOBAL_KEYS) {
      const descriptor = saved.get(key);
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    dom.window.close();
  });

  const violations = () => axeViolations(dom.window);

  function button(bookmarkId: string, className: string): HTMLElement {
    return container.querySelector(
      `.bookmark-item[data-bookmark-id="${bookmarkId}"] .${className}`
    ) as HTMLElement;
  }

  async function shown(selector: string): Promise<void> {
    await vi.waitFor(() => {
      expect(document.querySelector(selector)).not.toBeNull();
    });
  }

  it('ブックマークの一覧（サブフォルダを持つフォルダを含む）', async () => {
    expect(await violations()).toEqual([]);
  });

  it('複数選択のツールバーを表示した状態', async () => {
    const click = (id: string, shiftKey: boolean) =>
      (
        container.querySelector(
          `.bookmark-item[data-bookmark-id="${id}"] .bookmark-title`
        ) as HTMLElement
      ).dispatchEvent(
        new dom.window.MouseEvent('click', {
          bubbles: true,
          cancelable: true,
          shiftKey,
        })
      );
    click('101', false);
    click('102', true);
    await shown('[role="toolbar"]');

    expect(await violations()).toEqual([]);
  });

  it('ブックマークの編集ダイアログ', async () => {
    await new BookmarkEditor().handleBookmarkEdit(
      button('101', 'bookmark-edit-btn')
    );
    await shown('#edit-dialog');

    expect(await violations()).toEqual([]);
  });

  it('ブックマークの削除の確認ダイアログ', async () => {
    void new BookmarkDeleter().handleBookmarkDelete(
      button('101', 'bookmark-delete-btn')
    );
    await shown('.edit-dialog-overlay');

    expect(await violations()).toEqual([]);
  });

  it('新しいフォルダの作成ダイアログ', async () => {
    await new FolderCreator().openCreateDialog('10');
    await shown('#folder-create-dialog');

    expect(await violations()).toEqual([]);
  });

  it('フォルダ名の変更ダイアログ（エラー文を表示した状態）', async () => {
    await new FolderRenamer().openRenameDialog('11');
    await shown('#folder-rename-dialog');
    // 同じ階層にある「仕事」と同じ名前にして、ダイアログの中にエラー文を出す
    (document.getElementById('folder-rename-name') as HTMLInputElement).value =
      '仕事';
    (
      document.querySelector(
        '#folder-rename-dialog .edit-dialog-save'
      ) as HTMLElement
    ).click();
    await vi.waitFor(() => {
      expect(
        document.querySelector('#folder-rename-dialog .dialog-error')
          ?.textContent
      ).toBe('同じ名前のフォルダが既に存在します。');
    });

    expect(await violations()).toEqual([]);
  });

  it('フォルダの削除の確認ダイアログ', async () => {
    void new FolderDeleter().openDeleteDialog('10');
    await shown('.edit-dialog-overlay');

    expect(await violations()).toEqual([]);
  });

  it('一括移動のダイアログ', async () => {
    selection.toggle(
      'https://a.example.com/',
      'A',
      container.querySelector(
        '.bookmark-item[data-bookmark-id="101"]'
      ) as HTMLElement
    );
    void selection.bulkMove();
    await shown('#bulk-move-dialog');

    expect(await violations()).toEqual([]);
  });

  it('「エラー」ダイアログ', async () => {
    void errorDialog('ブックマークの移動に失敗しました。');
    await shown('#error-dialog');

    expect(await violations()).toEqual([]);
  });

  it('ショートカット一覧', async () => {
    new ShortcutHelp().open();
    await shown('[aria-labelledby="shortcut-help-title"]');

    expect(await violations()).toEqual([]);
  });

  it('「元に戻す」つきのトースト', async () => {
    UndoManager.getInstance().register({
      message: 'ブックマークを削除しました',
      undo: async () => {},
    });
    await shown('[role="status"]');

    expect(await violations()).toEqual([]);
  });

  it('最近の履歴のパネル', async () => {
    (chrome as unknown as Record<string, unknown>).history = {
      search: vi.fn().mockResolvedValue([
        {
          id: 'h1',
          title: 'Alpha',
          url: 'https://alpha.example.com/',
          lastVisitTime: Date.UTC(2026, 10, 20, 3, 0),
          visitCount: 3,
        },
      ]),
    };
    const panel = document.getElementById('tab-panel-history') as HTMLElement;
    panel.removeAttribute('hidden');
    await new HistoryPanel(panel).activate();
    await shown('#tab-panel-history .history-item');

    expect(await violations()).toEqual([]);
  });

  it('最近閉じたタブのパネル', async () => {
    (
      chrome.sessions.getRecentlyClosed as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue([
      {
        lastModified: 1_795_000_000,
        tab: { sessionId: 's1', title: 'T', url: 'https://r.example.com/' },
      },
    ]);
    const panel = document.getElementById(
      'tab-panel-recently-closed'
    ) as HTMLElement;
    panel.removeAttribute('hidden');
    await new RecentlyClosedPanel(panel).activate();
    await shown('#tab-panel-recently-closed .history-item');

    expect(await violations()).toEqual([]);
  });

  it('カレンダーのパネル（日付を選んでタイムラインを表示した状態）', async () => {
    const now = Date.now();
    (chrome as unknown as Record<string, unknown>).history = {
      search: vi.fn().mockResolvedValue([
        {
          id: 'h1',
          title: 'Alpha',
          url: 'https://alpha.example.com/',
          lastVisitTime: now,
          visitCount: 3,
        },
      ]),
    };
    const panel = document.getElementById('tab-panel-calendar') as HTMLElement;
    panel.removeAttribute('hidden');
    await new CalendarHistoryPanel(panel).activate();
    await shown('#tab-panel-calendar .calendar-day');
    (panel.querySelector('.calendar-day.today') as HTMLElement | null)?.click();
    await shown('#tab-panel-calendar .history-item');

    expect(await violations()).toEqual([]);
  });

  it('コンテキストメニューを開いた状態', async () => {
    new ContextMenu().open(10, 10, [
      { label: '編集', icon: '✏️', onSelect: () => {} },
      { label: '削除', icon: '🗑️', disabled: true, onSelect: () => {} },
    ]);
    await shown('[role="menu"]');

    expect(await violations()).toEqual([]);
  });

  describe('axe では検出できない、読み上げ用の属性', () => {
    it('サブフォルダを持つフォルダの見出しは、見えている「N個のフォルダ」を読み上げ用の名前に含む', () => {
      const header = container.querySelector(
        '[data-folder-id="10"] > .folder-header'
      ) as HTMLElement;
      expect(header.querySelector('.subfolder-count')?.textContent).toBe(
        '1個のフォルダ'
      );

      expect(header.getAttribute('aria-label')).toBe(
        'フォルダ「仕事」 1個のフォルダ 3件'
      );
    });

    it('サブフォルダを持たないフォルダの見出しの名前には、フォルダの数を入れない', () => {
      const header = container.querySelector(
        '[data-folder-id="11"] > .folder-header'
      ) as HTMLElement;

      expect(header.getAttribute('aria-label')).toBe('フォルダ「趣味」 0件');
    });

    it('ブックマークの編集ダイアログのエラー文は、出たときに読み上げられる', async () => {
      await new BookmarkEditor().handleBookmarkEdit(
        button('101', 'bookmark-edit-btn')
      );
      await shown('#edit-dialog');

      expect(
        document
          .querySelector('#edit-dialog .dialog-error')
          ?.getAttribute('role')
      ).toBe('alert');
    });

    it('新しいフォルダの作成ダイアログのエラー文は、出たときに読み上げられる', async () => {
      await new FolderCreator().openCreateDialog('10');
      await shown('#folder-create-dialog');

      expect(
        document
          .querySelector('#folder-create-dialog .dialog-error')
          ?.getAttribute('role')
      ).toBe('alert');
    });

    it('フォルダ名の変更ダイアログのエラー文は、出たときに読み上げられる', async () => {
      await new FolderRenamer().openRenameDialog('11');
      await shown('#folder-rename-dialog');

      expect(
        document
          .querySelector('#folder-rename-dialog .dialog-error')
          ?.getAttribute('role')
      ).toBe('alert');
    });

    it('「エラー」ダイアログを開くと、OK ボタンにフォーカスが移る（背後の項目に Enter が届かない）', async () => {
      (
        container.querySelector(
          '.bookmark-item[data-bookmark-id="101"]'
        ) as HTMLElement
      ).focus();

      void errorDialog('ブックマークの移動に失敗しました。');
      await shown('#error-dialog');

      const focused = document.activeElement as HTMLElement;
      expect(focused.closest('#error-dialog')).not.toBeNull();
      expect(focused.textContent).toBe('OK');
    });
  });
});
