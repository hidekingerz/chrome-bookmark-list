import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import type { BookmarkFolder } from '../src/types/bookmark';

/**
 * ブックマーク名・フォルダ名・URL に HTML として意味を持つ文字が入っていても、
 * 一覧には「文字」として出て、要素や属性として解釈されないこと。
 *
 * 本物のレンダラの出力を本物の DOM に流し込み、できあがった要素と属性を確かめる。
 */
describe('一覧の描画での HTML エスケープ', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let container: HTMLElement;

  const IMG = '<img src=x onerror=alert(1)>';
  const QUOTE = 'メモ" onmouseover="alert(1)';
  const APOS = "It's <b>bold</b> & more";

  beforeEach(() => {
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    container = document.createElement('div');
    container.id = 'bookmarkContainer';
    document.body.appendChild(container);
  });

  afterEach(() => {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function render(folders: BookmarkFolder[]): void {
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(folders);
  }

  function folderWith(
    title: string,
    bookmark: { title: string; url: string }
  ): BookmarkFolder[] {
    return [
      {
        id: '10',
        title,
        expanded: true,
        subfolders: [],
        bookmarks: [{ id: '101', favicon: null, ...bookmark }],
      },
    ];
  }

  /** 属性名が on で始まる（イベントハンドラの）属性を持つ要素の数。 */
  function elementsWithEventHandlerAttributes(): number {
    return Array.from(container.querySelectorAll('*')).filter((el) =>
      Array.from(el.attributes).some((attr) => attr.name.startsWith('on'))
    ).length;
  }

  describe('ブックマーク名', () => {
    function item(): HTMLElement {
      return container.querySelector(
        '.bookmark-item[data-bookmark-id="101"]'
      ) as HTMLElement;
    }

    it('タグの形をした名前は、要素にならず、そのままの文字として表示される', () => {
      render(folderWith('仕事', { title: IMG, url: 'https://example.com/' }));

      expect(item().querySelector('.bookmark-title')?.textContent).toBe(IMG);
      // 項目の中の img は Favicon 用の 1 つだけ。名前から img 要素は作られない
      const images = Array.from(item().querySelectorAll('img'));
      expect(images).toHaveLength(1);
      expect(images[0].classList.contains('bookmark-favicon')).toBe(true);
      expect(item().querySelector('.bookmark-title')?.children).toHaveLength(0);
      expect(elementsWithEventHandlerAttributes()).toBe(0);
    });

    it('引用符を含む名前は、属性を閉じて別の属性を足すことができず、属性の値としてそのまま入る', () => {
      render(folderWith('仕事', { title: QUOTE, url: 'https://example.com/' }));

      expect(item().getAttribute('data-bookmark-title')).toBe(QUOTE);
      expect(item().getAttribute('aria-label')).toBe(QUOTE);
      expect(item().querySelector('.bookmark-title')?.textContent).toBe(QUOTE);
      expect(elementsWithEventHandlerAttributes()).toBe(0);
    });

    it('編集・削除ボタンの属性にも、名前がそのままの文字として入る', () => {
      render(folderWith('仕事', { title: QUOTE, url: 'https://example.com/' }));

      const editButton = item().querySelector(
        '.bookmark-edit-btn'
      ) as HTMLElement;
      const deleteButton = item().querySelector(
        '.bookmark-delete-btn'
      ) as HTMLElement;
      expect(editButton.getAttribute('data-bookmark-title')).toBe(QUOTE);
      expect(editButton.getAttribute('aria-label')).toBe(`「${QUOTE}」を編集`);
      expect(deleteButton.getAttribute('data-bookmark-title')).toBe(QUOTE);
      expect(deleteButton.getAttribute('aria-label')).toBe(
        `「${QUOTE}」を削除`
      );
      expect(elementsWithEventHandlerAttributes()).toBe(0);
    });

    it('& や単引用符、タグを含む名前も、入力したとおりに表示される', () => {
      render(folderWith('仕事', { title: APOS, url: 'https://example.com/' }));

      expect(item().querySelector('.bookmark-title')?.textContent).toBe(APOS);
      expect(item().querySelector('.bookmark-title b')).toBeNull();
      expect(item().getAttribute('data-bookmark-title')).toBe(APOS);
    });
  });

  describe('ブックマークの URL', () => {
    it('引用符やタグを含む URL は、属性の値としてそのまま入り、要素や属性を増やさない', () => {
      const url = 'https://example.com/?q="><img src=x onerror=alert(1)>';
      render(folderWith('仕事', { title: 'Example', url }));

      const item = container.querySelector(
        '.bookmark-item[data-bookmark-id="101"]'
      ) as HTMLElement;
      expect(item.getAttribute('data-bookmark-url')).toBe(url);
      expect(
        item.querySelector('.bookmark-link')?.getAttribute('data-url')
      ).toBe(url);
      expect(
        item
          .querySelector('.bookmark-favicon')
          ?.getAttribute('data-favicon-url')
      ).toBe(url);
      expect(
        item
          .querySelector('.bookmark-edit-btn')
          ?.getAttribute('data-bookmark-url')
      ).toBe(url);
      expect(
        item
          .querySelector('.bookmark-delete-btn')
          ?.getAttribute('data-bookmark-url')
      ).toBe(url);
      expect(item.querySelectorAll('img')).toHaveLength(1);
      expect(elementsWithEventHandlerAttributes()).toBe(0);
    });
  });

  describe('フォルダ名', () => {
    function header(): HTMLElement {
      return container.querySelector(
        '[data-folder-id="10"] > .folder-header'
      ) as HTMLElement;
    }

    it('タグの形をした名前は、要素にならず、そのままの文字として表示される', () => {
      render(
        folderWith(IMG, { title: 'Example', url: 'https://example.com/' })
      );

      expect(header().querySelector('.folder-title')?.textContent).toBe(IMG);
      expect(header().querySelector('.folder-title')?.children).toHaveLength(0);
      expect(header().querySelectorAll('img')).toHaveLength(0);
      expect(elementsWithEventHandlerAttributes()).toBe(0);
    });

    it('引用符を含む名前は、読み上げ用のラベルにそのまま入り、ヘッダの属性を壊さない', () => {
      render(
        folderWith(QUOTE, { title: 'Example', url: 'https://example.com/' })
      );

      expect(header().getAttribute('aria-label')).toBe(
        `フォルダ「${QUOTE}」 1件`
      );
      expect(header().querySelector('.folder-title')?.textContent).toBe(QUOTE);
      // ラベルの後ろに並ぶ属性（ドラッグできること）も、そのまま効いている
      expect(header().getAttribute('draggable')).toBe('true');
      expect(elementsWithEventHandlerAttributes()).toBe(0);
    });

    it('& や単引用符、タグを含む名前も、入力したとおりに表示される', () => {
      render(
        folderWith(APOS, { title: 'Example', url: 'https://example.com/' })
      );

      expect(header().querySelector('.folder-title')?.textContent).toBe(APOS);
      expect(header().querySelector('.folder-title b')).toBeNull();
    });

    it('サブフォルダの名前も、そのままの文字として表示される', () => {
      render([
        {
          id: '10',
          title: '仕事',
          expanded: true,
          bookmarks: [],
          subfolders: [
            {
              id: '20',
              title: IMG,
              expanded: true,
              subfolders: [],
              bookmarks: [],
            },
          ],
        },
      ]);

      const subHeader = container.querySelector(
        '[data-folder-id="20"] > .folder-header'
      ) as HTMLElement;
      expect(subHeader.querySelector('.folder-title')?.textContent).toBe(IMG);
      expect(container.querySelectorAll('img')).toHaveLength(0);
      expect(elementsWithEventHandlerAttributes()).toBe(0);
    });
  });
});
