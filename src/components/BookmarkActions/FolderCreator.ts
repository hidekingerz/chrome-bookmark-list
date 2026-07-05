import { escapeHtml } from '../../scripts/utils.js';
import type { ChromeBookmarkNode } from '../../types/bookmark.js';
import { UndoManager } from '../UndoManager/index.js';

/**
 * フォルダの新規作成機能。
 * 親フォルダ選択 + 名前入力のダイアログを表示し、Chrome API でフォルダを作成する。
 */
export class FolderCreator {
  // ESC 用 keydown ハンドラ。closeDialog で確実に解除するため参照を保持する
  // (#100: ボタンで閉じた場合に document へ残留するリークを防ぐ)。
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * フォルダ作成ダイアログを開く。
   *
   * @param defaultParentId 既定で選択する親フォルダのID
   */
  async openCreateDialog(defaultParentId?: string): Promise<void> {
    try {
      const folders = await this.getAllFolders();
      this.showDialog(folders, defaultParentId);
    } catch (error) {
      console.error('❌ フォルダ作成ダイアログの表示に失敗:', error);
    }
  }

  private async getAllFolders(): Promise<ChromeBookmarkNode[]> {
    const tree = await chrome.bookmarks.getTree();
    const folders: ChromeBookmarkNode[] = [];
    const collect = (nodes: ChromeBookmarkNode[]) => {
      for (const node of nodes) {
        if (node.children && !node.url) {
          // id='0' はツリーの仮想ルートで、ここを親に指定した chrome.bookmarks.create
          // は失敗するため候補から除外する
          if (node.id !== '0') {
            folders.push(node);
          }
          collect(node.children);
        }
      }
    };
    collect(tree);
    return folders;
  }

  private showDialog(
    folders: ChromeBookmarkNode[],
    defaultParentId?: string
  ): void {
    const existing = document.getElementById('folder-create-dialog');
    existing?.remove();

    document.body.insertAdjacentHTML(
      'beforeend',
      this.createDialogHTML(folders, defaultParentId)
    );

    this.setupDialogEvents();
    const nameInput = document.getElementById(
      'folder-create-name'
    ) as HTMLInputElement | null;
    nameInput?.focus();
  }

  private createDialogHTML(
    folders: ChromeBookmarkNode[],
    defaultParentId?: string
  ): string {
    // ルートフォルダ（id=0 など）は表示用に明示的にラベルを付与する
    const folderOptions = folders
      .map((folder) => {
        const selected = folder.id === defaultParentId ? 'selected' : '';
        const label = folder.title || `(ルート: ${folder.id})`;
        return `<option value="${escapeHtml(folder.id)}" ${selected}>${escapeHtml(label)}</option>`;
      })
      .join('');

    return `
      <div id="folder-create-dialog" class="edit-dialog-overlay">
        <div class="edit-dialog" role="dialog" aria-modal="true">
          <div class="edit-dialog-header">
            <h3>新しいフォルダを作成</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">
            <div class="edit-form-group">
              <label for="folder-create-name">フォルダ名:</label>
              <input type="text" id="folder-create-name" placeholder="新しいフォルダ" />
            </div>
            <div class="edit-form-group">
              <label for="folder-create-parent">親フォルダ:</label>
              <select id="folder-create-parent">
                ${folderOptions}
              </select>
            </div>
            <div class="folder-create-error" style="display:none; color: var(--danger); margin-top: 8px;"></div>
          </div>
          <div class="edit-dialog-actions">
            <button type="button" class="edit-dialog-cancel">キャンセル</button>
            <button type="button" class="edit-dialog-save folder-create-confirm">作成</button>
          </div>
        </div>
      </div>
    `;
  }

  private setupDialogEvents(): void {
    const dialog = document.getElementById('folder-create-dialog');
    const closeBtn = dialog?.querySelector('.edit-dialog-close');
    const cancelBtn = dialog?.querySelector('.edit-dialog-cancel');
    const confirmBtn = dialog?.querySelector('.folder-create-confirm');
    const nameInput = document.getElementById(
      'folder-create-name'
    ) as HTMLInputElement | null;

    closeBtn?.addEventListener('click', () => this.closeDialog());
    cancelBtn?.addEventListener('click', () => this.closeDialog());
    confirmBtn?.addEventListener('click', () => {
      void this.handleConfirm();
    });

    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm();
      }
    });

    // ESCキーで閉じる。解除は closeDialog に集約し、どの経路で閉じても外れるようにする
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeDialog();
      }
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  private async handleConfirm(): Promise<void> {
    const nameInput = document.getElementById(
      'folder-create-name'
    ) as HTMLInputElement | null;
    const parentSelect = document.getElementById(
      'folder-create-parent'
    ) as HTMLSelectElement | null;
    const errorEl = document.querySelector(
      '.folder-create-error'
    ) as HTMLElement | null;
    if (!nameInput || !parentSelect) return;

    const title = nameInput.value.trim();
    const parentId = parentSelect.value;

    if (!title) {
      nameInput.focus();
      return;
    }

    try {
      const created = await chrome.bookmarks.create({ parentId, title });

      this.closeDialog();
      this.dispatchBookmarksChanged('folder-create');

      // Undo: 作成したフォルダを削除
      if (created.id) {
        UndoManager.getInstance().register({
          message: `フォルダ「${title}」を作成しました`,
          undo: async () => {
            await chrome.bookmarks.removeTree(created.id);
            this.dispatchBookmarksChanged('undo-folder-create');
          },
        });
      }
    } catch (error) {
      // 失敗はダイアログ内で通知し、ユーザーが再試行できるようにする
      // (FolderRenamer のダイアログ内エラー表示に揃える。console のみで握りつぶさない)
      console.error('❌ フォルダの作成に失敗しました:', error);
      this.showError(errorEl, 'フォルダの作成に失敗しました。');
    }
  }

  private showError(el: HTMLElement | null, message: string): void {
    if (!el) return;
    el.textContent = message;
    el.style.display = 'block';
  }

  private dispatchBookmarksChanged(action: string): void {
    const event = new CustomEvent('bookmarks-changed', { detail: { action } });
    document.dispatchEvent(event);
  }

  private closeDialog(): void {
    if (this.keydownHandler) {
      document.removeEventListener('keydown', this.keydownHandler);
      this.keydownHandler = null;
    }
    document.getElementById('folder-create-dialog')?.remove();
  }
}
