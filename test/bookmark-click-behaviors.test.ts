import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkFolderEvents } from '../src/components/BookmarkFolder/BookmarkFolderEvents';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import type { BookmarkFolder } from '../src/types/bookmark';

describe('ブックマークのクリック挙動（中クリック・修飾キー）', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let events: BookmarkFolderEvents;
  let allBookmarks: BookmarkFolder[];

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
      value: (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
      writable: true,
      configurable: true,
    });

    const mockChrome = globalThis.chrome as unknown as {
      tabs: {
        create: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
    };
    mockChrome.tabs.create = vi.fn();
    mockChrome.tabs.update = vi.fn();

    allBookmarks = [
      {
        id: 'folder-1',
        title: 'テストフォルダ',
        expanded: true,
        bookmarks: [
          {
            title: 'サイトA',
            url: 'https://a.example.com',
            favicon: null,
          },
        ],
        subfolders: [],
      },
    ];

    container = dom.window.document.getElementById('bookmarks') as HTMLElement;
    const renderer = new BookmarkFolderRenderer();
    container.innerHTML = renderer.renderFolders(allBookmarks);

    events = new BookmarkFolderEvents();
    events.setupFolderClickHandler(container, allBookmarks);
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('通常クリックでは新しいタブをアクティブで開く', () => {
    const bookmarkLink = container.querySelector(
      '.bookmark-link'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
    });
    bookmarkLink.dispatchEvent(event);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: true,
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it('Cmd+クリックでは新しいタブをバックグラウンドで開く', () => {
    const bookmarkLink = container.querySelector(
      '.bookmark-link'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      metaKey: true,
    });
    bookmarkLink.dispatchEvent(event);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: false,
    });
  });

  it('Ctrl+クリックでは新しいタブをバックグラウンドで開く', () => {
    const bookmarkLink = container.querySelector(
      '.bookmark-link'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      button: 0,
      ctrlKey: true,
    });
    bookmarkLink.dispatchEvent(event);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: false,
    });
  });

  it('中クリック（auxclick, button=1）では新しいタブをバックグラウンドで開く', () => {
    const bookmarkLink = container.querySelector(
      '.bookmark-link'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('auxclick', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    bookmarkLink.dispatchEvent(event);

    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: false,
    });
    expect(event.defaultPrevented).toBe(true);
  });

  it('右クリック相当の auxclick (button=2) では何もしない', () => {
    const bookmarkLink = container.querySelector(
      '.bookmark-link'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('auxclick', {
      bubbles: true,
      cancelable: true,
      button: 2,
    });
    bookmarkLink.dispatchEvent(event);

    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('中クリック時の mousedown ではオートスクロール抑止のため preventDefault される', () => {
    const bookmarkLink = container.querySelector(
      '.bookmark-link'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    bookmarkLink.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it('ブックマークリンク以外への中クリックは無視される', () => {
    const folderHeader = container.querySelector(
      '.folder-header'
    ) as HTMLElement;
    const event = new dom.window.MouseEvent('auxclick', {
      bubbles: true,
      cancelable: true,
      button: 1,
    });
    folderHeader.dispatchEvent(event);

    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
