import { UndoManager } from '../UndoManager/index.js';
import { Autoscroller } from './Autoscroller.js';

/**
 * ブックマークのドラッグ&ドロップ機能を管理するクラス
 */
export class BookmarkDragAndDrop {
  private draggedBookmark: {
    url: string;
    title: string;
    originalFolderId: string;
  } | null = null;

  private draggedFolder: {
    id: string;
    title: string;
    sourceElement: HTMLElement;
  } | null = null;

  private dropIndicator: HTMLElement | null = null;
  private autoscroller: Autoscroller = new Autoscroller();

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

    // フォルダヘッダーからのドラッグはフォルダ移動として処理する
    const folderHeaderSource = target.closest(
      '.folder-header[draggable="true"]'
    ) as HTMLElement | null;
    if (folderHeaderSource) {
      this.handleFolderDragStart(event, folderHeaderSource);
      return;
    }

    const bookmarkLink = target.closest('.bookmark-link') as HTMLElement;

    if (!bookmarkLink) return;

    const url = bookmarkLink.dataset.url;
    const title = bookmarkLink.querySelector('.bookmark-title')?.textContent;
    const folderElement = bookmarkLink.closest(
      '.bookmark-folder'
    ) as HTMLElement;
    const folderId = folderElement?.dataset.folderId;

    if (!url || !title || !folderId) return;

    this.draggedBookmark = {
      url,
      title,
      originalFolderId: folderId,
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

    // カスタムドラッグプレビューを設定
    this.setCustomDragImage(event, bookmarkLink, title);

    // ドラッグ中であることを示すクラスを body に付与 (ドロップ可/不可の視覚化用)
    document.body.classList.add('dragging-bookmark');
    folderElement.classList.add('drag-source-folder');
  }

  /**
   * ドラッグ画像をカスタマイズする。
   * favicon + タイトル + (複数選択中なら) 件数バッジを表示する。
   */
  private setCustomDragImage(
    event: DragEvent,
    bookmarkLink: HTMLElement,
    title: string
  ): void {
    if (!event.dataTransfer) return;

    // 選択件数 (multi-select との連携): DOM ベースで判定
    const selectedCount = document.querySelectorAll(
      '.bookmark-item.selected'
    ).length;

    const preview = document.createElement('div');
    preview.className = 'bookmark-drag-preview';

    // favicon を取得 (存在しない場合は絵文字フォールバック)
    const faviconImg = bookmarkLink.querySelector(
      '.bookmark-favicon'
    ) as HTMLImageElement | null;
    const faviconSrc = faviconImg?.src;
    const faviconHtml =
      faviconSrc && !faviconImg?.classList.contains('hidden')
        ? `<img src="${faviconSrc}" alt="" class="bookmark-drag-preview-icon" />`
        : `<span class="bookmark-drag-preview-icon-placeholder">🔗</span>`;

    const badgeHtml =
      selectedCount > 1
        ? `<span class="bookmark-drag-preview-badge">${selectedCount}</span>`
        : '';

    preview.innerHTML = `
      ${faviconHtml}
      <span class="bookmark-drag-preview-title"></span>
      ${badgeHtml}
    `;
    // タイトルは textContent で安全に設定
    const titleEl = preview.querySelector('.bookmark-drag-preview-title');
    if (titleEl) {
      titleEl.textContent = title;
    }

    // 画面外に配置してから setDragImage に渡す (描画されないとブラウザが画像化できない)
    preview.style.position = 'absolute';
    preview.style.top = '-1000px';
    preview.style.left = '-1000px';
    document.body.appendChild(preview);

    event.dataTransfer.setDragImage(preview, 16, 16);

    // 次フレームで掃除する
    requestAnimationFrame(() => {
      preview.remove();
    });
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
    const highlightedElements = document.querySelectorAll(
      '.drop-target-highlight'
    );
    for (const element of highlightedElements) {
      element.classList.remove('drop-target-highlight');
    }

    this.draggedBookmark = null;
    this.draggedFolder = null;
    this.autoscroller.stop();

    // ドラッグ状態の視覚的マーカーを除去
    document.body.classList.remove('dragging-bookmark');
    document.body.classList.remove('dragging-folder');
    for (const el of Array.from(
      document.querySelectorAll('.drag-source-folder')
    )) {
      el.classList.remove('drag-source-folder');
    }
    for (const el of Array.from(
      document.querySelectorAll('.drop-target-invalid')
    )) {
      el.classList.remove('drop-target-invalid');
    }
    for (const el of Array.from(
      document.querySelectorAll('.drop-zone-before, .drop-zone-after')
    )) {
      el.classList.remove('drop-zone-before', 'drop-zone-after');
    }
    for (const el of Array.from(
      document.querySelectorAll('.folder-header.dragging')
    )) {
      el.classList.remove('dragging');
    }
  }

