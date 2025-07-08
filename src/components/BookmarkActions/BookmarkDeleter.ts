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
    const confirmed = this.showDeleteConfirmation(title);

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
      alert('ブックマークの削除に失敗しました。');
    }
  }

  /**
   * 削除確認ダイアログを表示する
   */
  private showDeleteConfirmation(title: string): boolean {
    return confirm(`ブックマーク「${title}」を削除しますか？`);
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
