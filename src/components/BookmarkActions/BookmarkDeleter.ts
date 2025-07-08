import { escapeHtml } from '../../scripts/utils.js';

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
      // Chrome APIを使用してブックマークを削除
      await this.deleteBookmarkByUrl(url);

      // 削除後、ページを再読み込みして表示を更新
      window.location.reload();
    } catch (error) {
      console.error('❌ ブックマークの削除に失敗しました:', error);
      this.showErrorDialog('ブックマークの削除に失敗しました。');
    }
  }

  /**
   * 削除確認ダイアログを表示する
   */
  private async showDeleteConfirmation(title: string): Promise<boolean> {
    return new Promise((resolve) => {
      // 既存のダイアログがあれば削除
      const existingDialog = document.getElementById('delete-dialog');
      if (existingDialog) {
        existingDialog.remove();
      }

      // ダイアログのHTML作成
      const dialogHTML = this.createDeleteDialogHTML(title);

      // ダイアログをDOMに追加
      document.body.insertAdjacentHTML('beforeend', dialogHTML);

      // イベントリスナーを設定
      this.setupDeleteDialogEvents(resolve);
    });
  }

  /**
   * 削除確認ダイアログのHTMLを生成する
   */
  private createDeleteDialogHTML(title: string): string {
    return `
      <div id="delete-dialog" class="edit-dialog-overlay">
        <div class="edit-dialog">
          <div class="edit-dialog-header">
            <h3>ブックマークを削除</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">
            <div class="delete-confirmation-message">
              <p>以下のブックマークを削除しますか？</p>
              <div class="delete-bookmark-info">
                <strong>${escapeHtml(title)}</strong>
              </div>
              <p class="delete-warning">この操作は取り消せません。</p>
            </div>
          </div>
          <div class="edit-dialog-actions">
            <button type="button" class="edit-dialog-cancel">キャンセル</button>
            <button type="button" class="delete-dialog-confirm">削除</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 削除確認ダイアログのイベントを設定する
   */
  private setupDeleteDialogEvents(resolve: (value: boolean) => void): void {
    const dialog = document.getElementById('delete-dialog');
    const closeBtn = dialog?.querySelector('.edit-dialog-close');
    const cancelBtn = dialog?.querySelector('.edit-dialog-cancel');
    const confirmBtn = dialog?.querySelector('.delete-dialog-confirm');

    const closeDialog = (confirmed: boolean) => {
      dialog?.remove();
      resolve(confirmed);
    };

    // 閉じるボタン・キャンセルボタン
    closeBtn?.addEventListener('click', () => closeDialog(false));
    cancelBtn?.addEventListener('click', () => closeDialog(false));

    // 削除確認ボタン
    confirmBtn?.addEventListener('click', () => closeDialog(true));

    // ESCキーで閉じる
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDialog(false);
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }

  /**
   * エラーダイアログを表示する
   */
  private async showErrorDialog(message: string): Promise<void> {
    return new Promise((resolve) => {
      // 既存のダイアログがあれば削除
      const existingDialog = document.getElementById('error-dialog');
      if (existingDialog) {
        existingDialog.remove();
      }

      // ダイアログのHTML作成
      const dialogHTML = this.createErrorDialogHTML(message);

      // ダイアログをDOMに追加
      document.body.insertAdjacentHTML('beforeend', dialogHTML);

      // イベントリスナーを設定
      this.setupErrorDialogEvents(resolve);
    });
  }

  /**
   * エラーダイアログのHTMLを生成する
   */
  private createErrorDialogHTML(message: string): string {
    return `
      <div id="error-dialog" class="edit-dialog-overlay">
        <div class="edit-dialog">
          <div class="edit-dialog-header">
            <h3>エラー</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">
            <div class="error-message">
              <p>❌ ${escapeHtml(message)}</p>
            </div>
          </div>
          <div class="edit-dialog-actions">
            <button type="button" class="edit-dialog-cancel">OK</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * エラーダイアログのイベントを設定する
   */
  private setupErrorDialogEvents(resolve: () => void): void {
    const dialog = document.getElementById('error-dialog');
    const closeBtn = dialog?.querySelector('.edit-dialog-close');
    const okBtn = dialog?.querySelector('.edit-dialog-cancel');

    const closeDialog = () => {
      dialog?.remove();
      resolve();
    };

    // 閉じるボタン・OKボタン
    closeBtn?.addEventListener('click', closeDialog);
    okBtn?.addEventListener('click', closeDialog);

    // ESCキーで閉じる
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDialog();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
  }

  /**
   * URLを指定してブックマークを削除する
   */
  private async deleteBookmarkByUrl(url: string): Promise<void> {
    const bookmarks = await chrome.bookmarks.search({ url: url });

    if (bookmarks.length === 0) {
      throw new Error('削除対象のブックマークが見つかりませんでした');
    }

    // 最初に見つかったブックマークを削除
    await chrome.bookmarks.remove(bookmarks[0].id);
  }
}
