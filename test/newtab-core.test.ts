import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { displayBookmarksTestable } from '../src/scripts/newtab-core';
import type { BookmarkFolder } from '../src/types/bookmark';

// test/setup.ts はグローバル document を最小スタブで上書きしている。
// displayBookmarksTestable は innerHTML への代入と querySelectorAll を伴う
// 本物の DOM API に依存するため、このファイル内では happy-dom の実 DOM に差し替える。
const realWindow = new Window();
const realDocument = realWindow.document as unknown as Document;
let savedDocument: typeof globalThis.document;

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = realDocument;
});

afterEach(() => {
  globalThis.document = savedDocument;
  realDocument.body.innerHTML = '';
  vi.restoreAllMocks();
});

const makeFolder = (over: Partial<BookmarkFolder> = {}): BookmarkFolder => ({
  id: '1',
  title: 'テストフォルダ',
  bookmarks: [{ title: 'GitHub', url: 'https://github.com', favicon: null }],
  subfolders: [],
  expanded: true,
  ...over,
});

describe('newtab-core', () => {
  describe('displayBookmarksTestable', () => {
    it('フォルダが空のとき「見つかりませんでした」メッセージを表示する', async () => {
      const container = realDocument.createElement('div');

      await displayBookmarksTestable([], container);

      const noResults = container.querySelector('.no-results');
      expect(noResults).not.toBeNull();
      expect(noResults?.textContent).toBe(
        'ブックマークが見つかりませんでした。'
      );
    });

    it('フォルダがあるときブックマークをレンダリングしクリックハンドラーを設定する', async () => {
      const container = realDocument.createElement('div');
      realDocument.body.appendChild(container);

      await displayBookmarksTestable([makeFolder()], container);

      // no-results は描画されない
      expect(container.querySelector('.no-results')).toBeNull();
      // フォルダ要素が描画されている
      const folderEl = container.querySelector('[data-folder-id="1"]');
      expect(folderEl).not.toBeNull();
      // ブックマークリンクが描画されている
      const link = container.querySelector(
        '.bookmark-link[data-url="https://github.com"]'
      );
      expect(link).not.toBeNull();
    });

    it('空でないフォルダ描画後にクリックハンドラーが機能する', async () => {
      const container = realDocument.createElement('div');
      realDocument.body.appendChild(container);

      // chrome.tabs.create の呼び出しを検証するためにクリックを発火
      const createSpy = vi.fn();
      (globalThis as { chrome: typeof chrome }).chrome = {
        ...(globalThis as { chrome: typeof chrome }).chrome,
        tabs: {
          ...(globalThis as { chrome: typeof chrome }).chrome?.tabs,
          create: createSpy,
        },
      } as typeof chrome;

      await displayBookmarksTestable([makeFolder()], container);

      const link = container.querySelector(
        '.bookmark-link[data-url="https://github.com"]'
      ) as HTMLElement;
      const clickEvent = new (realWindow.Event as unknown as typeof Event)(
        'click',
        { bubbles: true }
      );
      link.dispatchEvent(clickEvent);

      expect(createSpy).toHaveBeenCalledWith({
        url: 'https://github.com',
        active: true,
      });
    });
  });
});
