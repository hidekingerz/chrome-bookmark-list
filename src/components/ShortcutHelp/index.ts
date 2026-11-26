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
 * ? キーで開かれる。ネイティブの <dialog> をモーダルで開き、
 * Esc・外側のクリック（closedby="any"）はブラウザに任せる。閉じるボタンでも閉じる。
 */
export class ShortcutHelp {
  private dialogElement: HTMLDialogElement | null = null;

  /**
   * ダイアログを開く。すでに開いていれば何もしない。
   */
  open(): void {
    if (this.dialogElement) return;
    const dialog = this.render();
    this.dialogElement = dialog;
    document.body.appendChild(dialog);
    this.attachHandlers(dialog);
    dialog.showModal();

    // 閉じるボタンにフォーカス
    dialog.querySelector<HTMLButtonElement>('.shortcut-help-close')?.focus();
  }

  /**
   * ダイアログを閉じる。
   */
  close(): void {
    // 後始末は close イベント（handleClosed）で行う
    this.dialogElement?.close();
  }

  /**
   * ダイアログが開いているかどうか。
   */
  isOpen(): boolean {
    return this.dialogElement !== null;
  }

  private handleClosed(dialog: HTMLDialogElement): void {
    dialog.remove();
    if (this.dialogElement === dialog) {
      this.dialogElement = null;
    }
  }

  private render(): HTMLDialogElement {
    const dialog = document.createElement('dialog');
    dialog.id = DIALOG_ID;
    dialog.className = 'shortcut-help-dialog';
    dialog.setAttribute('aria-labelledby', 'shortcut-help-title');
    dialog.setAttribute('closedby', 'any');

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

    dialog.innerHTML = `
      <div class="shortcut-help-header">
        <h2 id="shortcut-help-title" class="shortcut-help-title">⌨️ キーボードショートカット</h2>
        <button type="button" class="shortcut-help-close" aria-label="閉じる">×</button>
      </div>
      <ul class="shortcut-help-list">
        ${rows}
      </ul>
    `;
    return dialog;
  }

  private attachHandlers(dialog: HTMLDialogElement): void {
    dialog
      .querySelector<HTMLButtonElement>('.shortcut-help-close')
      ?.addEventListener('click', () => this.close());

    // Esc・外側のクリック・閉じるボタンのどれで閉じても、ここで片付ける
    dialog.addEventListener('close', () => this.handleClosed(dialog));

    // ダイアログの中で押した Esc を、背後の一覧（選択の解除など）に届かせない。
    // 閉じる動作はブラウザの既定の動作なので、preventDefault はしない
    dialog.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
      }
    });
  }
}
