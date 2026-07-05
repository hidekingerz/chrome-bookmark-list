import { escapeHtml } from '../../scripts/utils.js';
import type { ChromeBookmarkNode } from '../../types/bookmark.js';
import { Toast } from '../Toast/index.js';
import { UndoManager } from '../UndoManager/index.js';

/**
 * フォルダの削除機能。
 * サブツリー全体を保持してから removeTree し、Undo では再帰的に再作成する。
 */
export class FolderDeleter {
  /**
   * 削除確認ダイアログを開く。
   */
  async openDeleteDialog(folderId: string): Promise<void> {
    try {
      const [subtree] = await chrome.bookmarks.getSubTree(folderId);
      if (!subtree) {
        console.error('❌ 削除対象のフォルダが見つかりません:', folderId);
        return;
      }
      const counts = this.countContents(subtree);
      const confirmed = await this.showConfirmation(
        subtree.title,
        counts.bookmarks,
        counts.folders
      );
      if (!confirmed) return;

      // 削除前にサブツリーを保持
      const snapshot = this.snapshot(subtree);
      const parentId = subtree.parentId;
      const originalIndex = subtree.index;

      await chrome.bookmarks.removeTree(subtree.id);
      this.dispatchBookmarksChanged('folder-delete');

      // Undo: サブツリーを再帰的に再作成
      if (parentId) {
        UndoManager.getInstance().register({
          message: `フォルダ「${subtree.title}」を削除しました`,
          undo: async () => {
            await this.restoreSubtree(snapshot, parentId, originalIndex);
            this.dispatchBookmarksChanged('undo-folder-delete');
          },
        });
      }
    } catch (error) {
      // 確認ダイアログは削除実行前に閉じているため、失敗は Toast で通知する
      // (console のみで握りつぶさない)
      console.error('❌ フォルダの削除に失敗しました:', error);
      Toast.show({ message: 'フォルダの削除に失敗しました。' });
    }
  }

  /**
   * フォルダ内のブックマーク数とサブフォルダ数を再帰的にカウントする。
   */
  private countContents(node: ChromeBookmarkNode): {
    bookmarks: number;
    folders: number;
  } {
    let bookmarks = 0;
    let folders = 0;
    const walk = (n: ChromeBookmarkNode) => {
      if (!n.children) return;
      for (const child of n.children) {
        if (child.url) {
          bookmarks++;
        } else if (child.children) {
          folders++;
          walk(child);
        }
      }
    };
    walk(node);
    return { bookmarks, folders };
  }

  /**
   * サブツリーを Undo 用にスナップショット化する。
   * （ID は復元時に変わるため除外）
   */
  private snapshot(node: ChromeBookmarkNode): SnapshotNode {
    return {
      title: node.title,
      url: node.url,
      children: node.children?.map((c) => this.snapshot(c)),
    };
  }

  /**
   * スナップショットから再帰的にツリーを再作成する。
   */
  private async restoreSubtree(
    node: SnapshotNode,
    parentId: string,
    index?: number
  ): Promise<void> {
    const created = await chrome.bookmarks.create({
      parentId,
      index,
      title: node.title,
      url: node.url,
    });
    if (node.children && created.id) {
      for (const child of node.children) {
        await this.restoreSubtree(child, created.id);
      }
    }
  }

  private async showConfirmation(
    title: string,
    bookmarkCount: number,
    folderCount: number
  ): Promise<boolean> {
    return new Promise((resolve) => {
      document.getElementById('folder-delete-dialog')?.remove();
      document.body.insertAdjacentHTML(
        'beforeend',
        this.createDialogHTML(title, bookmarkCount, folderCount)
      );
      this.setupDialogEvents(resolve);
    });
  }

  private createDialogHTML(
    title: string,
    bookmarkCount: number,
    folderCount: number
  ): string {
    const contentWarning =
      bookmarkCount > 0 || folderCount > 0
        ? `<p class="delete-warning">中の ${bookmarkCount}件のブックマーク${
            folderCount > 0 ? ` と ${folderCount}件のサブフォルダ` : ''
          } も削除されます。</p>`
        : '';

    return `
      <div id="folder-delete-dialog" class="edit-dialog-overlay">
        <div class="edit-dialog" role="dialog" aria-modal="true">
          <div class="edit-dialog-header">
            <h3>フォルダを削除</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">
            <div class="delete-confirmation-message">
              <p>以下のフォルダを削除しますか？</p>
              <div class="delete-bookmark-info">
                <strong>${escapeHtml(title)}</strong>
              </div>
              ${contentWarning}
            </div>
          </div>
          <div class="edit-dialog-actions">
            <button type="button" class="edit-dialog-cancel">キャンセル</button>
            <button type="button" class="delete-dialog-confirm folder-delete-confirm">削除</button>
          </div>
        </div>
      </div>
    `;
  }

  private setupDialogEvents(resolve: (value: boolean) => void): void {
    const dialog = document.getElementById('folder-delete-dialog');
    const closeBtn = dialog?.querySelector('.edit-dialog-close');
    const cancelBtn = dialog?.querySelector('.edit-dialog-cancel');
    const confirmBtn = dialog?.querySelector('.folder-delete-confirm');

    const close = (confirmed: boolean) => {
      // どの経路で閉じても ESC 用リスナーを確実に解除する (#100 リーク防止)
      document.removeEventListener('keydown', keydownHandler);
      dialog?.remove();
      resolve(confirmed);
    };

    closeBtn?.addEventListener('click', () => close(false));
    cancelBtn?.addEventListener('click', () => close(false));
    confirmBtn?.addEventListener('click', () => close(true));

    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close(false);
      }
    };
    document.addEventListener('keydown', keydownHandler);

    // 開いた直後にキャンセルへフォーカス (誤操作防止 + a11y)
    (cancelBtn as HTMLElement | null)?.focus();
  }

  private dispatchBookmarksChanged(action: string): void {
    const event = new CustomEvent('bookmarks-changed', { detail: { action } });
    document.dispatchEvent(event);
  }
}

interface SnapshotNode {
  title: string;
  url?: string;
  children?: SnapshotNode[];
}
