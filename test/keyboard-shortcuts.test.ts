import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KeyboardShortcuts } from '../src/components/KeyboardShortcuts/index';

describe('KeyboardShortcuts', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(
      `<!DOCTYPE html><html><body>
        <div class="tab-panel active" id="tab-panel-bookmarks">
          <input type="text" id="searchInput" />
          <div id="bookmarkContainer">
            <div class="bookmark-folder" data-folder-id="f1">
              <div class="folder-header has-bookmarks" tabindex="0" role="treeitem" aria-expanded="true">
                <span class="expand-icon expanded">📂</span>
                <h2 class="folder-title">Folder 1</h2>
              </div>
              <ul class="bookmark-list expanded" style="display: block;">
                <li class="bookmark-item" tabindex="0" data-bookmark-url="https://a.example.com" data-bookmark-title="A">
                  <a href="#" class="bookmark-link" data-url="https://a.example.com" tabindex="-1">
                    <span class="bookmark-title">A</span>
                  </a>
                  <div class="bookmark-actions">
                    <button class="bookmark-edit-btn" data-bookmark-url="https://a.example.com" data-bookmark-title="A">✏️</button>
                    <button class="bookmark-delete-btn" data-bookmark-url="https://a.example.com" data-bookmark-title="A">🗑️</button>
                  </div>
                </li>
                <li class="bookmark-item" tabindex="0" data-bookmark-url="https://b.example.com" data-bookmark-title="B">
                  <a href="#" class="bookmark-link" data-url="https://b.example.com" tabindex="-1">
                    <span class="bookmark-title">B</span>
                  </a>
                  <div class="bookmark-actions">
                    <button class="bookmark-edit-btn" data-bookmark-url="https://b.example.com" data-bookmark-title="B">✏️</button>
                    <button class="bookmark-delete-btn" data-bookmark-url="https://b.example.com" data-bookmark-title="B">🗑️</button>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </body></html>`,
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
    Object.defineProperty(globalThis, 'HTMLElement', {
      value: dom.window.HTMLElement,
      writable: true,
      configurable: true,
    });

    KeyboardShortcuts.resetInstance();
  });

  afterEach(() => {
    KeyboardShortcuts.resetInstance();
    dom.window.close();
    vi.clearAllMocks();
  });

  function fireKey(key: string, init: KeyboardEventInit = {}): void {
    const event = new dom.window.KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
      ...init,
    });
    document.dispatchEvent(event);
  }

  it('↓ キーで次のフォーカス可能項目に移動する', () => {
    KeyboardShortcuts.getInstance().initialize();

    const folderHeader = document.querySelector(
      '.folder-header'
    ) as HTMLElement;
    folderHeader.focus();

    fireKey('ArrowDown');

    const firstItem = document.querySelectorAll('.bookmark-item')[0];
    expect(document.activeElement).toBe(firstItem);
  });

  it('↑ キーで前のフォーカス可能項目に移動する', () => {
    KeyboardShortcuts.getInstance().initialize();

    const items = document.querySelectorAll<HTMLElement>('.bookmark-item');
    items[1].focus();

    fireKey('ArrowUp');

    expect(document.activeElement).toBe(items[0]);
  });

  it('Enter キーでフォーカス中のブックマークが開かれる', () => {
    KeyboardShortcuts.getInstance().initialize();

    const tabsCreate = vi.fn();
    (globalThis as { chrome?: { tabs: { create: unknown } } }).chrome = {
      tabs: { create: tabsCreate },
    };

    const item = document.querySelector('.bookmark-item') as HTMLElement;
    item.focus();

    fireKey('Enter');

    expect(tabsCreate).toHaveBeenCalledWith({ url: 'https://a.example.com' });
  });

  it('Enter キーでフォーカス中のフォルダのクリックが発火する', () => {
    KeyboardShortcuts.getInstance().initialize();

    const folderHeader = document.querySelector(
      '.folder-header'
    ) as HTMLElement;
    const clickSpy = vi.fn();
    folderHeader.addEventListener('click', clickSpy);

    folderHeader.focus();
    fireKey('Enter');

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('Delete キーでフォーカス中のブックマークの削除ボタンが押される', () => {
    KeyboardShortcuts.getInstance().initialize();

    const item = document.querySelector('.bookmark-item') as HTMLElement;
    const deleteBtn = item.querySelector('.bookmark-delete-btn') as HTMLElement;
    const clickSpy = vi.fn();
    deleteBtn.addEventListener('click', clickSpy);

    item.focus();
    fireKey('Delete');

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('F2 キーでフォーカス中のブックマークの編集ボタンが押される', () => {
    KeyboardShortcuts.getInstance().initialize();

    const item = document.querySelector('.bookmark-item') as HTMLElement;
    const editBtn = item.querySelector('.bookmark-edit-btn') as HTMLElement;
    const clickSpy = vi.fn();
    editBtn.addEventListener('click', clickSpy);

    item.focus();
    fireKey('F2');

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('Cmd+F で検索入力欄にフォーカスする', () => {
    KeyboardShortcuts.getInstance().initialize();

    const folderHeader = document.querySelector(
      '.folder-header'
    ) as HTMLElement;
    folderHeader.focus();

    fireKey('f', { metaKey: true });

    const searchInput = document.querySelector('#searchInput');
    expect(document.activeElement).toBe(searchInput);
  });

  it('Ctrl+F で検索入力欄にフォーカスする', () => {
    KeyboardShortcuts.getInstance().initialize();

    fireKey('f', { ctrlKey: true });

    const searchInput = document.querySelector('#searchInput');
    expect(document.activeElement).toBe(searchInput);
  });

  it('? キーでショートカットヘルプが表示される', () => {
    KeyboardShortcuts.getInstance().initialize();

    fireKey('?');

    const dialog = document.getElementById('shortcut-help-dialog');
    expect(dialog).not.toBeNull();
  });

  it('入力欄にフォーカスがあるとき矢印キーは抑制される', () => {
    KeyboardShortcuts.getInstance().initialize();

    const input = document.querySelector('#searchInput') as HTMLInputElement;
    input.focus();

    fireKey('ArrowDown');

    // フォーカスは input のまま
    expect(document.activeElement).toBe(input);
  });

  it('入力欄にフォーカスがあるとき Delete キーは抑制される', () => {
    KeyboardShortcuts.getInstance().initialize();

    const input = document.querySelector('#searchInput') as HTMLInputElement;
    input.focus();

    const item = document.querySelector('.bookmark-item') as HTMLElement;
    const deleteBtn = item.querySelector('.bookmark-delete-btn') as HTMLElement;
    const clickSpy = vi.fn();
    deleteBtn.addEventListener('click', clickSpy);

    fireKey('Delete');

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('initialize() を 2 回呼んでもハンドラは一度しか登録されない', () => {
    const shortcuts = KeyboardShortcuts.getInstance();
    shortcuts.initialize();
    shortcuts.initialize();

    const tabsCreate = vi.fn();
    (globalThis as { chrome?: { tabs: { create: unknown } } }).chrome = {
      tabs: { create: tabsCreate },
    };

    const item = document.querySelector('.bookmark-item') as HTMLElement;
    item.focus();
    fireKey('Enter');

    expect(tabsCreate).toHaveBeenCalledTimes(1);
  });

  describe('未到達パスの補完', () => {
    it('Shift + / でショートカットヘルプが表示される', () => {
      KeyboardShortcuts.getInstance().initialize();

      fireKey('/', { shiftKey: true });

      expect(document.getElementById('shortcut-help-dialog')).not.toBeNull();
    });

    it('Cmd + Shift + F は検索フォーカスを発火しない', () => {
      KeyboardShortcuts.getInstance().initialize();

      const folderHeader = document.querySelector(
        '.folder-header'
      ) as HTMLElement;
      folderHeader.focus();

      fireKey('f', { metaKey: true, shiftKey: true });

      // shiftKey が立っているため検索フォーカスへは進まない
      expect(document.activeElement).toBe(folderHeader);
    });

    it('アクティブなタブパネルが無くても #searchInput にフォールバックする', () => {
      KeyboardShortcuts.getInstance().initialize();

      // .tab-panel.active を消すと getActiveSearchInput はフォールバックする
      const panel = document.querySelector('.tab-panel') as HTMLElement;
      panel.classList.remove('active');

      const folderHeader = document.querySelector(
        '.folder-header'
      ) as HTMLElement;
      folderHeader.focus();

      fireKey('f', { ctrlKey: true });

      const searchInput = document.querySelector('#searchInput');
      expect(document.activeElement).toBe(searchInput);
    });

    it('contentEditable 要素にフォーカスがあるとショートカットは抑制される', () => {
      KeyboardShortcuts.getInstance().initialize();

      const editable = document.createElement('div');
      editable.tabIndex = 0;
      Object.defineProperty(editable, 'isContentEditable', {
        value: true,
        configurable: true,
      });
      document.body.appendChild(editable);
      editable.focus();
      expect(document.activeElement).toBe(editable);

      fireKey('?');

      // contentEditable なのでヘルプは開かない
      expect(document.getElementById('shortcut-help-dialog')).toBeNull();
    });

    it('フォルダヘッダにフォーカス中の Delete は何もしない', () => {
      KeyboardShortcuts.getInstance().initialize();

      const folderHeader = document.querySelector(
        '.folder-header'
      ) as HTMLElement;
      folderHeader.focus();

      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Delete',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      // handleDelete が false を返すため preventDefault されない
      expect(event.defaultPrevented).toBe(false);
    });

    it('削除ボタンを持たないブックマーク項目の Delete は何もしない', () => {
      KeyboardShortcuts.getInstance().initialize();

      const container = document.querySelector(
        '#bookmarkContainer'
      ) as HTMLElement;
      const bareItem = document.createElement('li');
      bareItem.className = 'bookmark-item';
      bareItem.tabIndex = 0;
      container.appendChild(bareItem);
      bareItem.focus();

      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Delete',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('フォルダヘッダにフォーカス中の F2 は何もしない', () => {
      KeyboardShortcuts.getInstance().initialize();

      const folderHeader = document.querySelector(
        '.folder-header'
      ) as HTMLElement;
      folderHeader.focus();

      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'F2',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('編集ボタンを持たないブックマーク項目の F2 は何もしない', () => {
      KeyboardShortcuts.getInstance().initialize();

      const container = document.querySelector(
        '#bookmarkContainer'
      ) as HTMLElement;
      const bareItem = document.createElement('li');
      bareItem.className = 'bookmark-item';
      bareItem.tabIndex = 0;
      container.appendChild(bareItem);
      bareItem.focus();

      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'F2',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });

    it('data-url を持たないブックマーク項目の Enter は何もしない', () => {
      KeyboardShortcuts.getInstance().initialize();

      const tabsCreate = vi.fn();
      (globalThis as { chrome?: { tabs: { create: unknown } } }).chrome = {
        tabs: { create: tabsCreate },
      };

      const container = document.querySelector(
        '#bookmarkContainer'
      ) as HTMLElement;
      const item = document.createElement('li');
      item.className = 'bookmark-item';
      item.tabIndex = 0;
      // data-url の無い bookmark-link を持つ
      item.innerHTML = '<a href="#" class="bookmark-link"></a>';
      container.appendChild(item);
      item.focus();

      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(tabsCreate).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(false);
    });

    it('ブックマークでもフォルダでもない要素の Enter は何もしない', () => {
      KeyboardShortcuts.getInstance().initialize();

      const container = document.querySelector(
        '#bookmarkContainer'
      ) as HTMLElement;
      container.tabIndex = 0;
      container.focus();

      const event = new dom.window.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);

      expect(event.defaultPrevented).toBe(false);
    });
  });
});
