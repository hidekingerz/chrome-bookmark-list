import { dispatchBookmarksChanged } from '../../scripts/bookmarkEvents.js';
import { escapeHtml } from '../../scripts/utils.js';
import { resolveBookmarkNode } from '../../utils/bookmarkResolver.js';
import { alertDialog, confirmDialog } from '../Dialog/index.js';
import { UndoManager } from '../UndoManager/index.js';

/**
 * ブックマーク削除機能を担当するクラス
 */
export class BookmarkDeleter {
  /**
   * ブックマーク削除の処理を行う
   */
  async handleBookmarkDelete(deleteBtn: HTMLElement): Promise<void> {
    const url = deleteBtn.getAttribute('data-bookmark-url');
    const title = deleteBtn.getAttribute('data-bookmark-title');
    const bookmarkId = deleteBtn.getAttribute('data-bookmark-id');

    if (!url || !title) {
      console.error('❌ ブックマークのURLまたはタイトルが取得できませんでした');
      return;
    }

    // 削除確認ダイアログを表示
    const confirmed = await this.showDeleteConfirmation(title);

    if (!confirmed) {
      return;
    }

    try {
      // Undo に必要な情報を削除前に取得。data-bookmark-id で一意に同定し、
      // 同一 URL が複数フォルダにある場合の誤削除を防ぐ (#97)。
      const target = await resolveBookmarkNode(bookmarkId, url);
      if (!target) {
        throw new Error('削除対象のブックマークが見つかりませんでした');
      }
      const restoreInfo = {
        parentId: target.parentId,
        index: target.index,
        title: target.title,
        url: target.url,
      };

      // Chrome APIを使用してブックマークを削除
      await chrome.bookmarks.remove(target.id);

      // UI を更新するイベントを発火
      dispatchBookmarksChanged('delete');

      // Undo 可能な操作として登録
      UndoManager.getInstance().register({
        message: `「${title}」を削除しました`,
        undo: async () => {
          await chrome.bookmarks.create({
            parentId: restoreInfo.parentId,
            index: restoreInfo.index,
            title: restoreInfo.title,
            url: restoreInfo.url,
          });
          dispatchBookmarksChanged('undo-delete');
        },
      });
    } catch (error) {
      console.error('❌ ブックマークの削除に失敗しました:', error);
      this.showErrorDialog('ブックマークの削除に失敗しました。');
    }
  }

  /**
   * 削除確認ダイアログを表示する
   */
  private showDeleteConfirmation(title: string): Promise<boolean> {
    return confirmDialog({
      id: 'delete-dialog',
      title: 'ブックマークを削除',
      bodyHtml: `
            <div class="delete-confirmation-message">
              <p>以下のブックマークを削除しますか？</p>
              <div class="delete-bookmark-info">
                <strong>${escapeHtml(title)}</strong>
              </div>
              <p class="delete-warning">この操作は取り消せません。</p>
            </div>
      `,
      confirmLabel: '削除',
      confirmClassName: 'delete-dialog-confirm',
    });
  }

  /**
   * エラーダイアログを表示する
   */
  private showErrorDialog(message: string): Promise<void> {
    return alertDialog({
      id: 'error-dialog',
      title: 'エラー',
      bodyHtml: `
            <div class="error-message">
              <p>❌ ${escapeHtml(message)}</p>
            </div>
      `,
    });
  }
}
