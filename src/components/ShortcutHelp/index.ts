import { escapeHtml } from '../../scripts/utils.js';

interface Shortcut {
  keys: string[];
  description: string;
}

const SHORTCUTS: Shortcut[] = [
  {
    keys: ['↑', '↓'],
    description: 'ブックマーク・フォルダ間でフォーカスを移動',
  },
  {
    keys: ['Enter'],
    description: 'ブックマークを開く / フォルダの展開・折りたたみ',
  },
  { keys: ['Delete'], description: 'フォーカスしているブックマークを削除' },
  { keys: ['F2'], description: 'フォーカスしているブックマークを編集' },
  { keys: ['Cmd/Ctrl + F'], description: '検索入力欄にフォーカス' },
  { keys: ['Cmd/Ctrl + Z'], description: '直前の操作を取り消す (Undo)' },
  { keys: ['Shift + F10'], description: 'コンテキストメニューを表示' },
  { keys: ['?'], description: 'このヘルプを表示' },
  { keys: ['Esc'], description: 'ダイアログやメニューを閉じる' },
];

const DIALOG_ID = 'shortcut-help-dialog';

/**
 * キーボードショートカット一覧を表示するダイアログ。
 * ? キーで開かれる。Esc・背景クリック・閉じるボタンで閉じる。
 */
export class ShortcutHelp {
  private dialogElement: HTMLElement | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * ダイアログを開く。すでに開いていれば何もしない。
   */
  open(): void {
    if (this.dialogElement) return;
    this.dialogElement = this.render();
    document.body.appendChild(this.dialogElement);
    this.attachHandlers();

    // 閉じるボタンにフォーカス
    const closeBtn = this.dialogElement.querySelector<HTMLButtonElement>(
      '.shortcut-help-close'
    );
    closeBtn?.focus();
  }

  /**
   * ダイアログを閉じる。
   */
  close(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
    if (this.dialogElement) {
      this.dialogElement.remove();
      this.dialogElement = null;
    }
  }

  /**
   * ダイアログが開いているかどうか。
   */
  isOpen(): boolean {
    return this.dialogElement !== null;
  }

  private render(): HTMLElement {
    const overlay = document.createElement('div');
    overlay.id = DIALOG_ID;
    overlay.className = 'shortcut-help-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'shortcut-help-title');

    const rows = SHORTCUTS.map((s) => {
      const keys = s.keys
        .map((k) => `<kbd>${escapeHtml(k)}</kbd>`)
        .join('<span class="shortcut-help-key-sep"> / </span>');
      return `
        <li class="shortcut-help-item">
          <span class="shortcut-help-keys">${keys}</span>
          <span class="shortcut-help-desc">${escapeHtml(s.description)}</span>
        </li>
      `;
    }).join('');

    overlay.innerHTML = `
      <div class="shortcut-help-dialog">
        <header class="shortcut-help-header">
          <h2 id="shortcut-help-title" class="shortcut-help-title">⌨️ キーボードショートカット</h2>
          <button type="button" class="shortcut-help-close" aria-label="閉じる">×</button>
        </header>
        <ul class="shortcut-help-list">
          ${rows}
        </ul>
      </div>
    `;
    return overlay;
  }

  private attachHandlers(): void {
    if (!this.dialogElement) return;

    const closeBtn = this.dialogElement.querySelector<HTMLButtonElement>(
      '.shortcut-help-close'
    );
    closeBtn?.addEventListener('click', () => this.close());

    // 背景クリックで閉じる
    this.dialogElement.addEventListener('click', (e) => {
      if (e.target === this.dialogElement) {
        this.close();
      }
    });

    // Esc で閉じる
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    document.addEventListener('keydown', this.keydownHandler, true);
  }
}
