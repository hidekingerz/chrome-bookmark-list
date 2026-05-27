import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { BookmarkItemRenderer } from '../src/components/BookmarkItem/BookmarkItemRenderer';
import type { BookmarkFolder } from '../src/types/bookmark';

describe('アクセシビリティ・タッチ対応 (#58)', () => {
  let dom: JSDOM;
  let container: HTMLElement;

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><body><div id="bookmarks"></div></body></html>`,
      { url: 'chrome-extension://test/newtab.html' }
    );

    Object.defineProperty(globalThis, 'document', {
      value: dom.window.document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: dom.window,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: (cb: () => void) => {
        cb();
        return 0;
      },
      writable: true,
      configurable: true,
    });

    container = document.getElementById('bookmarks') as HTMLElement;
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  describe('aria 属性', () => {
    it('編集・削除ボタンに aria-label が付与される', () => {
      const itemRenderer = new BookmarkItemRenderer();
      container.innerHTML = itemRenderer.renderBookmarkItem({
        title: 'Test',
        url: 'https://test.example.com',
        favicon: null,
      });

      const editBtn = container.querySelector('.bookmark-edit-btn');
      const deleteBtn = container.querySelector('.bookmark-delete-btn');
      expect(editBtn?.getAttribute('aria-label')).toContain('編集');
      expect(editBtn?.getAttribute('aria-label')).toContain('Test');
      expect(deleteBtn?.getAttribute('aria-label')).toContain('削除');
      expect(deleteBtn?.getAttribute('aria-label')).toContain('Test');
    });

    it('ブックマーク項目に role="treeitem" と aria-label が付与される', () => {
      const itemRenderer = new BookmarkItemRenderer();
      container.innerHTML = itemRenderer.renderBookmarkItem({
        title: 'Test',
        url: 'https://test.example.com',
        favicon: null,
      });

      const item = container.querySelector('.bookmark-item');
      expect(item?.getAttribute('role')).toBe('treeitem');
      expect(item?.getAttribute('aria-label')).toBe('Test');
    });

    it('フォルダに role="tree" / 子は role="group"、aria-label / aria-expanded が付与される', () => {
      const folderRenderer = new BookmarkFolderRenderer();
      const folder: BookmarkFolder = {
        id: 'f1',
        title: 'My Folder',
        expanded: true,
        bookmarks: [
          { title: 'A', url: 'https://a.example.com', favicon: null },
        ],
        subfolders: [
          {
            id: 'f2',
            title: 'Sub',
            expanded: false,
            bookmarks: [],
            subfolders: [],
          },
        ],
      };
      container.innerHTML = folderRenderer.renderFolder(folder);

      const rootFolder = container.querySelector('.bookmark-folder');
      expect(rootFolder?.getAttribute('role')).toBe('tree');

      const subFolder = container.querySelector(
        '.bookmark-folder .bookmark-folder'
      );
      expect(subFolder?.getAttribute('role')).toBe('group');

      const header = container.querySelector('.folder-header');
      expect(header?.getAttribute('role')).toBe('treeitem');
      expect(header?.getAttribute('aria-expanded')).toBe('true');
      expect(header?.getAttribute('aria-label')).toContain('My Folder');
    });

    it('ブックマークリストに role="group" が付与される', () => {
      const itemRenderer = new BookmarkItemRenderer();
      container.innerHTML = itemRenderer.renderBookmarkList(
        [{ title: 'A', url: 'https://a.example.com', favicon: null }],
        true
      );
      const list = container.querySelector('.bookmark-list');
      expect(list?.getAttribute('role')).toBe('group');
    });
  });

  describe('タッチ長押し', () => {
    let events: BookmarkFolderEvents;

    function buildBookmarkDom(): void {
      const renderer = new BookmarkItemRenderer();
      container.innerHTML = `
        <div class="bookmark-folder" data-folder-id="f1">
          <div class="folder-header has-bookmarks" tabindex="0" role="treeitem">
            <h2 class="folder-title">フォルダ</h2>
          </div>
          ${renderer.renderBookmarkList(
            [{ title: 'Test', url: 'https://test.example.com', favicon: null }],
            true
          )}
        </div>
      `;
    }

    beforeEach(() => {
      vi.useFakeTimers();
      buildBookmarkDom();
      events = new BookmarkFolderEvents();
      events.setupFolderClickHandler(container, [
        {
          id: 'f1',
          title: 'フォルダ',
          expanded: true,
          bookmarks: [
            { title: 'Test', url: 'https://test.example.com', favicon: null },
          ],
          subfolders: [],
        },
      ]);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function makeTouchEvent(
      type: string,
      target: HTMLElement,
      x: number,
      y: number
    ): TouchEvent {
      const touch = {
        clientX: x,
        clientY: y,
        target,
      } as unknown as Touch;
      const event = new dom.window.Event(type, {
        bubbles: true,
        cancelable: true,
      }) as unknown as TouchEvent;
      Object.defineProperty(event, 'touches', { value: [touch] });
      Object.defineProperty(event, 'target', { value: target });
      return event;
    }

    it('ブックマークを長押し (500ms) するとコンテキストメニューが開く', () => {
      const item = container.querySelector('.bookmark-item') as HTMLElement;
      container.dispatchEvent(makeTouchEvent('touchstart', item, 100, 100));
      vi.advanceTimersByTime(500);

      const menu = document.getElementById('bookmark-context-menu');
      expect(menu).not.toBeNull();
    });

    it('短押し (500ms 未満) ではコンテキストメニューが開かない', () => {
      const item = container.querySelector('.bookmark-item') as HTMLElement;
      container.dispatchEvent(makeTouchEvent('touchstart', item, 100, 100));
      vi.advanceTimersByTime(200);
      container.dispatchEvent(makeTouchEvent('touchend', item, 100, 100));
      vi.advanceTimersByTime(400);

      const menu = document.getElementById('bookmark-context-menu');
      expect(menu).toBeNull();
    });

    it('長押し中に大きく指を動かすとキャンセルされる', () => {
      const item = container.querySelector('.bookmark-item') as HTMLElement;
      container.dispatchEvent(makeTouchEvent('touchstart', item, 100, 100));
      vi.advanceTimersByTime(200);
      // 移動が閾値 (10px) を超える
      container.dispatchEvent(makeTouchEvent('touchmove', item, 130, 130));
      vi.advanceTimersByTime(500);

      const menu = document.getElementById('bookmark-context-menu');
      expect(menu).toBeNull();
    });

    it('フォルダヘッダーを長押しするとフォルダ用メニューが開く', () => {
      const header = container.querySelector('.folder-header') as HTMLElement;
      container.dispatchEvent(makeTouchEvent('touchstart', header, 50, 50));
      vi.advanceTimersByTime(500);

      const menu = document.getElementById('bookmark-context-menu');
      expect(menu).not.toBeNull();
      // フォルダメニューには「フォルダ名を変更」が含まれる
      const labels = Array.from(
        menu?.querySelectorAll('.context-menu-label') ?? []
      ).map((el) => el.textContent);
      expect(labels).toContain('フォルダ名を変更');
    });
  });
});
