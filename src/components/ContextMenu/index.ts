import { escapeHtml } from '../../scripts/utils.js';

export interface ContextMenuItem {
  label: string;
  icon?: string;
  disabled?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void | Promise<void>;
}

const MENU_ID = 'bookmark-context-menu';

/**
 * 汎用コンテキストメニュー。
 * 画面上の任意の座標でメニューを開閉し、外側クリック・ESCで閉じる。
 */
export class ContextMenu {
  private currentMenu: HTMLElement | null = null;
  private onCloseHandler: (() => void) | null = null;

  /**
   * メニューを開く。すでに別のメニューが開いていれば閉じてから表示する。
   */
  open(x: number, y: number, items: ContextMenuItem[]): void {
    this.close();

    if (items.length === 0) {
      return;
    }

    const menu = this.createMenuElement(items);
    document.body.appendChild(menu);

    // 画面端での見切れを防ぐため、表示後に位置を補正
    this.positionMenu(menu, x, y);

    this.currentMenu = menu;
    this.attachItemHandlers(menu, items);
    this.attachGlobalHandlers();

    // 最初の有効な項目にフォーカス
    const firstEnabled = menu.querySelector<HTMLElement>(
      '.context-menu-item:not(.disabled)'
    );
    firstEnabled?.focus();
  }

  /**
   * メニューが開いていれば閉じる。
   */
  close(): void {
    if (this.currentMenu) {
      this.currentMenu.remove();
      this.currentMenu = null;
    }
    if (this.onCloseHandler) {
      this.onCloseHandler();
      this.onCloseHandler = null;
    }
  }

  /**
   * メニューが開いているかどうか。
   */
  isOpen(): boolean {
    return this.currentMenu !== null;
  }

  private createMenuElement(items: ContextMenuItem[]): HTMLElement {
    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.className = 'context-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = items
      .map((item, index) => this.renderItem(item, index))
      .join('');
    return menu;
  }

  private renderItem(item: ContextMenuItem, index: number): string {
    if (item.separatorBefore && index > 0) {
      return `
        <div class="context-menu-separator" role="separator"></div>
        ${this.renderItemButton(item, index)}
      `;
    }
    return this.renderItemButton(item, index);
  }

  private renderItemButton(item: ContextMenuItem, index: number): string {
    const disabledAttr = item.disabled ? 'disabled' : '';
    const disabledClass = item.disabled ? 'disabled' : '';
    const icon = item.icon
      ? `<span class="context-menu-icon">${escapeHtml(item.icon)}</span>`
      : '';
    return `
      <button type="button"
              class="context-menu-item ${disabledClass}"
              role="menuitem"
              data-index="${index}"
              ${disabledAttr}>
        ${icon}
        <span class="context-menu-label">${escapeHtml(item.label)}</span>
      </button>
    `;
  }

  private positionMenu(menu: HTMLElement, x: number, y: number): void {
    menu.style.position = 'fixed';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.visibility = 'hidden';

    // 一旦DOMに付与した状態でサイズを計測
    requestAnimationFrame(() => {
      const rect = menu.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let finalX = x;
      let finalY = y;

      if (x + rect.width > vw) {
        finalX = Math.max(0, vw - rect.width - 4);
      }
      if (y + rect.height > vh) {
        finalY = Math.max(0, vh - rect.height - 4);
      }

      menu.style.left = `${finalX}px`;
      menu.style.top = `${finalY}px`;
      menu.style.visibility = 'visible';
    });
  }

  private attachItemHandlers(
    menu: HTMLElement,
    items: ContextMenuItem[]
  ): void {
    const buttons =
      menu.querySelectorAll<HTMLButtonElement>('.context-menu-item');
    for (const btn of buttons) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const indexAttr = btn.getAttribute('data-index');
        if (indexAttr === null) return;
        const index = Number.parseInt(indexAttr, 10);
        const item = items[index];
        if (!item || item.disabled) return;
        this.close();
        // メニューを閉じた後にアクションを実行
        Promise.resolve(item.onSelect()).catch((err) => {
          console.error('❌ コンテキストメニューアクションの実行に失敗:', err);
        });
      });
    }
  }

  private attachGlobalHandlers(): void {
    const handleDocumentClick = (e: MouseEvent) => {
      if (!this.currentMenu) return;
      if (!this.currentMenu.contains(e.target as Node)) {
        this.close();
      }
    };
    const handleKeydown = (e: KeyboardEvent) => {
      if (!this.currentMenu) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        this.close();
        return;
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        this.moveFocus(e.key === 'ArrowDown' ? 1 : -1);
      }
    };
    const handleContextMenu = (e: MouseEvent) => {
      if (!this.currentMenu) return;
      if (!this.currentMenu.contains(e.target as Node)) {
        this.close();
      }
    };
    const handleScroll = () => {
      this.close();
    };

    // mousedownを使うのは、click時の閉じ漏れを防ぐため
    document.addEventListener('mousedown', handleDocumentClick, true);
    document.addEventListener('keydown', handleKeydown);
    document.addEventListener('contextmenu', handleContextMenu, true);
    window.addEventListener('scroll', handleScroll, true);

    this.onCloseHandler = () => {
      document.removeEventListener('mousedown', handleDocumentClick, true);
      document.removeEventListener('keydown', handleKeydown);
      document.removeEventListener('contextmenu', handleContextMenu, true);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }

  private moveFocus(delta: number): void {
    if (!this.currentMenu) return;
    const items = Array.from(
      this.currentMenu.querySelectorAll<HTMLElement>(
        '.context-menu-item:not(.disabled)'
      )
    );
    if (items.length === 0) return;
    const active = document.activeElement as HTMLElement | null;
    const currentIndex = active ? items.indexOf(active) : -1;
    const nextIndex = (currentIndex + delta + items.length) % items.length;
    items[nextIndex]?.focus();
  }
}
