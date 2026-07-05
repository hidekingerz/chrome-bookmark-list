import { ShortcutHelp } from '../ShortcutHelp/index.js';

/**
 * グローバルなキーボードショートカットを管理する。
 *
 * 機能:
 * - 矢印キー (↑/↓): ブックマーク・フォルダ間のフォーカス移動
 * - Enter: フォーカスしているブックマークを開く / フォルダの展開トグル
 * - Delete / Backspace: フォーカスしている項目の削除
 * - F2: フォーカスしているブックマークの編集
 * - Cmd/Ctrl+F: 検索入力欄にフォーカス
 * - ?: ショートカット一覧ヘルプを表示
 *
 * Cmd/Ctrl+Z (Undo) は UndoManager 側で処理する。
 * 入力欄 / contentEditable にフォーカスがあるときはほとんどのショートカットを抑制する。
 */
export class KeyboardShortcuts {
  private static instance: KeyboardShortcuts | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private shortcutHelp: ShortcutHelp;

  private constructor() {
    this.shortcutHelp = new ShortcutHelp();
  }

  static getInstance(): KeyboardShortcuts {
    if (!KeyboardShortcuts.instance) {
      KeyboardShortcuts.instance = new KeyboardShortcuts();
    }
    return KeyboardShortcuts.instance;
  }

  /**
   * テスト用: シングルトンをリセットする。
   */
  static resetInstance(): void {
    if (KeyboardShortcuts.instance?.keydownHandler) {
      document.removeEventListener(
        'keydown',
        KeyboardShortcuts.instance.keydownHandler
      );
    }
    KeyboardShortcuts.instance = null;
  }

  /**
   * グローバルなキーボードハンドラを登録する。アプリ起動時に一度だけ呼ぶ。
   */
  initialize(): void {
    if (this.keydownHandler) {
      return;
    }
    this.keydownHandler = (e: KeyboardEvent) => {
      this.handleKeydown(e);
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  /**
   * ショートカットヘルプを表示する。
   */
  showHelp(): void {
    this.shortcutHelp.open();
  }

  private handleKeydown(e: KeyboardEvent): void {
    const active = document.activeElement as HTMLElement | null;
    const isEditable = this.isEditableElement(active);

    // Cmd/Ctrl+F : 検索フォーカス (入力欄でも有効にしてブラウザ標準を上書き)
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'f') {
      const searchInput = this.getActiveSearchInput();
      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
      return;
    }

    // 入力欄にフォーカスがある場合は以降の単独キー系ショートカットを抑制
    if (isEditable) {
      return;
    }

    // ? でヘルプ表示
    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      this.showHelp();
      return;
    }

    // 矢印キーでフォーカス移動
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const moved = this.moveFocus(e.key === 'ArrowDown' ? 1 : -1);
      if (moved) {
        e.preventDefault();
      }
      return;
    }

    // Enter で開く / フォルダ展開
    if (e.key === 'Enter') {
      const handled = this.handleEnter(active);
      if (handled) {
        e.preventDefault();
      }
      return;
    }

    // Delete / Backspace で削除
    if (e.key === 'Delete' || e.key === 'Backspace') {
      const handled = this.handleDelete(active);
      if (handled) {
        e.preventDefault();
      }
      return;
    }

