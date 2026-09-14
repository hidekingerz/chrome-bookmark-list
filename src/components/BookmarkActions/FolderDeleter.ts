import { dispatchBookmarksChanged } from '../../scripts/bookmarkEvents.js';
import { escapeHtml } from '../../scripts/utils.js';
import type { ChromeBookmarkNode } from '../../types/bookmark.js';
import { confirmDialog } from '../Dialog/index.js';
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
      dispatchBookmarksChanged('folder-delete');

      // Undo: サブツリーを再帰的に再作成
      if (parentId) {
        UndoManager.getInstance().register({
          message: `フォルダ「${subtree.title}」を削除しました`,
          undo: async () => {
            await this.restoreSubtree(snapshot, parentId, originalIndex);
            dispatchBookmarksChanged('undo-folder-delete');
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

  private showConfirmation(
    title: string,
    bookmarkCount: number,
    folderCount: number
  ): Promise<boolean> {
    const contentWarning =
      bookmarkCount > 0 || folderCount > 0
        ? `<p class="delete-warning">中の ${bookmarkCount}件のブックマーク${
            folderCount > 0 ? ` と ${folderCount}件のサブフォルダ` : ''
          } も削除されます。</p>`
        : '';

    return confirmDialog({
      id: 'folder-delete-dialog',
      title: 'フォルダを削除',
      bodyHtml: `
            <div class="delete-confirmation-message">
              <p>以下のフォルダを削除しますか？</p>
              <div class="delete-bookmark-info">
                <strong>${escapeHtml(title)}</strong>
              </div>
              ${contentWarning}
            </div>
      `,
      confirmLabel: '削除',
      confirmClassName: 'delete-dialog-confirm folder-delete-confirm',
    });
  }
}

interface SnapshotNode {
  title: string;
  url?: string;
  children?: SnapshotNode[];
}
