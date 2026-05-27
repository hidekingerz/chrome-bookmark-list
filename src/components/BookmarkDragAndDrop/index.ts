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
    /**
     * 複数選択ドラッグの場合、ドラッグ対象のすべての URL リスト (本人含む)。
     * 単一ドラッグなら [url] と同じになる。
     */
    additionalUrls: string[];
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

    // ドラッグ対象が複数選択に含まれている場合、選択中の全ブックマークを対象にする
    const sourceItem = bookmarkLink.closest(
      '.bookmark-item'
    ) as HTMLElement | null;
    let additionalUrls: string[] = [url];
    if (sourceItem?.classList.contains('selected')) {
      const selectedItems = Array.from(
        document.querySelectorAll('.bookmark-item.selected')
      );
      const urls = selectedItems
        .map((el) => el.getAttribute('data-bookmark-url'))
        .filter((u): u is string => typeof u === 'string');
      if (urls.length > 1) {
        additionalUrls = urls;
      }
    }

    this.draggedBookmark = {
      url,
      title,
      originalFolderId: folderId,
      additionalUrls,
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
      document.querySelectorAll(
        '.drop-zone-before, .drop-zone-after, .bookmark-item.drop-target-invalid'
      )
    )) {
      el.classList.remove(
        'drop-zone-before',
        'drop-zone-after',
        'drop-target-invalid'
      );
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

    if (!this.draggedBookmark) return;

    // ブックマーク間 reorder のチェック (#80)
    const bookmarkItem = target.closest('.bookmark-item') as HTMLElement | null;
    if (bookmarkItem) {
      this.handleBookmarkReorderOver(event, bookmarkItem);
      return;
    }

    if (!folderHeader) return;

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
   * ブックマーク間並び替えの dragover 処理 (#80)
   *
   * 上半分 → before, 下半分 → after で表示する。
   * 自身へのドロップ、隣接 no-op はinvalid にする。
   */
  private handleBookmarkReorderOver(
    event: DragEvent,
    targetItem: HTMLElement
  ): void {
    if (!this.draggedBookmark) return;
    const targetUrl = targetItem.getAttribute('data-bookmark-url');
    if (!targetUrl) return;

    // 自分自身へのドロップは無効
    if (targetUrl === this.draggedBookmark.url) {
      targetItem.classList.add('drop-target-invalid');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
      return;
    }

    const rect = targetItem.getBoundingClientRect();
    const zone =
      event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';

    // 同じ親内 (= 同じ bookmark-list) で隣接 no-op を検出
    const siblings = Array.from(
      targetItem.parentElement?.querySelectorAll(':scope > .bookmark-item') ??
        []
    ) as HTMLElement[];
    const srcItem = this.findBookmarkItemByUrl(this.draggedBookmark.url);
    if (srcItem && siblings.includes(srcItem)) {
      const srcIdx = siblings.indexOf(srcItem);
      const tgtIdx = siblings.indexOf(targetItem);
      if (zone === 'before' && srcIdx === tgtIdx - 1) {
        targetItem.classList.add('drop-target-invalid');
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        return;
      }
      if (zone === 'after' && srcIdx === tgtIdx + 1) {
        targetItem.classList.add('drop-target-invalid');
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'none';
        return;
      }
    }

    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';

    targetItem.classList.remove('drop-target-invalid');
    if (zone === 'before') {
      targetItem.classList.add('drop-zone-before');
      targetItem.classList.remove('drop-zone-after');
    } else {
      targetItem.classList.add('drop-zone-after');
      targetItem.classList.remove('drop-zone-before');
    }
  }

  /**
   * URL を data-bookmark-url とする bookmark-item 要素を探す
   */
  private findBookmarkItemByUrl(url: string): HTMLElement | null {
    const items = document.querySelectorAll(
      `.bookmark-item[data-bookmark-url]`
    );
    for (const el of Array.from(items)) {
      if (el.getAttribute('data-bookmark-url') === url) {
        return el as HTMLElement;
      }
    }
    return null;
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
    const bookmarkItem = target.closest('.bookmark-item') as HTMLElement | null;
    if (bookmarkItem) {
      bookmarkItem.classList.remove(
        'drop-zone-before',
        'drop-zone-after',
        'drop-target-invalid'
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

    if (!this.draggedBookmark) return;

    // ブックマーク間 reorder (#80)
    const targetBookmarkItem = target.closest(
      '.bookmark-item'
    ) as HTMLElement | null;
    if (targetBookmarkItem) {
      this.handleBookmarkReorderDrop(event, targetBookmarkItem);
      return;
    }

    if (!folderHeader) return;

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
   * ブックマーク間 reorder の drop 処理 (#80)
   */
  private handleBookmarkReorderDrop(
    event: DragEvent,
    targetItem: HTMLElement
  ): void {
    if (!this.draggedBookmark) return;
    const targetUrl = targetItem.getAttribute('data-bookmark-url');
    if (!targetUrl || targetUrl === this.draggedBookmark.url) return;

    const rect = targetItem.getBoundingClientRect();
    const zone =
      event.clientY - rect.top < rect.height / 2 ? 'before' : 'after';

    targetItem.classList.remove(
      'drop-zone-before',
      'drop-zone-after',
      'drop-target-invalid'
    );

    this.reorderBookmark(this.draggedBookmark.url, targetUrl, zone)
      .then(() => {
        this.refreshBookmarkList();
      })
      .catch((error) => {
        console.error('ブックマーク並び替えエラー:', error);
        alert('ブックマークの並び替えに失敗しました。');
      });
  }

  /**
   * 同じフォルダ (もしくは別フォルダ) 内でブックマークを並び替える。
   * Undo に対応。Chrome の chrome.bookmarks.move の補正挙動 (#77 と同様) を考慮。
   */
  private async reorderBookmark(
    sourceUrl: string,
    targetUrl: string,
    zone: 'before' | 'after'
  ): Promise<void> {
    try {
      const [sources, targets] = await Promise.all([
        chrome.bookmarks.search({ url: sourceUrl }),
        chrome.bookmarks.search({ url: targetUrl }),
      ]);
      if (sources.length === 0)
        throw new Error('ソースブックマークが見つかりません');
      if (targets.length === 0)
        throw new Error('ターゲットブックマークが見つかりません');

      const source = sources[0];
      const target = targets[0];
      if (target.parentId === undefined) {
        throw new Error('ターゲットの親が取得できません');
      }
      const originalParentId = source.parentId;
      const originalIndex = source.index;
      const sourceTitle = source.title;

      const targetIndex = target.index ?? 0;
      const newIndex = zone === 'before' ? targetIndex : targetIndex + 1;

      await chrome.bookmarks.move(source.id, {
        parentId: target.parentId,
        index: newIndex,
      });

      if (originalParentId !== undefined) {
        UndoManager.getInstance().register({
          message: `「${sourceTitle}」を並び替えました`,
          undo: async () => {
            let undoIndex = originalIndex ?? 0;
            try {
              const [now] = await chrome.bookmarks.get(source.id);
              if (
                now?.parentId === originalParentId &&
                now.index !== undefined &&
                now.index < undoIndex
              ) {
                undoIndex = undoIndex + 1;
              }
            } catch {
              // フォールバック
            }
            await chrome.bookmarks.move(source.id, {
              parentId: originalParentId,
              index: undoIndex,
            });
            const e = new CustomEvent('bookmarks-changed', {
              detail: { action: 'undo-bookmark-reorder' },
            });
            document.dispatchEvent(e);
          },
        });
      }
    } catch (error) {
      console.error('Chrome Bookmarks API エラー (reorder):', error);
      throw error;
    }
  }

  /**
   * Chrome Bookmarks APIを使用してブックマークを移動する。
   * draggedBookmark.additionalUrls に複数 URL が入っている場合は一括移動する。
   */
  private async moveBookmark(
    bookmarkUrl: string,
    targetFolderId: string
  ): Promise<void> {
    const urls = this.draggedBookmark?.additionalUrls ?? [bookmarkUrl];

    // 単一ドラッグ: 従来の挙動 (Undo: 単一)
    if (urls.length <= 1) {
      return this.moveSingleBookmark(bookmarkUrl, targetFolderId);
    }

    // 複数選択ドラッグ: すべて移動 (Undo: 一括)
    return this.moveMultipleBookmarks(urls, targetFolderId);
  }

  private async moveMultipleBookmarks(
    urls: string[],
    targetFolderId: string
  ): Promise<void> {
    const moveInfos: {
      id: string;
      previousParentId: string | undefined;
      previousIndex: number | undefined;
      title: string;
    }[] = [];

    try {
      for (const url of urls) {
        const found = await chrome.bookmarks.search({ url });
        if (found.length === 0) continue;
        const target = found[0];
        moveInfos.push({
          id: target.id,
          previousParentId: target.parentId,
          previousIndex: target.index,
          title: target.title,
        });
        await chrome.bookmarks.move(target.id, { parentId: targetFolderId });
      }

      if (moveInfos.length > 0) {
        UndoManager.getInstance().register({
          message: `${moveInfos.length} 件のブックマークを移動しました`,
          undo: async () => {
            for (const info of moveInfos) {
              if (info.previousParentId === undefined) continue;
              await chrome.bookmarks.move(info.id, {
                parentId: info.previousParentId,
                index: info.previousIndex,
              });
            }
            const e = new CustomEvent('bookmarks-changed', {
              detail: { action: 'undo-bulk-move' },
            });
            document.dispatchEvent(e);
          },
        });
      }
    } catch (error) {
      console.error('Chrome Bookmarks API エラー (bulk move):', error);
      throw error;
    }
  }

  private async moveSingleBookmark(
    bookmarkUrl: string,
    targetFolderId: string
  ): Promise<void> {
    try {
      const bookmarks = await chrome.bookmarks.search({ url: bookmarkUrl });

      if (bookmarks.length === 0) {
        throw new Error('移動するブックマークが見つかりません');
      }

      const bookmark = bookmarks[0];
      const originalParentId = bookmark.parentId;
      const originalIndex = bookmark.index;
      const bookmarkTitle = bookmark.title;

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
   * - 並び替え後に同じ位置になる no-op (例: 既に「target の直前」にあるのに
   *   target の "before" にドロップ): 混乱を避けて invalid にする
   */
  private isInvalidFolderReorder(
    sourceElement: HTMLElement,
    targetFolderElement: HTMLElement,
    zone: 'before' | 'after'
  ): boolean {
    if (targetFolderElement === sourceElement) return true;
    if (sourceElement.contains(targetFolderElement)) return true;

    // 同じ親内で no-op になるケースを invalid 扱いにする
    const sameParentContainer =
      sourceElement.parentElement === targetFolderElement.parentElement;
    if (sameParentContainer) {
      // DOM 上の表示順を使った隣接判定
      const siblings = Array.from(
        targetFolderElement.parentElement?.children ?? []
      ).filter((el) =>
        (el as HTMLElement).classList.contains('bookmark-folder')
      );
      const srcIdx = siblings.indexOf(sourceElement);
      const tgtIdx = siblings.indexOf(targetFolderElement);
      if (srcIdx === -1 || tgtIdx === -1) return false;

      // 既に対応位置に居る場合は no-op (例: src=0, tgt=1, "before" → src は既に tgt の前)
      if (zone === 'before' && srcIdx === tgtIdx - 1) return true;
      if (zone === 'after' && srcIdx === tgtIdx + 1) return true;
    }

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

    // ゾーンごとに無効判定: into は親フォルダも禁止、before/after は自分自身/子孫/隣接 no-op を禁止
    const invalid =
      zone === 'into'
        ? this.isInvalidFolderDropTarget(sourceElement, targetFolderElement)
        : this.isInvalidFolderReorder(sourceElement, targetFolderElement, zone);

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
            targetFolderElement,
            zone
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
      // Chrome の chrome.bookmarks.move は同じ親内 (= move) で index を
      // 「元の配列での目標位置」として解釈し、source.currentIdx < index の場合
      // 最終位置を index - 1 に補正する。
      // → before: index = target.idx (Chrome が必要に応じて -1 補正)
      // → after:  index = target.idx + 1
      const newIndex = zone === 'before' ? targetIndex : targetIndex + 1;

      await chrome.bookmarks.move(folderId, {
        parentId: newParentId,
        index: newIndex,
      });

      if (originalParentId !== undefined) {
        UndoManager.getInstance().register({
          message: `フォルダ「${title}」を並び替えました`,
          undo: async () => {
            // Undo 時、source の現在位置によって Chrome の補正方向が変わる。
            // 元の位置 originalIndex に確実に戻すため、現在の index を取得して
            // 補正を相殺する。
            let undoIndex = originalIndex ?? 0;
            try {
              const [now] = await chrome.bookmarks.get(folderId);
              if (
                now?.parentId === originalParentId &&
                now.index !== undefined &&
                now.index < undoIndex
              ) {
                // Chrome は source.idx < index のとき index - 1 に補正するので
                // 戻り先 = originalIndex を保証するため index = originalIndex + 1
                undoIndex = undoIndex + 1;
              }
            } catch {
              // 取得失敗時は originalIndex のまま (フォールバック)
            }
            await chrome.bookmarks.move(folderId, {
              parentId: originalParentId,
              index: undoIndex,
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
