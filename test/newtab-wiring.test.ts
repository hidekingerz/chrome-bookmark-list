// エントリーポイント src/scripts/newtab.ts が、描画のたびに行う配線を確かめる。
// 実際の src/newtab.html の上で newtab.ts を読み込み、ユーザーの操作と、その後の画面で見る。
//
// - 再描画しても、ユーザーが折りたたんだフォルダは折りたたまれたまま
// - 描画したブックマークは掴んでドラッグできる
// - 検索は、入力が 0.3 秒止まってから絞り込む
// - 描画したブックマークの Favicon を読み込む
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type FakeBookmarks,
  installFakeBookmarks,
  type SeedNode,
} from './helpers/fake-bookmarks';

const html = readFileSync(resolve(process.cwd(), 'src/newtab.html'), 'utf8');

const url = (name: string) => `https://${name}.example.com/`;

/** ブックマークバーの下に Dev [Alpha Beta] と Docs [Gamma] がある。 */
const seed = (): SeedNode[] => [
  {
    id: '1',
    title: 'ブックマーク バー',
    children: [
      {
        id: '200',
        title: 'Dev',
        children: [
          { id: '201', title: 'Alpha', url: url('alpha') },
          { id: '202', title: 'Beta', url: url('beta') },
        ],
      },
      {
        id: '300',
        title: 'Docs',
        children: [{ id: '301', title: 'Gamma', url: url('gamma') }],
      },
    ],
  },
  { id: '2', title: 'その他のブックマーク', children: [] },
];

