import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { KeyboardShortcuts } from '../src/components/KeyboardShortcuts/index';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * 矢印キーによるフォーカス移動のうち、「どの項目にもフォーカスが無い」状態と
 * 「移動先が 1 つも無い」状態の振る舞い。
 *
 * 一覧は本物の BookmarkFolderRenderer で描画し、keydown を body に dispatch する。
 * 確かめるのは、フォーカスの移動先と、キーの既定動作を止めたかどうか。
 */
describe('矢印キーによるフォーカス移動（フォーカスが無い状態から）', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let listenerErrors: string[];

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
    {
      id: '11',
      title: '趣味',
      expanded: true,
      subfolders: [],
      bookmarks: [
        { id: '111', title: 'C', url: 'https://c.example.com/', favicon: null },
      ],
    },
  ];

  beforeEach(() => {
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

    KeyboardShortcuts.resetInstance();
    KeyboardShortcuts.getInstance().initialize();
  });

  afterEach(() => {
    KeyboardShortcuts.resetInstance();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  /** ブックマークタブの中身を描画する。html を省くと本物のレンダラの出力を使う。 */
  function renderBookmarkTab(
    html = new BookmarkFolderRenderer().renderFolders(folders)
  ): void {
    document.body.innerHTML = `
      <section class="tab-panel active">
        <input type="text" id="searchInput" />
        <div id="bookmarkContainer"></div>
      </section>
    `;
    (document.getElementById('bookmarkContainer') as HTMLElement).innerHTML =
      html;
  }

  /** フォーカスが無いときにブラウザがキーイベントを届ける先 (body) で keydown を起こす。 */
  function pressKey(key: string): KeyboardEvent {
    const event = new win.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    }) as unknown as KeyboardEvent;
    document.body.dispatchEvent(event);
    return event;
  }

  it('どこにもフォーカスが無い状態で ↓ を押すと、先頭のフォルダヘッダにフォーカスする', () => {
    renderBookmarkTab();
    expect(document.activeElement).toBe(document.body);

    const event = pressKey('ArrowDown');

    const firstHeader = document.querySelector(
      '[data-folder-id="10"] > .folder-header'
    );
    expect(document.activeElement).toBe(firstHeader);
    expect(event.defaultPrevented).toBe(true);
    expect(listenerErrors).toEqual([]);
  });

  it('どこにもフォーカスが無い状態で ↑ を押すと、末尾のブックマークにフォーカスする', () => {
    renderBookmarkTab();
    expect(document.activeElement).toBe(document.body);

    const event = pressKey('ArrowUp');

    const lastItem = document.querySelector('[data-bookmark-id="111"]');
    expect(lastItem?.getAttribute('role')).toBe('treeitem');
    expect(document.activeElement).toBe(lastItem);
    expect(event.defaultPrevented).toBe(true);
    expect(listenerErrors).toEqual([]);
  });

  it('フォーカスが無い状態から ↓ を 2 回押すと、2 番目の項目（最初のブックマーク）へ進む', () => {
    renderBookmarkTab();

    pressKey('ArrowDown');
    // 2 回目はフォーカス中の要素にキーが届く
    const focused = document.activeElement as HTMLElement;
    focused.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }) as unknown as Event
    );

    expect(document.activeElement).toBe(
      document.querySelector('[data-bookmark-id="101"]')
    );
  });

  it('一覧に項目が 1 つも無いときは、↓ を押しても既定動作を止めず、フォーカスも動かない', () => {
    renderBookmarkTab(
      '<div class="no-results">ブックマークが見つかりませんでした。</div>'
    );

    const event = pressKey('ArrowDown');

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect(listenerErrors).toEqual([]);
  });

  it('一覧に項目が 1 つも無いときは、↑ を押しても既定動作を止めない', () => {
    renderBookmarkTab(
      '<div class="no-results">ブックマークが見つかりませんでした。</div>'
    );

    const event = pressKey('ArrowUp');

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.body);
  });

  it('ブックマークの一覧 (#bookmarkContainer) が無いページでは、↓ を押しても何も起きず例外も出ない', () => {
    document.body.innerHTML = '<main><p>読み込み中...</p></main>';

    const event = pressKey('ArrowDown');

    expect(event.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(document.body);
    expect(listenerErrors).toEqual([]);
  });
  it('hidden クラスの付いた項目は ↓ で飛ばして、次の見えている項目にフォーカスする', () => {
    renderBookmarkTab();
    const items = Array.from(
      document.querySelectorAll<HTMLElement>('.bookmark-item')
    );
    // 2 件目 (B) を非表示にする
    items[1].classList.add('hidden');
    items[0].focus();

    items[0].dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'ArrowDown',
        bubbles: true,
        cancelable: true,
      }) as unknown as Event
    );

    // B を飛ばして、次のフォルダ「趣味」のヘッダへ移る
    const active = document.activeElement as HTMLElement;
    expect(active.classList.contains('folder-header')).toBe(true);
    expect(active.textContent).toContain('趣味');
  });
});
