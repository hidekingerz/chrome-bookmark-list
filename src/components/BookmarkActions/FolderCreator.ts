import { dispatchBookmarksChanged } from '../../scripts/bookmarkEvents.js';
import { escapeHtml, getAllFolders } from '../../scripts/utils.js';
import type { ChromeBookmarkNode } from '../../types/bookmark.js';
import {
  type DialogHandle,
  openDialog,
  showDialogError,
} from '../Dialog/index.js';
import { UndoManager } from '../UndoManager/index.js';

/**
 * フォルダの新規作成機能。
 * 親フォルダ選択 + 名前入力のダイアログを表示し、Chrome API でフォルダを作成する。
 */
export class FolderCreator {
  private dialog: DialogHandle | null = null;

  /**
   * フォルダ作成ダイアログを開く。
   *
   * @param defaultParentId 既定で選択する親フォルダのID
   */
  async openCreateDialog(defaultParentId?: string): Promise<void> {
    try {
      const folders = await getAllFolders();
      this.showDialog(folders, defaultParentId);
    } catch (error) {
      console.error('❌ フォルダ作成ダイアログの表示に失敗:', error);
    }
  }

  private showDialog(
    folders: ChromeBookmarkNode[],
    defaultParentId?: string
  ): void {
    // ルートフォルダ（id=0 など）は表示用に明示的にラベルを付与する
    const folderOptions = folders
      .map((folder) => {
        const selected = folder.id === defaultParentId ? 'selected' : '';
        const label = folder.title || `(ルート: ${folder.id})`;
        return `<option value="${escapeHtml(folder.id)}" ${selected}>${escapeHtml(label)}</option>`;
      })
      .join('');

    this.dialog = openDialog({
      id: 'folder-create-dialog',
      title: '新しいフォルダを作成',
      bodyHtml: `
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
            <div class="dialog-error folder-create-error" style="display:none; color: var(--danger); margin-top: 8px;"></div>
      `,
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
        {
          label: '作成',
          className: 'edit-dialog-save folder-create-confirm',
          onClick: () => {
            void this.handleConfirm();
          },
        },
      ],
      onClose: () => {
        this.dialog = null;
      },
    });

    const nameInput = this.dialog.element.querySelector<HTMLInputElement>(
      '#folder-create-name'
    );
    nameInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm();
      }
    });
    nameInput?.focus();
  }

  private async handleConfirm(): Promise<void> {
    const nameInput = document.getElementById(
      'folder-create-name'
    ) as HTMLInputElement | null;
    const parentSelect = document.getElementById(
      'folder-create-parent'
    ) as HTMLSelectElement | null;
    if (!nameInput || !parentSelect) return;

    const title = nameInput.value.trim();
    const parentId = parentSelect.value;

    if (!title) {
      nameInput.focus();
      return;
    }

    try {
      const created = await chrome.bookmarks.create({ parentId, title });

      this.dialog?.close();
      dispatchBookmarksChanged('folder-create');

      // Undo: 作成したフォルダを削除
      if (created.id) {
        UndoManager.getInstance().register({
          message: `フォルダ「${title}」を作成しました`,
          undo: async () => {
            await chrome.bookmarks.removeTree(created.id);
            dispatchBookmarksChanged('undo-folder-create');
          },
        });
      }
    } catch (error) {
      // 失敗はダイアログ内で通知し、ユーザーが再試行できるようにする
      // (FolderRenamer のダイアログ内エラー表示に揃える。console のみで握りつぶさない)
      console.error('❌ フォルダの作成に失敗しました:', error);
      showDialogError(this.dialog, 'フォルダの作成に失敗しました。');
    }
  }
}