describe('newtab.ts が描画のたびに行う配線', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;
  let searchInput: HTMLInputElement;
  let bookmarks: FakeBookmarks;
  let listenerErrors: string[];
  /** boot() が読み込んだ newtab.ts と同じ Toast（後始末に使う） */
  let dismissToast: () => void;

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    win = new Window({
      url: 'chrome-extension://test-id/newtab.html',
      // newtab.html が参照する styles.css と scripts/newtab.js は読みに行かない
      settings: {
        disableCSSFileLoading: true,
        disableJavaScriptFileLoading: true,
        handleDisabledFileLoadingAsSuccess: true,
      },
    });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;
    win.document.write(html);

    listenerErrors = [];
    win.addEventListener('error', (e) => {
      listenerErrors.push((e as unknown as ErrorEvent).message);
    });

    bookmarks = installFakeBookmarks(seed());
    container = document.getElementById('bookmarkContainer') as HTMLElement;
    searchInput = document.getElementById('searchInput') as HTMLInputElement;
    dismissToast = () => {};
  });

  afterEach(() => {
    dismissToast();
    vi.useRealTimers();
    vi.restoreAllMocks();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  /** 待っている非同期処理（Promise の連鎖）を進める。フェイクタイマーの有無によらず使える。 */
  async function settle(): Promise<void> {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  }

  /** newtab.ts を読み込み、DOMContentLoaded を発火して、最初の描画が終わるまで待つ。 */
  async function boot(): Promise<void> {
    await import('../src/scripts/newtab');
    const { Toast } = await import('../src/components/Toast/index');
    dismissToast = () => Toast.dismissCurrent();
    document.dispatchEvent(
      new win.Event('DOMContentLoaded') as unknown as Event
    );
    await settle();
    expect(shownTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);
  }

  function shownTitles(): (string | undefined)[] {
    return Array.from(container.querySelectorAll('.bookmark-title')).map((el) =>
      el.textContent?.trim()
    );
  }

  /** フォルダ直下に表示されているブックマークのタイトル。 */
  function shownIn(folderId: string): (string | undefined)[] {
    return Array.from(
      container.querySelectorAll(
        `[data-folder-id="${folderId}"] > .bookmark-list > .bookmark-item .bookmark-title`
      )
    ).map((el) => el.textContent?.trim());
  }

  function header(folderId: string): HTMLElement {
    return container.querySelector(
      `[data-folder-id="${folderId}"] > .folder-header`
    ) as HTMLElement;
  }

  function titleOf(bookmarkId: string): HTMLElement {
    return container.querySelector(
      `.bookmark-item[data-bookmark-id="${bookmarkId}"] .bookmark-title`
    ) as HTMLElement;
  }

  function click(target: HTMLElement): void {
    target.dispatchEvent(
      new win.MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      }) as unknown as Event
    );
  }

  /** フォルダの開閉の見た目（アイコンと、ブックマークのリストの表示）。 */
  function folderView(folderId: string) {
    const list = container.querySelector(
      `[data-folder-id="${folderId}"] > .bookmark-list`
    ) as HTMLElement;
    return {
      icon: header(folderId).querySelector('.expand-icon')?.textContent,
      ariaExpanded: header(folderId).getAttribute('aria-expanded'),
      listDisplay: list.style.display,
    };
  }
  const OPEN = { icon: '📂', ariaExpanded: 'true', listDisplay: 'block' };
  const CLOSED = { icon: '📁', ariaExpanded: 'false', listDisplay: 'none' };

  function type(value: string): void {
    searchInput.value = value;
    searchInput.dispatchEvent(
      new win.Event('input', { bubbles: true }) as unknown as Event
    );
  }

  /** happy-dom の DragEvent は dataTransfer を受け取らないので MouseEvent で代用する。 */
  function drag(type: string, target: HTMLElement): void {
    const event = new win.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientY: 400,
    }) as unknown as DragEvent;
    Object.defineProperty(event, 'dataTransfer', {
      value: {
        setData: vi.fn(),
        setDragImage: vi.fn(),
        effectAllowed: 'uninitialized',
        dropEffect: 'none',
      },
    });
    target.dispatchEvent(event);
  }

  /**
   * ユーザーが target の上でマウスを押して引きずる。
   * ブラウザと同じく、draggable="true" の要素（か、その中）でなければドラッグは始まらない。
   * ドラッグが始まれば dragstart は draggable な要素で起きる。
   */
  function grab(target: HTMLElement): void {
    const draggable = target.closest(
      '[draggable="true"]'
    ) as HTMLElement | null;
    if (!draggable) return;
    drag('dragstart', draggable);
  }

  describe('再描画での展開状態', () => {
    it('折りたたんだフォルダは、一覧を再読み込みしても折りたたまれたまま。他のフォルダと新しいフォルダは展開されている', async () => {
      await boot();
      click(header('200'));
      expect(folderView('200')).toEqual(CLOSED);

      // 別の場所でフォルダが増え、一覧が再読み込みされる
      await chrome.bookmarks.create({ parentId: '1', title: 'New' });
      const created = bookmarks.ids('1').at(-1) as string;
      await chrome.bookmarks.create({
        parentId: created,
        title: 'Delta',
        url: url('delta'),
      });
      document.dispatchEvent(
        new win.CustomEvent('bookmarks-changed') as unknown as Event
      );
      await settle();

      expect(shownTitles()).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta']);
      expect(folderView('200')).toEqual(CLOSED);
      expect(folderView('300')).toEqual(OPEN);
      expect(folderView(created)).toEqual(OPEN);
      expect(listenerErrors).toEqual([]);
    });

    it('再読み込みを 2 回続けても、折りたたんだ状態を保つ。開き直せば、次の再読み込みでは展開されている', async () => {
      await boot();
      click(header('200'));

      document.dispatchEvent(
        new win.CustomEvent('bookmarks-changed') as unknown as Event
      );
      await settle();
      document.dispatchEvent(
        new win.CustomEvent('bookmarks-changed') as unknown as Event
      );
      await settle();
      expect(folderView('200')).toEqual(CLOSED);

      // 再描画された一覧の上で開き直す
      click(header('200'));
      expect(folderView('200')).toEqual(OPEN);
      document.dispatchEvent(
        new win.CustomEvent('bookmarks-changed') as unknown as Event
      );
      await settle();

      expect(folderView('200')).toEqual(OPEN);
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('ドラッグ&ドロップ', () => {
    it('描画したブックマークは掴んでドラッグでき、別のフォルダへ落とすと一覧でもそのフォルダへ移る', async () => {
      await boot();

      grab(titleOf('201'));
      // ドラッグ中の表示になる
      expect(document.body.classList.contains('dragging-bookmark')).toBe(true);
      drag('dragover', header('300'));
      drag('drop', header('300'));
      await vi.waitFor(() => {
        expect(shownIn('300')).toEqual(['Gamma', 'Alpha']);
      });

      expect(shownIn('200')).toEqual(['Beta']);
      expect(bookmarks.titles('300')).toEqual(['Gamma', 'Alpha']);
      expect(bookmarks.titles('200')).toEqual(['Beta']);
      expect(listenerErrors).toEqual([]);
    });

    it('再描画したあとの一覧でも、ブックマークを掴んでドラッグできる', async () => {
      await boot();
      document.dispatchEvent(
        new win.CustomEvent('bookmarks-changed') as unknown as Event
      );
      await settle();

      grab(titleOf('202'));
      expect(document.body.classList.contains('dragging-bookmark')).toBe(true);
      drag('dragover', header('300'));
      drag('drop', header('300'));

      await vi.waitFor(() => {
        expect(shownIn('300')).toEqual(['Gamma', 'Beta']);
      });
      expect(shownIn('200')).toEqual(['Alpha']);
      expect(listenerErrors).toEqual([]);
    });
  });

  describe('検索のデバウンス', () => {
    it('入力してから 299 ミリ秒では絞り込まれず、300 ミリ秒で絞り込まれる', async () => {
      vi.useFakeTimers();
      await boot();

      type('alpha');
      await vi.advanceTimersByTimeAsync(299);
      expect(shownTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);

      await vi.advanceTimersByTimeAsync(1);
      expect(shownTitles()).toEqual(['Alpha']);
    });

    it('続けて入力すると、最後の入力から 300 ミリ秒たってから、最後の検索語で絞り込む', async () => {
      vi.useFakeTimers();
      await boot();

      type('al');
      await vi.advanceTimersByTimeAsync(200);
      type('gamma');
      // 最初の入力からは 499 ミリ秒、最後の入力からは 299 ミリ秒
      await vi.advanceTimersByTimeAsync(299);
      expect(shownTitles()).toEqual(['Alpha', 'Beta', 'Gamma']);

      await vi.advanceTimersByTimeAsync(1);
      expect(shownTitles()).toEqual(['Gamma']);
    });
  });

  describe('Favicon', () => {
    /** 表示中の各ブックマークの [タイトル, Favicon の img の src]。 */
    function faviconSources(): [string | undefined, string | null][] {
      return Array.from(container.querySelectorAll('.bookmark-item')).map(
        (item) => [
          item.querySelector('.bookmark-title')?.textContent?.trim(),
          item.querySelector('img.bookmark-favicon')?.getAttribute('src') ??
            null,
        ]
      );
    }
    const faviconOf = (pageUrl: string) =>
      `chrome-extension://test-id/_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`;

    it('描画した各ブックマークの Favicon を、Chrome の _favicon から読み込む', async () => {
      await boot();

      expect(faviconSources()).toEqual([
        ['Alpha', faviconOf(url('alpha'))],
        ['Beta', faviconOf(url('beta'))],
        ['Gamma', faviconOf(url('gamma'))],
      ]);
    });

    it('再描画で増えたブックマークの Favicon も読み込む', async () => {
      await boot();
      await chrome.bookmarks.create({
        parentId: '300',
        title: 'Delta',
        url: url('delta'),
      });

      document.dispatchEvent(
        new win.CustomEvent('bookmarks-changed') as unknown as Event
      );
      await settle();

      expect(faviconSources()).toEqual([
        ['Alpha', faviconOf(url('alpha'))],
        ['Beta', faviconOf(url('beta'))],
        ['Gamma', faviconOf(url('gamma'))],
        ['Delta', faviconOf(url('delta'))],
      ]);
    });
  });
});
