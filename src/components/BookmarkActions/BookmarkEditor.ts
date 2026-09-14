import { dispatchBookmarksChanged } from '../../scripts/bookmarkEvents.js';
import { escapeHtml, getAllFolders } from '../../scripts/utils.js';
import type {
  BookmarkMoveData,
  BookmarkUpdateData,
  ChromeBookmarkNode,
} from '../../types/bookmark.js';
import { resolveBookmarkNode } from '../../utils/bookmarkResolver.js';
import { type DialogHandle, openDialog } from '../Dialog/index.js';
import { UndoManager } from '../UndoManager/index.js';

/**
 * ブックマーク編集機能を担当するクラス
 */
export class BookmarkEditor {
  private dialog: DialogHandle | null = null;

  /**
   * ブックマーク編集の処理を行う
   */
  async handleBookmarkEdit(editBtn: HTMLElement): Promise<void> {
    const url = editBtn.getAttribute('data-bookmark-url');
    const currentTitle = editBtn.getAttribute('data-bookmark-title');
    const bookmarkId = editBtn.getAttribute('data-bookmark-id');

    if (!url || !currentTitle) {
      console.error('❌ ブックマークのURLまたはタイトルが取得できませんでした');
      return;
    }

    try {
      // data-bookmark-id で一意に同定し、同一 URL が複数ある場合に別ノードを
      // 編集してしまう問題を防ぐ (#97)。
      const bookmark = (await resolveBookmarkNode(
        bookmarkId,
        url
      )) as ChromeBookmarkNode | null;

      if (!bookmark) {
        console.error('❌ 編集対象のブックマークが見つかりませんでした');
        return;
      }

      // すべてのフォルダーを取得
      const allFolders = await getAllFolders();

      // 編集ダイアログを表示
      this.showEditDialog(bookmark, allFolders);
    } catch (error) {
      console.error('❌ ブックマークの編集準備に失敗しました:', error);
      alert('ブックマークの編集準備に失敗しました。');
    }
  }

  /**
   * 編集ダイアログを表示する
   */
  private showEditDialog(
    bookmark: ChromeBookmarkNode,
    folders: ChromeBookmarkNode[]
  ): void {
    const folderOptions = folders
      .map(
        (folder) => `
        <option value="${escapeHtml(folder.id)}" ${folder.id === bookmark.parentId ? 'selected' : ''}>
          ${escapeHtml(folder.title)}
        </option>
      `
      )
      .join('');

    this.dialog = openDialog({
      id: 'edit-dialog',
      title: 'ブックマークを編集',
      bodyHtml: `
            <div class="edit-form-group">
              <label for="edit-title">名前:</label>
              <input type="text" id="edit-title" value="${escapeHtml(bookmark.title)}" />
            </div>
            <div class="edit-form-group">
              <label for="edit-url">URL:</label>
              <input type="url" id="edit-url" value="${escapeHtml(bookmark.url || '')}" />
            </div>
            <div class="edit-form-group">
              <label for="edit-folder">フォルダー:</label>
              <select id="edit-folder">
                ${folderOptions}
              </select>
            </div>
      `,
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
        {
          label: '保存',
          className: 'edit-dialog-save',
          onClick: () => {
            void this.handleSave(bookmark);
          },
        },
      ],
      onClose: () => {
        this.dialog = null;
      },
    });

    // 開いた直後にタイトル入力欄へフォーカス (a11y)
    const titleInput =
      this.dialog.element.querySelector<HTMLInputElement>('#edit-title');
    titleInput?.focus();
    titleInput?.select();
  }

  /**
   * 保存処理を実行する
   */
  private async handleSave(bookmark: ChromeBookmarkNode): Promise<void> {
    const titleInput = document.getElementById(
      'edit-title'
    ) as HTMLInputElement;
    const urlInput = document.getElementById('edit-url') as HTMLInputElement;
    const folderSelect = document.getElementById(
      'edit-folder'
    ) as HTMLSelectElement;

    if (!titleInput || !urlInput || !folderSelect) {
      return;
    }

    const newTitle = titleInput.value.trim();
    const newUrl = urlInput.value.trim();
    const newParentId = folderSelect.value;

    if (!newTitle || !newUrl) {
      alert('名前とURLは必須です。');
      return;
    }

    // Undo 用に元の値を保持
    const original = {
      title: bookmark.title,
      url: bookmark.url ?? '',
      parentId: bookmark.parentId,
      index: bookmark.index,
    };
    const titleChanged = newTitle !== original.title;
    const urlChanged = newUrl !== original.url;
    const moved =
      original.parentId !== undefined && newParentId !== original.parentId;

    try {
      // ブックマークを更新
      if (titleChanged || urlChanged) {
        await this.updateBookmark(bookmark.id, {
          title: newTitle,
          url: newUrl,
        });
      }

      // フォルダーが変更された場合は移動
      if (moved) {
        await this.moveBookmark(bookmark.id, { parentId: newParentId });
      }

      this.dialog?.close();
      dispatchBookmarksChanged('edit');

      // 何か変更があれば Undo を登録
      if (titleChanged || urlChanged || moved) {
        UndoManager.getInstance().register({
          message: `「${newTitle}」を編集しました`,
          undo: async () => {
            if (titleChanged || urlChanged) {
              await chrome.bookmarks.update(bookmark.id, {
                title: original.title,
                url: original.url,
              });
            }
            if (moved && original.parentId !== undefined) {
              await chrome.bookmarks.move(bookmark.id, {
                parentId: original.parentId,
                index: original.index,
              });
            }
            dispatchBookmarksChanged('undo-edit');
          },
        });
      }
    } catch (error) {
      console.error('❌ ブックマークの更新に失敗しました:', error);
      alert('ブックマークの更新に失敗しました。');
    }
  }

  /**
   * ブックマークを更新する
   */
  private async updateBookmark(
    bookmarkId: string,
    data: BookmarkUpdateData
  ): Promise<void> {
    await chrome.bookmarks.update(bookmarkId, data);
  }

  /**
   * ブックマークを移動する
   */
  private async moveBookmark(
    bookmarkId: string,
    data: BookmarkMoveData
  ): Promise<void> {
    await chrome.bookmarks.move(bookmarkId, data);
  }
}
