import { dispatchBookmarksChanged } from '../../scripts/bookmarkEvents.js';
import { escapeHtml } from '../../scripts/utils.js';
import type { ChromeBookmarkNode } from '../../types/bookmark.js';
import {
  type DialogHandle,
  openDialog,
  showDialogError,
} from '../Dialog/index.js';
import { UndoManager } from '../UndoManager/index.js';

/**
 * フォルダのリネーム機能。
 * 名前入力ダイアログを表示し、Chrome API でフォルダ名を更新する。
 */
export class FolderRenamer {
  private dialog: DialogHandle | null = null;

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
    this.dialog = openDialog({
      id: 'folder-rename-dialog',
      title: 'フォルダ名を変更',
      bodyHtml: `
            <div class="edit-form-group">
              <label for="folder-rename-name">新しいフォルダ名:</label>
              <input type="text" id="folder-rename-name" value="${escapeHtml(target.title)}" />
            </div>
            <div class="dialog-error folder-rename-error" style="display:none; color: var(--danger); margin-top: 8px;"></div>
      `,
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
        {
          label: '保存',
          className: 'edit-dialog-save folder-rename-confirm',
          onClick: () => {
            void this.handleConfirm(target, siblings);
          },
        },
      ],
      onClose: () => {
        this.dialog = null;
      },
    });

    const input = this.dialog.element.querySelector<HTMLInputElement>(
      '#folder-rename-name'
    );
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void this.handleConfirm(target, siblings);
      }
    });
    input?.focus();
    input?.select();
  }

  private async handleConfirm(
    target: ChromeBookmarkNode,
    siblings: ChromeBookmarkNode[]
  ): Promise<void> {
    const input = document.getElementById(
      'folder-rename-name'
    ) as HTMLInputElement | null;
    if (!input) return;

    const newTitle = input.value.trim();

    if (!newTitle) {
      showDialogError(this.dialog, 'フォルダ名を入力してください。');
      return;
    }
    if (newTitle === target.title) {
      this.dialog?.close();
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
      showDialogError(this.dialog, '同じ名前のフォルダが既に存在します。');
      return;
    }

    const oldTitle = target.title;
    try {
      await chrome.bookmarks.update(target.id, { title: newTitle });
      this.dialog?.close();
      dispatchBookmarksChanged('folder-rename');

      UndoManager.getInstance().register({
        message: `フォルダ名を「${newTitle}」に変更しました`,
        undo: async () => {
          await chrome.bookmarks.update(target.id, { title: oldTitle });
          dispatchBookmarksChanged('undo-folder-rename');
        },
      });
    } catch (error) {
      console.error('❌ フォルダ名の変更に失敗しました:', error);
      showDialogError(this.dialog, 'フォルダ名の変更に失敗しました。');
    }
  }
}
