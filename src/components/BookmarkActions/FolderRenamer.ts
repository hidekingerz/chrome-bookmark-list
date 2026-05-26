import { escapeHtml } from '../../scripts/utils.js';
import type { ChromeBookmarkNode } from '../../types/bookmark.js';
import { UndoManager } from '../UndoManager/index.js';

/**
 * フォルダのリネーム機能。
 * 名前入力ダイアログを表示し、Chrome API でフォルダ名を更新する。
 */
export class FolderRenamer {
  /**
   * リネームダイアログを開く。
   */
  async openRenameDialog(folderId: string): Promise<void> {
    try {
      const [target] = await chrome.bookmarks.get(folderId);
      if (!target) {
        console.error('❌ リネーム対象のフォルダが見つかりません:', folderId);
        return;
      }
      // 親フォルダの兄弟を取得して同名チェックに使う
      const siblings = target.parentId
        ? await chrome.bookmarks.getChildren(target.parentId)
        : [];
      this.showDialog(target, siblings);
    } catch (error) {
      console.error('❌ リネームダイアログの表示に失敗:', error);
    }
  }

  private showDialog(
    target: ChromeBookmarkNode,
    siblings: ChromeBookmarkNode[]
  ): void {
    document.getElementById('folder-rename-dialog')?.remove();
    document.body.insertAdjacentHTML(
      'beforeend',
      this.createDialogHTML(target)
    );
    this.setupDialogEvents(target, siblings);

    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement | null;
    input?.focus();
    input?.select();
  }

  private createDialogHTML(target: ChromeBookmarkNode): string {
    return `
      <div id="folder-rename-dialog" class="edit-dialog-overlay">
        <div class="edit-dialog">
          <div class="edit-dialog-header">
            <h3>フォルダ名を変更</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">
            <div class="edit-form-group">
              <label for="folder-rename-name">新しいフォルダ名:</label>
              <input type="text" id="folder-rename-name" value="${escapeHtml(target.title)}" />
            </div>
            <div class="folder-rename-error" style="display:none; color: var(--danger); margin-top: 8px;"></div>
          </div>
          <div class="edit-dialog-actions">
            <button type="button" class="edit-dialog-cancel">キャンセル</button>
            <button type="button" class="edit-dialog-save folder-rename-confirm">保存</button>
          </div>
        </div>
      </div>
    `;
  }

  private setupDialogEvents(
    target: ChromeBookmarkNode,
    siblings: ChromeBookmarkNode[]
  ): void {
    const dialog = document.getElementById('folder-rename-dialog');
    const closeBtn = dialog?.querySelector('.edit-dialog-close');
    const cancelBtn = dialog?.querySelector('.edit-dialog-cancel');
    const confirmBtn = dialog?.querySelector('.folder-rename-confirm');
    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement | null;

    closeBtn?.addEventListener('click', () => this.closeDialog());
    cancelBtn?.addEventListener('click', () => this.closeDialog());
    confirmBtn?.addEventListener('click', () => {
      void this.handleConfirm(target, siblings);
    });

    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm(target, siblings);
      }
    });

    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeDialog();
        document.removeEventListener('keydown', keydownHandler);
      }
    };
    document.addEventListener('keydown', keydownHandler);
  }

  private async handleConfirm(
    target: ChromeBookmarkNode,
    siblings: ChromeBookmarkNode[]
  ): Promise<void> {
    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement | null;
    const errorEl = document.querySelector(
      '.folder-rename-error'
    ) as HTMLElement | null;
    if (!input) return;

    const newTitle = input.value.trim();

    if (!newTitle) {
      this.showError(errorEl, 'フォルダ名を入力してください。');
      return;
    }
    if (newTitle === target.title) {
      this.closeDialog();
      return;
    }
    // 同階層の他フォルダと同名（自分自身は除く）
    const duplicate = siblings.some(
      (s) =>
        s.id !== target.id &&
        !s.url && // フォルダのみ対象
        s.title === newTitle
    );
    if (duplicate) {
      this.showError(errorEl, '同じ名前のフォルダが既に存在します。');
      return;
    }

    const oldTitle = target.title;
    try {
      await chrome.bookmarks.update(target.id, { title: newTitle });
      this.closeDialog();
      this.dispatchBookmarksChanged('folder-rename');

      UndoManager.getInstance().register({
        message: `フォルダ名を「${newTitle}」に変更しました`,
        undo: async () => {
          await chrome.bookmarks.update(target.id, { title: oldTitle });
          this.dispatchBookmarksChanged('undo-folder-rename');
        },
      });
    } catch (error) {
      console.error('❌ フォルダ名の変更に失敗しました:', error);
      this.showError(errorEl, 'フォルダ名の変更に失敗しました。');
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
    document.getElementById('folder-rename-dialog')?.remove();
  }
}
