import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupBookmarkSearch } from '../src/scripts/searchInput';
import type { BookmarkFolder } from '../src/scripts/types';

/**
 * #104-2 検索デバウンスの再現/リグレッションテスト。
 * 修正前は input のたびに render（全DOM再構築＋favicon再ロード）が走っていた。
 * デバウンス適用後は SEARCH_DEBOUNCE_MS 内の連続入力が最後の一回にまとまる。
 */
describe('検索デバウンス (#104-2)', () => {
  let dom: JSDOM;
  let searchInput: HTMLInputElement;

  const bookmarks: BookmarkFolder[] = [
    {
      id: 'folder-1',
      title: 'フォルダ',
      bookmarks: [
        { title: 'GitHub', url: 'https://github.com', favicon: null },
        { title: 'Example', url: 'https://example.com', favicon: null },
      ],
      subfolders: [],
      expanded: true,
    },
  ];

  beforeEach(() => {
    dom = new JSDOM(
      '<!DOCTYPE html><html><body><input id="searchInput" /></body></html>',
      { url: 'chrome-extension://test/newtab.html' }
    );
    searchInput = dom.window.document.getElementById(
      'searchInput'
    ) as HTMLInputElement;
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    dom.window.close();
  });

  function typeChar(value: string): void {
    searchInput.value = value;
    searchInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }

  it('300ms 内の連続入力は最後の1回だけ render される', () => {
    const render = vi.fn();
    setupBookmarkSearch(searchInput, () => bookmarks, render, 300);

    // 連続タイプ（各入力の間隔は 100ms でデバウンス窓の 300ms 未満）
    typeChar('g');
    vi.advanceTimersByTime(100);
    typeChar('gi');
    vi.advanceTimersByTime(100);
    typeChar('git');

    // デバウンス窓が満了するまでは一度も render されない
    expect(render).not.toHaveBeenCalled();

    // 窓が満了すると最後の検索語で一度だけ render される
    vi.advanceTimersByTime(300);
    expect(render).toHaveBeenCalledTimes(1);

    // 最後の検索語 'git' に一致した GitHub のみが残る
    const rendered = render.mock.calls[0][0] as BookmarkFolder[];
    expect(rendered).toHaveLength(1);
    expect(rendered[0].bookmarks.map((b) => b.title)).toEqual(['GitHub']);
  });

  it('300ms 以上あけた別々の検索はそれぞれ render される', () => {
    const render = vi.fn();
    setupBookmarkSearch(searchInput, () => bookmarks, render, 300);

    typeChar('git');
    vi.advanceTimersByTime(300);
    typeChar('example');
    vi.advanceTimersByTime(300);

    expect(render).toHaveBeenCalledTimes(2);
  });
});
