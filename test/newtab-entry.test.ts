// エントリーポイント src/scripts/newtab.ts を、実際の src/newtab.html の上で読み込んで確かめる。
// 初期表示、検索の配線、失敗時と該当なしの表示、bookmarks-changed での再読み込み。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEARCH_DEBOUNCE_MS } from '../src/constants/index';
import type { ChromeBookmarkNode } from '../src/types/bookmark';

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
  'navigator',
  'requestAnimationFrame',
] as const;

const tree = (bar: unknown[]): ChromeBookmarkNode[] =>
  [
    {
      id: '0',
      title: '',
      children: [
        { id: '1', title: 'ブックマーク バー', children: bar },
        { id: '2', title: 'その他のブックマーク', children: [] },
      ],
    },
  ] as unknown as ChromeBookmarkNode[];

const devFolder = {
  id: '200',
  title: 'Dev',
  children: [
    { id: '201', title: 'Alpha', url: 'https://alpha.example.com/' },
    { id: '202', title: 'Beta', url: 'https://beta.example.com/' },
  ],
};

describe('newtab.ts（エントリーポイント）', () => {
  let dom: JSDOM;
  let doc: Document;
  let container: HTMLElement;
  let searchInput: HTMLInputElement;
  const saved = new Map<string, PropertyDescriptor | undefined>();

  const getTree = () =>
    chrome.bookmarks.getTree as unknown as ReturnType<typeof vi.fn>;
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const afterDebounce = () =>
    new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50));

  /** newtab.ts を読み込み、DOMContentLoaded を発火して初期化が終わるまで待つ */
  const boot = async (): Promise<void> => {
    await import('../src/scripts/newtab');
    doc.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    await flush();
  };

  const click = (el: Element): void => {
    el.dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
    );
  };

  const folderState = (id: string) => {
    const header = container.querySelector(
      `[data-folder-id="${id}"] > .folder-header`
    ) as HTMLElement;
    const list = container.querySelector(
      `[data-folder-id="${id}"] > .bookmark-list`
    ) as HTMLElement;
    return {
      icon: header.querySelector('.expand-icon')?.textContent,
      listDisplay: list.style.display,
    };
  };

  const titles = () =>
    Array.from(container.querySelectorAll('.bookmark-title')).map((el) =>
      el.textContent?.trim()
    );

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    dom = new JSDOM(html, { url: 'http://localhost', pretendToBeVisual: true });
    for (const key of GLOBAL_KEYS) {
      saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, {
        value: (dom.window as unknown as Record<string, unknown>)[key],
        writable: true,
        configurable: true,
      });
    }
    doc = dom.window.document;
    container = doc.getElementById('bookmarkContainer') as HTMLElement;
    searchInput = doc.getElementById('searchInput') as HTMLInputElement;
  });

  afterEach(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      }
    }
    saved.clear();
    vi.restoreAllMocks();
  });

  it('起動するとブックマークをフォルダごとに描画する', async () => {
    getTree().mockResolvedValue(tree([devFolder]));

    await boot();

    expect(
      container.querySelector('[data-folder-id="200"] .folder-title')
        ?.textContent
    ).toContain('Dev');
    expect(titles()).toEqual(['Alpha', 'Beta']);
  });

  it('折りたたんだフォルダは検索で展開表示され、ヘッダーを 1 回クリックすると折りたたまれる', async () => {
    getTree().mockResolvedValue(tree([devFolder]));
    await boot();

    // ユーザーがフォルダを折りたたむ
    click(
      container.querySelector(
        '[data-folder-id="200"] > .folder-header'
      ) as HTMLElement
    );
    expect(folderState('200')).toEqual({ icon: '📁', listDisplay: 'none' });

    // 検索すると、該当するフォルダは展開表示される
    searchInput.value = 'alpha';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await afterDebounce();
    await flush();
    expect(titles()).toEqual(['Alpha']);
    expect(folderState('200')).toEqual({ icon: '📂', listDisplay: 'block' });

    // 展開表示されているフォルダを 1 回クリックすると折りたたまれる
    click(
      container.querySelector(
        '[data-folder-id="200"] > .folder-header'
      ) as HTMLElement
    );
    expect(folderState('200')).toEqual({ icon: '📁', listDisplay: 'none' });
  });

  it('ブックマークの取得に失敗したら、失敗した旨を表示する', async () => {
    getTree().mockRejectedValue(new Error('boom'));

    await boot();

    expect(container.textContent).toContain(
      'ブックマークの読み込みに失敗しました。'
    );
  });

  it('検索に該当するブックマークがなければ、見つからなかった旨を表示する', async () => {
    getTree().mockResolvedValue(tree([devFolder]));
    await boot();

    searchInput.value = 'zzz-no-hit';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await afterDebounce();
    await flush();

    expect(container.textContent).toContain(
      'ブックマークが見つかりませんでした。'
    );
    expect(titles()).toEqual([]);
  });

  it('操作の後の再読み込みに失敗したら、「エラー」ダイアログで知らせ、一覧は前のまま残す', async () => {
    getTree().mockResolvedValue(tree([devFolder]));
    await boot();
    getTree().mockRejectedValue(new Error('boom'));

    doc.dispatchEvent(new dom.window.CustomEvent('bookmarks-changed'));
    await flush();
    await flush();

    expect(
      doc.querySelector('#error-dialog .error-message')?.textContent?.trim()
    ).toBe('❌ ブックマークの再読み込みに失敗しました。');
    expect(titles()).toEqual(['Alpha', 'Beta']);
  });

  it('bookmarks-changed で再読み込みし、検索語による絞り込みを保つ', async () => {
    getTree().mockResolvedValue(tree([devFolder]));
    await boot();

    searchInput.value = 'beta';
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await afterDebounce();
    await flush();
    expect(titles()).toEqual(['Beta']);

    // Chrome 側でブックマークが増えた
    getTree().mockResolvedValue(
      tree([
        {
          ...devFolder,
          children: [
            ...devFolder.children,
            { id: '203', title: 'Beta Two', url: 'https://beta2.example.com/' },
            { id: '204', title: 'Gamma', url: 'https://gamma.example.com/' },
          ],
        },
      ])
    );
    doc.dispatchEvent(new dom.window.CustomEvent('bookmarks-changed'));
    await flush();
    await flush();

    // 検索語が残っているので、増えた分も絞り込まれて出る
    expect(searchInput.value).toBe('beta');
    expect(titles()).toEqual(['Beta', 'Beta Two']);
  });
  describe('タブを選んだとき', () => {
    const now = Date.now();
    const historySearch = vi.fn();

    const selectTab = async (name: string): Promise<HTMLElement> => {
      click(
        doc.querySelector(`.tab-button[data-tab="${name}"]`) as HTMLElement
      );
      await flush();
      await flush();
      return doc.getElementById(`tab-panel-${name}`) as HTMLElement;
    };

    beforeEach(() => {
      historySearch.mockReset();
      historySearch.mockResolvedValue([
        {
          id: '1',
          url: 'https://visited.example.com/',
          title: 'Visited Page',
          lastVisitTime: now,
          visitCount: 2,
        },
      ]);
      (chrome as unknown as { history: unknown }).history = {
        search: historySearch,
      };
      getTree().mockResolvedValue(tree([devFolder]));
    });

    afterEach(() => {
      delete (chrome as unknown as { history?: unknown }).history;
    });

    it('起動した時点では、履歴も最近閉じたタブも読み込まない', async () => {
      await boot();

      expect(historySearch).not.toHaveBeenCalled();
      expect(chrome.sessions.getRecentlyClosed).not.toHaveBeenCalled();
    });

    it('「最近の履歴」を選ぶと、履歴を読み込んで表示する', async () => {
      await boot();

      const panel = await selectTab('history');

      expect(historySearch).toHaveBeenCalledTimes(1);
      expect(panel.textContent).toContain('Visited Page');
    });

    it('「最近閉じたタブ」を選ぶと、閉じたタブを読み込んで表示する', async () => {
      (
        chrome.sessions.getRecentlyClosed as unknown as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          tab: {
            sessionId: 's1',
            title: 'Closed Page',
            url: 'https://closed.example.com/',
          },
        },
      ]);
      await boot();

      const panel = await selectTab('recently-closed');

      expect(panel.textContent).toContain('Closed Page');
    });

    it('「カレンダー」を選ぶと、その月の履歴を読み込んでカレンダーを表示する', async () => {
      await boot();

      const panel = await selectTab('calendar');

      expect(historySearch).toHaveBeenCalledTimes(1);
      expect(
        panel.querySelector('.calendar-month-year')?.textContent?.trim()
      ).not.toBe('');
    });
  });

  it('再読み込みに失敗しても、表示中の一覧はそのまま残る', async () => {
    getTree().mockResolvedValue(tree([devFolder]));
    await boot();
    expect(titles()).toEqual(['Alpha', 'Beta']);

    getTree().mockRejectedValue(new Error('boom'));
    doc.dispatchEvent(new dom.window.CustomEvent('bookmarks-changed'));
    await flush();
    await flush();

    expect(console.error).toHaveBeenCalledWith(
      'ブックマーク再読み込みエラー:',
      expect.any(Error)
    );
    expect(titles()).toEqual(['Alpha', 'Beta']);
  });
});
