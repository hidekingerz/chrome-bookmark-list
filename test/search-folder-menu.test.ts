// 外部仕様 §12「対象になるブックマーク」。
// 検索で絞り込んでいる間、フォルダのメニューの「全て新しいタブで開く」「グループにまとめて開く」は、
// 絞り込み後に表示されているブックマークだけを対象にする（件数も同じ数になる）。
// エントリーポイント src/scripts/newtab.ts を実際の src/newtab.html の上で動かして確かめる。
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

const ALPHA = 'https://alpha.example.com/';
const BETA = 'https://beta.example.com/';
const GAMMA = 'https://gamma.example.com/';

// Dev（Alpha・Beta と、サブフォルダ Deep（Gamma））
const tree = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'ブックマーク バー',
        children: [
          {
            id: '200',
            title: 'Dev',
            children: [
              { id: '201', title: 'Alpha', url: ALPHA },
              { id: '202', title: 'Beta', url: BETA },
              {
                id: '210',
                title: 'Deep',
                children: [{ id: '211', title: 'Gamma', url: GAMMA }],
              },
            ],
          },
        ],
      },
      { id: '2', title: 'その他のブックマーク', children: [] },
    ],
  },
] as unknown as ChromeBookmarkNode[];

describe('検索中のフォルダのメニューが対象にするブックマーク', () => {
  let dom: JSDOM;
  let doc: Document;
  let container: HTMLElement;
  const saved = new Map<string, PropertyDescriptor | undefined>();

  const tabsCreate = () =>
    chrome.tabs.create as unknown as ReturnType<typeof vi.fn>;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  beforeEach(async () => {
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
    (
      chrome.bookmarks.getTree as unknown as ReturnType<typeof vi.fn>
    ).mockResolvedValue(tree);

    await import('../src/scripts/newtab');
    doc.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    await flush();
    await flush();
  });

  afterEach(() => {
    doc.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    }
    saved.clear();
    vi.restoreAllMocks();
  });

  async function search(term: string): Promise<void> {
    const input = doc.getElementById('searchInput') as HTMLInputElement;
    input.value = term;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, SEARCH_DEBOUNCE_MS + 50));
  }

  /** Dev フォルダのヘッダを右クリックして、開いたメニューの項目を返す。 */
  function openDevMenu(): HTMLElement[] {
    const header = container.querySelector(
      '[data-folder-id="200"] > .folder-header'
    ) as HTMLElement;
    header.dispatchEvent(
      new dom.window.MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        clientX: 10,
        clientY: 10,
      })
    );
    return Array.from(doc.querySelectorAll<HTMLElement>('.context-menu-item'));
  }

  const labels = (items: HTMLElement[]) =>
    items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim());

  const openedUrls = () =>
    tabsCreate().mock.calls.map(
      ([options]) => (options as { url: string }).url
    );

  it('検索していないときは、サブフォルダの中も含めた全件を対象にする', () => {
    const items = openDevMenu();

    expect(labels(items)).toContain(
      '🆕 中のブックマークを全て新しいタブで開く (3)'
    );
    expect(labels(items)).toContain('🗂️ グループにまとめて開く (3)');

    items
      .find((item) => item.textContent?.includes('全て新しいタブで開く'))
      ?.click();

    expect(openedUrls()).toEqual([ALPHA, BETA, GAMMA]);
  });

  it('検索で絞り込んでいる間は、表示されているブックマークだけを対象にし、件数もその数になる', async () => {
    await search('alpha');
    expect(
      Array.from(container.querySelectorAll('.bookmark-title')).map((el) =>
        el.textContent?.trim()
      )
    ).toEqual(['Alpha']);

    const items = openDevMenu();

    expect(labels(items)).toContain(
      '🆕 中のブックマークを全て新しいタブで開く (1)'
    );
    expect(labels(items)).toContain('🗂️ グループにまとめて開く (1)');

    items
      .find((item) => item.textContent?.includes('全て新しいタブで開く'))
      ?.click();

    expect(openedUrls()).toEqual([ALPHA]);
  });

  it('検索語を消すと、また全件を対象にする', async () => {
    await search('alpha');
    await search('');

    expect(labels(openDevMenu())).toContain(
      '🆕 中のブックマークを全て新しいタブで開く (3)'
    );
  });
});
