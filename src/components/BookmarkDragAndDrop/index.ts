
/**
 * ブックマークのドラッグ&ドロップ機能を管理するクラス
 */
export class BookmarkDragAndDrop {
  private draggedBookmark: {
    url: string;
    title: string;
    originalFolderId: string;
  } | null = null;

  private dropIndicator: HTMLElement | null = null;

  /**
   * ドラッグ&ドロップ機能を初期化する
   */
  initialize(): void {
    this.createDropIndicator();
    this.setupEventListeners();
  }

  /**
   * ドロップインジケーターを作成する
   */
  private createDropIndicator(): void {
    this.dropIndicator = document.createElement('div');
    this.dropIndicator.className = 'bookmark-drop-indicator';
    this.dropIndicator.textContent = 'ここにドロップ';
    this.dropIndicator.style.display = 'none';
    document.body.appendChild(this.dropIndicator);
  }

  /**
   * イベントリスナーを設定する
   */
  private setupEventListeners(): void {
    document.addEventListener('dragstart', this.handleDragStart.bind(this));
    document.addEventListener('dragend', this.handleDragEnd.bind(this));
    document.addEventListener('dragover', this.handleDragOver.bind(this));
    document.addEventListener('dragleave', this.handleDragLeave.bind(this));
    document.addEventListener('drop', this.handleDrop.bind(this));
  }

  /**
   * ドラッグ開始時の処理
   */
  private handleDragStart(event: DragEvent): void {
    const target = event.target as HTMLElement;
    const bookmarkLink = target.closest('.bookmark-link') as HTMLElement;
    
    if (!bookmarkLink) return;

    const url = bookmarkLink.dataset.url;
    const title = bookmarkLink.querySelector('.bookmark-title')?.textContent;
    const folderElement = bookmarkLink.closest('.bookmark-folder') as HTMLElement;
    const folderId = folderElement?.dataset.folderId;

    if (!url || !title || !folderId) return;

    this.draggedBookmark = {
      url,
      title,
      originalFolderId: folderId
    };

    // ドラッグデータを設定
    event.dataTransfer?.setData('text/plain', url);
    event.dataTransfer?.setData('application/x-bookmark-url', url);
    event.dataTransfer?.setData('application/x-bookmark-title', title);
    event.dataTransfer?.setData('application/x-bookmark-folder-id', folderId);

    // ドラッグ効果を設定
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }

    // ドラッグ中の見た目を変更
    bookmarkLink.classList.add('dragging');
    
