import type {
  BookmarkUpdateData,
  BookmarkMoveData,
  ChromeBookmarkNode,
} from '../../types/bookmark.js';
import { escapeHtml } from '../../scripts/utils.js';

/**
 * ブックマーク編集機能を担当するクラス
 */
export class BookmarkEditor {
  /**
   * ブックマーク編集の処理を行う
   */
  async handleBookmarkEdit(editBtn: HTMLElement): Promise<void> {
    const url = editBtn.getAttribute('data-bookmark-url');
    const currentTitle = editBtn.getAttribute('data-bookmark-title');

    if (!url || !currentTitle) {
      console.error('❌ ブックマークのURLまたはタイトルが取得できませんでした');
      return;
    }

    try {
      // Chrome APIを使用してブックマークを検索
      const bookmarks = await chrome.bookmarks.search({ url: url });

      if (bookmarks.length === 0) {
        console.error('❌ 編集対象のブックマークが見つかりませんでした');
        return;
      }

      const bookmark = bookmarks[0];

      // すべてのフォルダーを取得
      const allFolders = await this.getAllFolders();

      // 編集ダイアログを表示
      this.showEditDialog(bookmark, allFolders);
    } catch (error) {
      console.error('❌ ブックマークの編集準備に失敗しました:', error);
      alert('ブックマークの編集準備に失敗しました。');
    }
  }

  /**
   * すべてのフォルダーを取得する
   */
  private async getAllFolders(): Promise<ChromeBookmarkNode[]> {
    const bookmarkTree = await chrome.bookmarks.getTree();
    const folders: ChromeBookmarkNode[] = [];

    const collectFolders = (nodes: ChromeBookmarkNode[]) => {
      for (const node of nodes) {
        if (node.children && !node.url) {
          // フォルダー（URLがない）の場合
          folders.push(node);
          collectFolders(node.children);
        }
      }
    };

    collectFolders(bookmarkTree);
    return folders;
  }

  /**
   * 編集ダイアログを表示する
   */
  private showEditDialog(
    bookmark: ChromeBookmarkNode,
    folders: ChromeBookmarkNode[]
  ): void {
    // 既存のダイアログがあれば削除
    const existingDialog = document.getElementById('edit-dialog');
    if (existingDialog) {
      existingDialog.remove();
    }

    // ダイアログのHTML作成
    const dialogHTML = this.createDialogHTML(bookmark, folders);

    // ダイアログをDOMに追加
    document.body.insertAdjacentHTML('beforeend', dialogHTML);

    // イベントリスナーを設定
    this.setupEditDialogEvents(bookmark);
  }

  /**
   * ダイアログのHTMLを生成する
   */
  private createDialogHTML(
    bookmark: ChromeBookmarkNode,
    folders: ChromeBookmarkNode[]
  ): string {
    const folderOptions = folders
      .map(
        (folder) => `
        <option value="${folder.id}" ${folder.id === bookmark.parentId ? 'selected' : ''}>
          ${escapeHtml(folder.title)}
        </option>
      `
      )
      .join('');

    return `
      <div id="edit-dialog" class="edit-dialog-overlay">
        <div class="edit-dialog">
          <div class="edit-dialog-header">
            <h3>ブックマークを編集</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">
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
          </div>
          <div class="edit-dialog-actions">
            <button type="button" class="edit-dialog-cancel">キャンセル</button>
            <button type="button" class="edit-dialog-save">保存</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 編集ダイアログのイベントを設定する
   */
  private setupEditDialogEvents(bookmark: ChromeBookmarkNode): void {
    const dialog = document.getElementById('edit-dialog');
    const closeBtn = dialog?.querySelector('.edit-dialog-close');
    const cancelBtn = dialog?.querySelector('.edit-dialog-cancel');
    const saveBtn = dialog?.querySelector('.edit-dialog-save');

    // 閉じるボタン
    closeBtn?.addEventListener('click', () => this.closeEditDialog());
    cancelBtn?.addEventListener('click', () => this.closeEditDialog());

    // 保存ボタン
    saveBtn?.addEventListener('click', () => this.handleSave(bookmark));

    // ESCキーで閉じる
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeEditDialog();
        document.removeEventListener('keydown', handleKeydown);
      }
    };
    document.addEventListener('keydown', handleKeydown);
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

    try {
      // ブックマークを更新
      await this.updateBookmark(bookmark.id, { title: newTitle, url: newUrl });

      // フォルダーが変更された場合は移動
      if (newParentId !== bookmark.parentId) {
        await this.moveBookmark(bookmark.id, { parentId: newParentId });
      }

      this.closeEditDialog();

      // ページを再読み込みして表示を更新
      window.location.reload();
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

  /**
   * 編集ダイアログを閉じる
   */
  private closeEditDialog(): void {
    const dialog = document.getElementById('edit-dialog');
    if (dialog) {
      dialog.remove();
    }
  }
}
