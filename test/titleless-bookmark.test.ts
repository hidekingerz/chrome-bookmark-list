// Chrome ではブックマークバーにアイコンだけ（タイトル無し）で置けるため、
// タイトルが空のブックマークも一覧に含まれ、URL をタイトルとして表示することを確かめる。
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { processBookmarkTree } from '../src/scripts/utils';
import type { ChromeBookmarkNode } from '../src/types/bookmark';

const tree = [
  {
    id: '0',
    title: '',
    children: [
      {
        id: '1',
        title: 'ブックマーク バー',
        children: [
          { id: '10', title: '', url: 'https://icon-only.example.com/' },
          { id: '11', title: 'Named', url: 'https://named.example.com/' },
          {
            id: '20',
            title: 'Work',
            children: [
              { id: '21', title: '', url: 'https://no-title.example.com/' },
              { id: '22', title: 'Has title', url: 'https://t.example.com/' },
            ],
          },
        ],
      },
      {
        id: '2',
        title: 'その他のブックマーク',
        children: [{ id: '30', title: '', url: 'https://other.example.com/' }],
      },
    ],
  },
] as unknown as ChromeBookmarkNode[];

describe('タイトルが空のブックマーク', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;

  beforeEach(() => {
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    // newtab.ts と同じ手順（processBookmarkTree → 描画）で一覧を作る
    container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(
      processBookmarkTree(tree)
    );
  });

  afterEach(() => {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  /** フォルダ直下に表示されているブックマークを、上から順に [表示されるタイトル, 開く URL] で返す。 */
  function shown(folderId: string): [string | undefined, string | null][] {
    return Array.from(
      container.querySelectorAll(
        `[data-folder-id="${folderId}"] > .bookmark-list > .bookmark-item`
      )
    ).map((item) => [
      item.querySelector('.bookmark-title')?.textContent?.trim(),
      item.querySelector('.bookmark-link')?.getAttribute('data-url') ?? null,
    ]);
  }

  it('ブックマークバー直下のタイトル無しブックマークは、URL をタイトルとして表示する', () => {
    expect(shown('1')).toEqual([
      ['https://icon-only.example.com/', 'https://icon-only.example.com/'],
      ['Named', 'https://named.example.com/'],
    ]);
  });

  it('フォルダ内のタイトル無しブックマークは、URL をタイトルとして表示する', () => {
    expect(shown('20')).toEqual([
      ['https://no-title.example.com/', 'https://no-title.example.com/'],
      ['Has title', 'https://t.example.com/'],
    ]);
  });

  it('「その他のブックマーク」直下のタイトル無しブックマークも、URL をタイトルとして表示する', () => {
    expect(shown('2')).toEqual([
      ['https://other.example.com/', 'https://other.example.com/'],
    ]);
  });

  it('タイトル無しのブックマークも、フォルダの件数に数える', () => {
    const count = (folderId: string) =>
      container
        .querySelector(`[data-folder-id="${folderId}"] > .folder-header`)
        ?.querySelector('.bookmark-count')
        ?.textContent?.trim();

    expect(count('1')).toBe('2');
    expect(count('20')).toBe('2');
  });

  it('URL をタイトルにした項目は、読み上げ用のラベルと編集ボタンにも同じ文字が入る', () => {
    const item = container.querySelector(
      '.bookmark-item[data-bookmark-id="10"]'
    ) as HTMLElement;

    expect(item.getAttribute('aria-label')).toBe(
      'https://icon-only.example.com/'
    );
    expect(
      item.querySelector('.bookmark-edit-btn')?.getAttribute('aria-label')
    ).toBe('「https://icon-only.example.com/」を編集');
  });
});