    console.log('ドラッグ開始:', { url, title, folderId });
  }

  /**
   * ドラッグ終了時の処理
   */
  private handleDragEnd(event: DragEvent): void {
    const target = event.target as HTMLElement;
    const bookmarkLink = target.closest('.bookmark-link') as HTMLElement;
    
    if (bookmarkLink) {
      bookmarkLink.classList.remove('dragging');
    }

    // ドロップインジケーターを非表示
    if (this.dropIndicator) {
      this.dropIndicator.style.display = 'none';
    }

    // 全てのドロップターゲットからハイライトを削除
    document.querySelectorAll('.drop-target-highlight').forEach(element => {
      element.classList.remove('drop-target-highlight');
    });

    this.draggedBookmark = null;
    console.log('ドラッグ終了');
  }

  /**
   * ドラッグオーバー時の処理
   */
  private handleDragOver(event: DragEvent): void {
    const target = event.target as HTMLElement;
    const folderHeader = target.closest('.folder-header') as HTMLElement;
    
    if (!folderHeader || !this.draggedBookmark) return;

    const folderElement = folderHeader.closest('.bookmark-folder') as HTMLElement;
    const targetFolderId = folderElement?.dataset.folderId;

    // 同じフォルダへのドロップは無効
    if (targetFolderId === this.draggedBookmark.originalFolderId) {
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    // ドロップターゲットをハイライト
    folderHeader.classList.add('drop-target-highlight');

    // ドロップインジケーターを表示
    if (this.dropIndicator) {
      const rect = folderHeader.getBoundingClientRect();
      this.dropIndicator.style.display = 'block';
      this.dropIndicator.style.position = 'absolute';
      this.dropIndicator.style.left = `${rect.left}px`;
      this.dropIndicator.style.top = `${rect.bottom + 5}px`;
      this.dropIndicator.style.zIndex = '1000';
    }
  }

  /**
   * ドラッグリーブ時の処理
   */
  private handleDragLeave(event: DragEvent): void {
    const target = event.target as HTMLElement;
    const folderHeader = target.closest('.folder-header') as HTMLElement;
    
    if (folderHeader) {
      folderHeader.classList.remove('drop-target-highlight');
    }
  }

  /**
   * ドロップ時の処理
   */
  private handleDrop(event: DragEvent): void {
    event.preventDefault();

    const target = event.target as HTMLElement;
    const folderHeader = target.closest('.folder-header') as HTMLElement;
    
    if (!folderHeader || !this.draggedBookmark) return;

    const folderElement = folderHeader.closest('.bookmark-folder') as HTMLElement;
    const targetFolderId = folderElement?.dataset.folderId;

    if (!targetFolderId || targetFolderId === this.draggedBookmark.originalFolderId) {
      return;
    }

    // ブックマーク移動処理を実行
    this.moveBookmark(this.draggedBookmark.url, targetFolderId)
      .then(() => {
        console.log('ブックマーク移動成功:', {
          from: this.draggedBookmark?.originalFolderId,
          to: targetFolderId,
          bookmark: this.draggedBookmark?.title
        });
        
        // UIを更新
        this.refreshBookmarkList();
      })
      .catch((error) => {
        console.error('ブックマーク移動エラー:', error);
        alert('ブックマークの移動に失敗しました。');
      });

    // ハイライトを削除
    folderHeader.classList.remove('drop-target-highlight');
  }

  /**
   * Chrome Bookmarks APIを使用してブックマークを移動する
   */
  private async moveBookmark(bookmarkUrl: string, targetFolderId: string): Promise<void> {
    try {
      // 移動するブックマークを検索
      const bookmarks = await chrome.bookmarks.search({ url: bookmarkUrl });
      
      if (bookmarks.length === 0) {
        throw new Error('移動するブックマークが見つかりません');
      }

      const bookmark = bookmarks[0];
      
      // ブックマークを移動
      await chrome.bookmarks.move(bookmark.id, {
        parentId: targetFolderId
      });

      console.log('Chrome Bookmarks API: ブックマーク移動完了', {
        bookmarkId: bookmark.id,
        newParentId: targetFolderId
      });
    } catch (error) {
      console.error('Chrome Bookmarks API エラー:', error);
      throw error;
    }
  }

  /**
   * ブックマークリストを再読み込みする
   */
  private async refreshBookmarkList(): Promise<void> {
    try {
      // カスタムイベントを発火してメインのブックマーク表示を更新
      const refreshEvent = new CustomEvent('bookmarks-changed', {
        detail: { action: 'move' }
      });
      document.dispatchEvent(refreshEvent);
    } catch (error) {
      console.error('ブックマークリスト更新エラー:', error);
    }
  }

  /**
   * ブックマークアイテムにドラッグ機能を追加する
   */
  makeBookmarksDraggable(): void {
    const bookmarkLinks = document.querySelectorAll('.bookmark-link');
    bookmarkLinks.forEach((link) => {
      const linkElement = link as HTMLElement;
      linkElement.draggable = true;
      linkElement.setAttribute('draggable', 'true');
    });
  }

  /**
   * クリーンアップ処理
   */
  destroy(): void {
    if (this.dropIndicator?.parentNode) {
      this.dropIndicator.parentNode.removeChild(this.dropIndicator);
    }
    
    document.removeEventListener('dragstart', this.handleDragStart.bind(this));
    document.removeEventListener('dragend', this.handleDragEnd.bind(this));
    document.removeEventListener('dragover', this.handleDragOver.bind(this));
    document.removeEventListener('dragleave', this.handleDragLeave.bind(this));
    document.removeEventListener('drop', this.handleDrop.bind(this));
  }
}