    // F2 で編集
    if (e.key === 'F2') {
      const handled = this.handleEdit(active);
      if (handled) {
        e.preventDefault();
      }
      return;
    }
  }

  /**
   * フォーカス可能なブックマーク項目 / フォルダヘッダの一覧を画面表示順で取得する。
   */
  private getFocusableItems(): HTMLElement[] {
    const container = document.querySelector(
      '#bookmarkContainer'
    ) as HTMLElement | null;
    if (!container) return [];

    const nodes = container.querySelectorAll<HTMLElement>(
      '.folder-header, .bookmark-item'
    );
    // 1 回の走査で祖先の可視性判定を共有し、兄弟項目が同じ祖先を辿るたびに
    // getComputedStyle を呼び直す O(n×depth) の強制スタイル計算を避ける (#105)。
    const visibilityCache = new Map<HTMLElement, boolean>();
    return Array.from(nodes).filter((el) =>
      this.isVisible(el, visibilityCache)
    );
  }

  private isVisible(
    el: HTMLElement,
    cache?: Map<HTMLElement, boolean>
  ): boolean {
    // 非表示要素を除外する。display:none や hidden クラスを持つ要素はスキップ
    if (el.classList.contains('hidden')) return false;
    // 祖先まで遡って display:none を判定する。判定済みの祖先はキャッシュを
    // 再利用し、その祖先までに通過した要素へ結果をまとめて書き戻す。
    const path: HTMLElement[] = [];
    let current: HTMLElement | null = el;
    let chainVisible = true;
    while (current && current !== document.body) {
      const cached = cache?.get(current);
      if (cached !== undefined) {
        chainVisible = cached;
        break;
      }
      path.push(current);
      const style = window?.getComputedStyle
        ? window.getComputedStyle(current)
        : null;
      if (
        (style && style.display === 'none') ||
        current.style.display === 'none'
      ) {
        chainVisible = false;
        break;
      }
      current = current.parentElement;
    }
    for (const node of path) {
      cache?.set(node, chainVisible);
    }
    return chainVisible;
  }

  private moveFocus(delta: number): boolean {
    const items = this.getFocusableItems();
    if (items.length === 0) return false;

    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? items.indexOf(active) : -1;

    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = delta > 0 ? 0 : items.length - 1;
    } else {
      nextIndex = currentIndex + delta;
      if (nextIndex < 0) nextIndex = 0;
      if (nextIndex >= items.length) nextIndex = items.length - 1;
    }

    items[nextIndex]?.focus();
    return true;
  }

  private handleEnter(active: HTMLElement | null): boolean {
    if (!active) return false;

    const bookmarkItem = active.closest('.bookmark-item') as HTMLElement | null;
    if (bookmarkItem && active === bookmarkItem) {
      const link = bookmarkItem.querySelector<HTMLElement>('.bookmark-link');
      const url = link?.getAttribute('data-url');
      if (url) {
        chrome.tabs.create({ url });
        return true;
      }
      return false;
    }

    const folderHeader = active.closest('.folder-header') as HTMLElement | null;
    if (folderHeader && active === folderHeader) {
      // クリックイベントを発火させてトグルする (BookmarkFolderEvents が処理)
      folderHeader.click();
      return true;
    }

    return false;
  }

  private handleDelete(active: HTMLElement | null): boolean {
    if (!active) return false;

    const bookmarkItem = active.closest('.bookmark-item') as HTMLElement | null;
    if (bookmarkItem && active === bookmarkItem) {
      const deleteBtn = bookmarkItem.querySelector<HTMLElement>(
        '.bookmark-delete-btn'
      );
      if (deleteBtn) {
        deleteBtn.click();
        return true;
      }
    }

    return false;
  }

  private handleEdit(active: HTMLElement | null): boolean {
    if (!active) return false;

    const bookmarkItem = active.closest('.bookmark-item') as HTMLElement | null;
    if (bookmarkItem && active === bookmarkItem) {
      const editBtn =
        bookmarkItem.querySelector<HTMLElement>('.bookmark-edit-btn');
      if (editBtn) {
        editBtn.click();
        return true;
      }
    }

    return false;
  }

  /**
   * 現在表示中のタブパネル内の検索入力欄を取得する。
   * ブックマーク・履歴・カレンダーいずれのタブでも動作するよう、active なパネルを優先する。
   */
  private getActiveSearchInput(): HTMLInputElement | null {
    const activePanel =
      document.querySelector<HTMLElement>('.tab-panel.active');
    if (activePanel) {
      const input = activePanel.querySelector<HTMLInputElement>(
        'input[type="text"], input[type="search"]'
      );
      if (input) return input;
    }
    // フォールバック: ブックマークの検索入力欄
    return document.querySelector<HTMLInputElement>('#searchInput');
  }

  private isEditableElement(el: HTMLElement | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }
    if (el.isContentEditable) {
      return true;
    }
    return false;
  }
}