  /**
   * ドラッグオーバー時の処理
   */
  private handleDragOver(event: DragEvent): void {
    // ドラッグ中なら、フォルダ上かに関係なくオートスクロールを更新する
    if (this.draggedBookmark || this.draggedFolder) {
      this.autoscroller.update(event.clientY, window.innerHeight);
    }

    const target = event.target as HTMLElement;
    const folderHeader = target.closest('.folder-header') as HTMLElement;

    if (this.draggedFolder) {
      this.handleFolderDragOver(event, folderHeader);
      return;
    }

    if (!folderHeader || !this.draggedBookmark) return;

    const folderElement = folderHeader.closest(
      '.bookmark-folder'
    ) as HTMLElement;
    const targetFolderId = folderElement?.dataset.folderId;

    // 同じフォルダへのドロップは無効: 不可視覚を表示するため invalid クラスを付与
    if (targetFolderId === this.draggedBookmark.originalFolderId) {
      folderHeader.classList.add('drop-target-invalid');
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
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
      folderHeader.classList.remove(
        'drop-target-highlight',
        'drop-target-invalid',
        'drop-zone-before',
        'drop-zone-after'
      );
    }
  }

  /**
   * ドロップ時の処理
   */
  private handleDrop(event: DragEvent): void {
    event.preventDefault();
    this.autoscroller.stop();

    const target = event.target as HTMLElement;
    const folderHeader = target.closest('.folder-header') as HTMLElement;

    if (this.draggedFolder) {
      this.handleFolderDrop(event, folderHeader);
      return;
    }

    if (!folderHeader || !this.draggedBookmark) return;

    const folderElement = folderHeader.closest(
      '.bookmark-folder'
    ) as HTMLElement;
    const targetFolderId = folderElement?.dataset.folderId;

    if (
      !targetFolderId ||
      targetFolderId === this.draggedBookmark.originalFolderId
    ) {
      return;
    }

    // ブックマーク移動処理を実行
    this.moveBookmark(this.draggedBookmark.url, targetFolderId)
      .then(() => {
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
  private async moveBookmark(
    bookmarkUrl: string,
    targetFolderId: string
  ): Promise<void> {
    try {
      // 移動するブックマークを検索
      const bookmarks = await chrome.bookmarks.search({ url: bookmarkUrl });

      if (bookmarks.length === 0) {
        throw new Error('移動するブックマークが見つかりません');
      }

      const bookmark = bookmarks[0];
      const originalParentId = bookmark.parentId;
      const originalIndex = bookmark.index;
      const bookmarkTitle = bookmark.title;

      // ブックマークを移動
      await chrome.bookmarks.move(bookmark.id, {
        parentId: targetFolderId,
      });

      // Undo 可能な操作として登録 (id は move では維持される)
      if (originalParentId !== undefined) {
        UndoManager.getInstance().register({
          message: `「${bookmarkTitle}」を移動しました`,
          undo: async () => {
            await chrome.bookmarks.move(bookmark.id, {
              parentId: originalParentId,
              index: originalIndex,
            });
            const event = new CustomEvent('bookmarks-changed', {
              detail: { action: 'undo-move' },
            });
            document.dispatchEvent(event);
          },
        });
      }
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
        detail: { action: 'move' },
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
    for (const link of bookmarkLinks) {
      const linkElement = link as HTMLElement;
      linkElement.draggable = true;
      linkElement.setAttribute('draggable', 'true');
    }
  }

  // ===========================================================================
  // フォルダ DnD (#54)
  // ===========================================================================

  /**
   * フォルダのドラッグ開始処理
   */
  private handleFolderDragStart(
    event: DragEvent,
    folderHeader: HTMLElement
  ): void {
    const folderElement = folderHeader.closest(
      '.bookmark-folder'
    ) as HTMLElement | null;
    const folderId = folderElement?.dataset.folderId;
    const title =
      folderHeader.querySelector('.folder-title')?.textContent ?? '';

    if (!folderElement || !folderId) return;

    this.draggedFolder = {
      id: folderId,
      title,
      sourceElement: folderElement,
    };

    if (event.dataTransfer) {
      event.dataTransfer.setData('text/plain', folderId);
      event.dataTransfer.setData(
        'application/x-bookmark-folder-source',
        folderId
      );
      event.dataTransfer.effectAllowed = 'move';
    }

    folderHeader.classList.add('dragging');
    document.body.classList.add('dragging-bookmark');
    document.body.classList.add('dragging-folder');
    folderElement.classList.add('drag-source-folder');

    this.setCustomFolderDragImage(event, title);
  }

  private setCustomFolderDragImage(event: DragEvent, title: string): void {
    if (!event.dataTransfer) return;

    const preview = document.createElement('div');
    preview.className = 'bookmark-drag-preview folder-drag-preview';
    preview.innerHTML = `
      <span class="bookmark-drag-preview-icon-placeholder">📁</span>
      <span class="bookmark-drag-preview-title"></span>
    `;
    const titleEl = preview.querySelector('.bookmark-drag-preview-title');
    if (titleEl) titleEl.textContent = title;

    preview.style.position = 'absolute';
    preview.style.top = '-1000px';
    preview.style.left = '-1000px';
    document.body.appendChild(preview);

    event.dataTransfer.setDragImage(preview, 16, 16);

    requestAnimationFrame(() => {
      preview.remove();
    });
  }

  /**
   * フォルダドロップのゾーンを判定する。
   * - 上 40%: before (target の前に並び替え)
   * - 中央 20%: into (target のサブフォルダ化)
   * - 下 40%: after (target の後に並び替え)
   * 並び替えの方が頻度が高いと想定し、上下を広めに取る。
   */
  private detectFolderDropZone(
    clientY: number,
    folderHeader: HTMLElement
  ): 'before' | 'into' | 'after' {
    const rect = folderHeader.getBoundingClientRect();
    const ratio = (clientY - rect.top) / rect.height;
    if (ratio < 0.4) return 'before';
    if (ratio > 0.6) return 'after';
    return 'into';
  }

  /**
   * "into" ドロップが無効か判定する。
   * - 自分自身: 同じ要素への移動
   * - 自分の子孫: ループを防ぐ
   * - 現在の親フォルダ: 実質変化なしの no-op を防ぐ
   */
  private isInvalidFolderDropTarget(
    sourceElement: HTMLElement,
    targetFolderElement: HTMLElement
  ): boolean {
    if (targetFolderElement === sourceElement) return true;
    if (sourceElement.contains(targetFolderElement)) return true;

    // 現在の親フォルダ (描画 DOM 上の最近接 .bookmark-folder 祖先) と一致するか
    const currentParent = sourceElement.parentElement?.closest(
      '.bookmark-folder'
    ) as HTMLElement | null;
    if (currentParent && currentParent === targetFolderElement) return true;

    return false;
  }

  /**
   * "before" / "after" の並び替えが無効か判定する。
   * - 自分自身: 同じ要素を起点・目標にできない
   * - 自分の子孫: ループを防ぐ
   */
  private isInvalidFolderReorder(
    sourceElement: HTMLElement,
    targetFolderElement: HTMLElement
  ): boolean {
    if (targetFolderElement === sourceElement) return true;
    if (sourceElement.contains(targetFolderElement)) return true;
    return false;
  }

  /**
   * フォルダのドラッグオーバー処理
   */
  private handleFolderDragOver(
    event: DragEvent,
    folderHeader: HTMLElement | null
  ): void {
    if (!folderHeader || !this.draggedFolder) return;

    const targetFolderElement = folderHeader.closest(
      '.bookmark-folder'
    ) as HTMLElement | null;
    if (!targetFolderElement) return;

    const targetFolderId = targetFolderElement.dataset.folderId;
    if (!targetFolderId) return;

    const sourceElement = this.draggedFolder.sourceElement;
    const zone = this.detectFolderDropZone(event.clientY, folderHeader);

    // ゾーンごとに無効判定: into は親フォルダも禁止、before/after は自分自身/子孫のみ禁止
    const invalid =
      zone === 'into'
        ? this.isInvalidFolderDropTarget(sourceElement, targetFolderElement)
        : this.isInvalidFolderReorder(sourceElement, targetFolderElement);

    // 既存の reorder インジケータと invalid クラスをクリア
    folderHeader.classList.remove('drop-zone-before', 'drop-zone-after');

    if (invalid) {
      folderHeader.classList.add('drop-target-invalid');
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'none';
      }
      return;
    }

    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }

    if (zone === 'into') {
      folderHeader.classList.add('drop-target-highlight');
    } else {
      folderHeader.classList.remove('drop-target-highlight');
      folderHeader.classList.add(
        zone === 'before' ? 'drop-zone-before' : 'drop-zone-after'
      );
    }
  }

  /**
   * フォルダのドロップ処理
   */
  private handleFolderDrop(
    event: DragEvent,
    folderHeader: HTMLElement | null
  ): void {
    const dragged = this.draggedFolder;
    if (!dragged || !folderHeader) return;

    const targetFolderElement = folderHeader.closest(
      '.bookmark-folder'
    ) as HTMLElement | null;
    if (!targetFolderElement) return;
    const targetFolderId = targetFolderElement.dataset.folderId;
    if (!targetFolderId) return;

    const zone = this.detectFolderDropZone(event.clientY, folderHeader);
    const invalid =
      zone === 'into'
        ? this.isInvalidFolderDropTarget(
            dragged.sourceElement,
            targetFolderElement
          )
        : this.isInvalidFolderReorder(
            dragged.sourceElement,
            targetFolderElement
          );
    if (invalid) return;

    folderHeader.classList.remove(
      'drop-target-highlight',
      'drop-zone-before',
      'drop-zone-after'
    );

    const operation =
      zone === 'into'
        ? this.moveFolder(dragged.id, targetFolderId, dragged.title)
        : this.reorderFolder(dragged.id, targetFolderId, zone, dragged.title);

    operation
      .then(() => {
        this.dispatchBookmarksChanged('folder-move');
      })
      .catch((error) => {
        console.error('フォルダ移動エラー:', error);
        alert('フォルダの移動に失敗しました。');
      });
  }

  /**
   * Chrome Bookmarks API を使用してフォルダを移動する。Undo に対応する。
   */
  private async moveFolder(
    folderId: string,
    newParentId: string,
    title: string
  ): Promise<void> {
    try {
      const [node] = await chrome.bookmarks.get(folderId);
      if (!node) {
        throw new Error('移動対象のフォルダが見つかりません');
      }
      const originalParentId = node.parentId;
      const originalIndex = node.index;

      await chrome.bookmarks.move(folderId, { parentId: newParentId });

      if (originalParentId !== undefined) {
        UndoManager.getInstance().register({
          message: `フォルダ「${title}」を移動しました`,
          undo: async () => {
            await chrome.bookmarks.move(folderId, {
              parentId: originalParentId,
              index: originalIndex,
            });
            this.dispatchBookmarksChanged('undo-folder-move');
          },
        });
      }
    } catch (error) {
      console.error('Chrome Bookmarks API エラー:', error);
      throw error;
    }
  }

  /**
   * フォルダを target の前後に並び替える。Undo に対応する。
   */
  private async reorderFolder(
    folderId: string,
    targetFolderId: string,
    zone: 'before' | 'after',
    title: string
  ): Promise<void> {
    try {
      const [target] = await chrome.bookmarks.get(targetFolderId);
      if (!target || target.parentId === undefined) {
        throw new Error('並び替え先フォルダの親が取得できません');
      }
      const [source] = await chrome.bookmarks.get(folderId);
      if (!source) {
        throw new Error('並び替え対象のフォルダが見つかりません');
      }
      const originalParentId = source.parentId;
      const originalIndex = source.index;

      const targetIndex = target.index ?? 0;
      const newParentId = target.parentId;
      // Chrome の chrome.bookmarks.move は source 削除後の sibling 配列に対する
      // index を解釈する。同じ親内で source.index < target.index の場合、
      // source を取り除くと target の index が 1 つ前にずれるので補正する。
      const sameParent = source.parentId === newParentId;
      const sourceIndex = source.index ?? 0;
      const shiftedTargetIndex =
        sameParent && sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
      const newIndex =
        zone === 'before' ? shiftedTargetIndex : shiftedTargetIndex + 1;

      await chrome.bookmarks.move(folderId, {
        parentId: newParentId,
        index: newIndex,
      });

      if (originalParentId !== undefined) {
        UndoManager.getInstance().register({
          message: `フォルダ「${title}」を並び替えました`,
          undo: async () => {
            await chrome.bookmarks.move(folderId, {
              parentId: originalParentId,
              index: originalIndex,
            });
            this.dispatchBookmarksChanged('undo-folder-reorder');
          },
        });
      }
    } catch (error) {
      console.error('Chrome Bookmarks API エラー (reorder):', error);
      throw error;
    }
  }

  private dispatchBookmarksChanged(action: string): void {
    const event = new CustomEvent('bookmarks-changed', { detail: { action } });
    document.dispatchEvent(event);
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
