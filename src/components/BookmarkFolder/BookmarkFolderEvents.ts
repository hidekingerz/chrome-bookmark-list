import { findFolderById } from '../../scripts/utils.js';
import type { BookmarkFolder, BookmarkItem } from '../../types/bookmark.js';
import { FolderCreator } from '../BookmarkActions/FolderCreator.js';
import { FolderDeleter } from '../BookmarkActions/FolderDeleter.js';
import { FolderRenamer } from '../BookmarkActions/FolderRenamer.js';
import { BookmarkActions } from '../BookmarkActions/index.js';
import { BookmarkSelection } from '../BookmarkSelection/index.js';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu/index.js';

// Chrome のパーマネントフォルダの ID
// 1: ブックマークバー / 2: その他のブックマーク / 3: モバイルのブックマーク
const PERMANENT_ROOT_IDS = new Set(['1', '2', '3']);

/**
 * ブックマークフォルダーのイベント処理を担当するクラス
 */
export class BookmarkFolderEvents {
  private bookmarkActions: BookmarkActions;
  private clickHandler: ((e: Event) => void) | null = null;
  private auxClickHandler: ((e: Event) => void) | null = null;
  private mouseDownHandler: ((e: Event) => void) | null = null;
  private contextMenuHandler: ((e: Event) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private touchStartHandler: ((e: TouchEvent) => void) | null = null;
  private touchEndHandler: ((e: TouchEvent) => void) | null = null;
  private touchMoveHandler: ((e: TouchEvent) => void) | null = null;
  private longPressTimerId: number | null = null;
  private contextMenu: ContextMenu;
  private folderCreator: FolderCreator;
  private folderRenamer: FolderRenamer;
  private folderDeleter: FolderDeleter;
  private selection: BookmarkSelection;

  constructor(selection?: BookmarkSelection) {
    this.bookmarkActions = new BookmarkActions();
    this.contextMenu = new ContextMenu();
    this.folderCreator = new FolderCreator();
    this.folderRenamer = new FolderRenamer();
    this.folderDeleter = new FolderDeleter();
    this.selection = selection ?? new BookmarkSelection();
  }

  /**
   * 現在の選択管理オブジェクトを返す。
   */
  getSelection(): BookmarkSelection {
    return this.selection;
  }

  /**
   * フォルダクリックのイベントハンドラーを設定する
   */
  setupFolderClickHandler(
    container: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    // 既存のイベントリスナーを削除
    if (this.clickHandler) {
      container.removeEventListener('click', this.clickHandler);
    }

    // 複数選択モジュールに最新のコンテナを通知
    this.selection.refresh(container);

    // 新しいイベントリスナーを作成して保存
    this.clickHandler = (e: Event) => {
      const target = e.target as HTMLElement;

      // 各種ボタンやリンクの要素を特定
      const folderHeader = target.closest(
        '.folder-header'
      ) as HTMLElement | null;
      const bookmarkLink = target.closest(
        '.bookmark-link'
      ) as HTMLElement | null;
      const deleteBtn = target.closest(
        '.bookmark-delete-btn'
      ) as HTMLElement | null;
      const editBtn = target.closest(
        '.bookmark-edit-btn'
      ) as HTMLElement | null;

      // 優先度順でイベント処理
      if (editBtn) {
        this.handleEditClick(e, editBtn);
      } else if (deleteBtn) {
        this.handleDeleteClick(e, deleteBtn);
      } else if (bookmarkLink) {
        this.handleBookmarkClick(e, bookmarkLink);
      } else if (folderHeader && !target.closest('.bookmark-link')) {
        this.handleFolderClick(e, folderHeader, allBookmarks);
      }
    };

    // イベントリスナーを登録
    container.addEventListener('click', this.clickHandler);

    // 中クリック（auxclick）でブックマークを新しいタブ（バックグラウンド）で開く
    if (this.auxClickHandler) {
      container.removeEventListener('auxclick', this.auxClickHandler);
    }
    this.auxClickHandler = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      // ホイールクリック（中ボタン）のみを対象にする
      if (mouseEvent.button !== 1) {
        return;
      }
      const target = mouseEvent.target as HTMLElement;
      const bookmarkLink = target.closest(
        '.bookmark-link'
      ) as HTMLElement | null;
      if (!bookmarkLink) {
        return;
      }
      this.handleBookmarkMiddleClick(mouseEvent, bookmarkLink);
    };
    container.addEventListener('auxclick', this.auxClickHandler);

    // 中クリック時にブラウザのオートスクロールが発動しないよう mousedown で抑制
    if (this.mouseDownHandler) {
      container.removeEventListener('mousedown', this.mouseDownHandler);
    }
    this.mouseDownHandler = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      if (mouseEvent.button !== 1) {
        return;
      }
      const target = mouseEvent.target as HTMLElement;
      const bookmarkLink = target.closest(
        '.bookmark-link'
      ) as HTMLElement | null;
      if (!bookmarkLink) {
        return;
      }
      mouseEvent.preventDefault();
    };
    container.addEventListener('mousedown', this.mouseDownHandler);

    // コンテキストメニューのイベントリスナーを設定
    this.setupContextMenuHandler(container, allBookmarks);
  }

  /**
   * 右クリック・Shift+F10 によるコンテキストメニュー表示を設定する
   */
  private setupContextMenuHandler(
    container: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    if (this.contextMenuHandler) {
      container.removeEventListener('contextmenu', this.contextMenuHandler);
    }
    if (this.keydownHandler) {
      container.removeEventListener('keydown', this.keydownHandler);
    }

    this.contextMenuHandler = (e: Event) => {
      const mouseEvent = e as MouseEvent;
      const target = mouseEvent.target as HTMLElement;

      const bookmarkItem = target.closest(
        '.bookmark-item'
      ) as HTMLElement | null;
      const folderHeader = target.closest(
        '.folder-header'
      ) as HTMLElement | null;

      if (bookmarkItem) {
        mouseEvent.preventDefault();
        this.openBookmarkContextMenu(
          mouseEvent.clientX,
          mouseEvent.clientY,
          bookmarkItem
        );
      } else if (folderHeader) {
        mouseEvent.preventDefault();
        this.openFolderContextMenu(
          mouseEvent.clientX,
          mouseEvent.clientY,
          folderHeader,
          allBookmarks
        );
      }
    };

    this.keydownHandler = (e: KeyboardEvent) => {
      const isMenuKey =
        e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10');
      if (!isMenuKey) return;

      const target = e.target as HTMLElement;
      const bookmarkItem = target.closest(
        '.bookmark-item'
      ) as HTMLElement | null;
      const folderHeader = target.closest(
        '.folder-header'
      ) as HTMLElement | null;

      const activeElement = (bookmarkItem ??
        folderHeader) as HTMLElement | null;
      if (!activeElement) return;

      e.preventDefault();
      const rect = activeElement.getBoundingClientRect();
      const x = rect.left + 8;
      const y = rect.bottom;

      if (bookmarkItem) {
        this.openBookmarkContextMenu(x, y, bookmarkItem);
      } else if (folderHeader) {
        this.openFolderContextMenu(x, y, folderHeader, allBookmarks);
      }
    };

    container.addEventListener('contextmenu', this.contextMenuHandler);
    container.addEventListener('keydown', this.keydownHandler);

    // タッチデバイスの長押しでコンテキストメニューを開く
    this.setupLongPressHandler(container, allBookmarks);
  }

  /**
   * タッチデバイスでの長押し (500ms) によるコンテキストメニュー表示。
   */
  private setupLongPressHandler(
    container: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    const LONG_PRESS_MS = 500;
    const MOVE_THRESHOLD_PX = 10;

    if (this.touchStartHandler) {
      container.removeEventListener('touchstart', this.touchStartHandler);
    }
    if (this.touchEndHandler) {
      container.removeEventListener('touchend', this.touchEndHandler);
      container.removeEventListener('touchcancel', this.touchEndHandler);
    }
    if (this.touchMoveHandler) {
      container.removeEventListener('touchmove', this.touchMoveHandler);
    }

    let startX = 0;
    let startY = 0;
    let activeTarget: HTMLElement | null = null;
    let activeType: 'bookmark' | 'folder' | null = null;

    const cancelTimer = () => {
      if (this.longPressTimerId !== null) {
        window.clearTimeout(this.longPressTimerId);
        this.longPressTimerId = null;
      }
      activeTarget = null;
      activeType = null;
    };

    this.touchStartHandler = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        cancelTimer();
        return;
      }
      const touch = e.touches[0];
      const target = touch.target as HTMLElement;
      const bookmarkItem = target.closest(
        '.bookmark-item'
      ) as HTMLElement | null;
      const folderHeader = target.closest(
        '.folder-header'
      ) as HTMLElement | null;

      if (!bookmarkItem && !folderHeader) return;

      startX = touch.clientX;
      startY = touch.clientY;
      activeTarget = bookmarkItem ?? folderHeader;
      activeType = bookmarkItem ? 'bookmark' : 'folder';

      this.longPressTimerId = window.setTimeout(() => {
        if (!activeTarget) return;
        if (activeType === 'bookmark') {
          this.openBookmarkContextMenu(startX, startY, activeTarget);
        } else if (activeType === 'folder') {
          this.openFolderContextMenu(
            startX,
            startY,
            activeTarget,
            allBookmarks
          );
        }
        cancelTimer();
      }, LONG_PRESS_MS);
    };

    this.touchMoveHandler = (e: TouchEvent) => {
      if (this.longPressTimerId === null) return;
      const touch = e.touches[0];
      if (!touch) return;
      const dx = Math.abs(touch.clientX - startX);
      const dy = Math.abs(touch.clientY - startY);
      if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
        cancelTimer();
      }
    };

    this.touchEndHandler = () => {
      cancelTimer();
    };

    container.addEventListener('touchstart', this.touchStartHandler, {
      passive: true,
    });
    container.addEventListener('touchmove', this.touchMoveHandler, {
      passive: true,
    });
    container.addEventListener('touchend', this.touchEndHandler);
    container.addEventListener('touchcancel', this.touchEndHandler);
  }

  /**
   * ブックマーク用コンテキストメニューを開く
   */
  private openBookmarkContextMenu(
    x: number,
    y: number,
    bookmarkItem: HTMLElement
  ): void {
    const link = bookmarkItem.querySelector(
      '.bookmark-link'
    ) as HTMLElement | null;
    const editBtn = bookmarkItem.querySelector(
      '.bookmark-edit-btn'
    ) as HTMLElement | null;
    const deleteBtn = bookmarkItem.querySelector(
      '.bookmark-delete-btn'
    ) as HTMLElement | null;

    const url = link?.getAttribute('data-url') ?? '';
    const title =
      editBtn?.getAttribute('data-bookmark-title') ??
      bookmarkItem.querySelector('.bookmark-title')?.textContent?.trim() ??
      '';

    if (!url) {
      return;
    }

    const items: ContextMenuItem[] = [
      {
        label: '開く',
        icon: '🔗',
        onSelect: () => {
          chrome.tabs.update({ url });
        },
      },
      {
        label: '新しいタブで開く',
        icon: '🆕',
        onSelect: () => {
          chrome.tabs.create({ url, active: true });
        },
      },
      {
        label: 'バックグラウンドで開く',
        icon: '↗️',
        onSelect: () => {
          chrome.tabs.create({ url, active: false });
        },
      },
      {
        label: 'URLをコピー',
        icon: '📋',
        separatorBefore: true,
        onSelect: async () => {
          await this.copyToClipboard(url, title);
        },
      },
      {
        label: '編集',
        icon: '✏️',
        separatorBefore: true,
        disabled: !editBtn,
        onSelect: () => {
          if (editBtn) {
            this.bookmarkActions.handleEdit(editBtn);
          }
        },
      },
      {
        label: '削除',
        icon: '🗑️',
        disabled: !deleteBtn,
        onSelect: () => {
          if (deleteBtn) {
            this.bookmarkActions.handleDelete(deleteBtn);
          }
        },
      },
    ];

    this.contextMenu.open(x, y, items);
  }

  /**
   * フォルダ用コンテキストメニューを開く
   */
  private openFolderContextMenu(
    x: number,
    y: number,
    folderHeader: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    const folderElement = folderHeader.closest(
      '.bookmark-folder'
    ) as HTMLElement | null;
    const folderId = folderElement?.getAttribute('data-folder-id');
    if (!folderId || !folderElement) {
      return;
    }

    const folder = this.findFolder(allBookmarks, folderId);
    if (!folder) {
      return;
    }

    const allUrls = this.collectAllBookmarkUrls(folder);
    const hasBookmarks = allUrls.length > 0;
    const isExpandable =
      folder.subfolders.length > 0 || folder.bookmarks.length > 0;
    // ブックマークバー (id=1)・その他のブックマーク (id=2)・モバイルのブックマーク
    // (id=3) は Chrome のパーマネントフォルダで update / removeTree が必ず失敗する。
    // ブックマークバー直下のユーザーフォルダはアプリ側で平坦化されて allBookmarks の
    // トップレベルに並ぶが、それらはリネーム可能なので ID で厳密に判定する。
    const isPermanentRoot = PERMANENT_ROOT_IDS.has(folder.id);

    const items: ContextMenuItem[] = [
      {
        label: folder.expanded ? '折りたたむ' : '展開する',
        icon: folder.expanded ? '📁' : '📂',
        disabled: !isExpandable,
        onSelect: () => {
          this.toggleFolder(folder, folderHeader, folderElement, allBookmarks);
        },
      },
      {
        label: `中のブックマークを全て新しいタブで開く (${allUrls.length})`,
        icon: '🆕',
        separatorBefore: true,
        disabled: !hasBookmarks,
        onSelect: () => {
          for (const url of allUrls) {
            chrome.tabs.create({ url, active: false });
          }
        },
      },
      {
        label: '新規サブフォルダ',
        icon: '➕',
        separatorBefore: true,
        onSelect: () => {
          void this.folderCreator.openCreateDialog(folder.id);
        },
      },
      {
        label: 'フォルダ名を変更',
        icon: '✏️',
        disabled: isPermanentRoot,
        onSelect: () => {
          void this.folderRenamer.openRenameDialog(folder.id);
        },
      },
      {
        label: 'フォルダを削除',
        icon: '🗑️',
        disabled: isPermanentRoot,
        onSelect: () => {
          void this.folderDeleter.openDeleteDialog(folder.id);
        },
      },
    ];

    this.contextMenu.open(x, y, items);
  }

  /**
   * フォルダの展開状態を切り替える
   */
  private toggleFolder(
    folder: BookmarkFolder,
    folderHeader: HTMLElement,
    folderElement: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    if (folder.subfolders.length > 0) {
      this.toggleFolderWithSubfolders(
        folder,
        folderHeader,
        folderElement,
        allBookmarks
      );
    } else if (folder.bookmarks.length > 0) {
      this.toggleFolderWithBookmarks(folder, folderHeader, folderElement);
    }
  }

  /**
   * フォルダ内の全ブックマークURLを再帰的に収集する
   */
  private collectAllBookmarkUrls(folder: BookmarkFolder): string[] {
    const urls: string[] = folder.bookmarks.map((b: BookmarkItem) => b.url);
    for (const sub of folder.subfolders) {
      urls.push(...this.collectAllBookmarkUrls(sub));
    }
    return urls;
  }

  /**
   * クリップボードにテキストをコピーする
   */
  private async copyToClipboard(url: string, _title: string): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // フォールバック: 一時的なtextareaを使用
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
    } catch (error) {
      console.error('❌ URLのコピーに失敗しました:', error);
    }
  }

  /**
   * 編集ボタンクリックの処理
   */
  private handleEditClick(e: Event, editBtn: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    this.bookmarkActions.handleEdit(editBtn);
  }

  /**
   * 削除ボタンクリックの処理
   */
  private handleDeleteClick(e: Event, deleteBtn: HTMLElement): void {
    e.preventDefault();
    e.stopPropagation();
    this.bookmarkActions.handleDelete(deleteBtn);
  }

  /**
   * ブックマークリンククリックの処理
   *
   * - Shift+クリック: 複数選択 (範囲選択)。selection.handleClick が消費する
   * - 既に選択中で修飾キーなしクリック: 選択解除を優先 (selection.handleClick が消費)
   * - Cmd/Ctrl+クリック: 新しいタブをバックグラウンドで開く (#68)
   * - 通常クリック: 現在のタブで開く
   */
  private handleBookmarkClick(e: Event, bookmarkLink: HTMLElement): void {
    const mouseEvent = e as MouseEvent;
    const url = bookmarkLink.getAttribute('data-url');
    if (!url) {
      e.preventDefault();
      return;
    }

    const bookmarkItem = bookmarkLink.closest(
      '.bookmark-item'
    ) as HTMLElement | null;
    const title =
      bookmarkLink.querySelector('.bookmark-title')?.textContent?.trim() ?? '';

    // 選択処理にイベントを渡す (Shift か、既に選択中の場合のみ消費される想定)
    if (bookmarkItem) {
      const consumed = this.selection.handleClick(
        url,
        title,
        bookmarkItem,
        mouseEvent
      );
      if (consumed) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    e.preventDefault();
    const openInBackground = Boolean(mouseEvent.metaKey || mouseEvent.ctrlKey);
    chrome.tabs.create({ url, active: !openInBackground });
  }

  /**
   * ブックマークリンクの中クリック処理
   *
   * 中クリックでは新しいタブをバックグラウンドで開く（フォーカス移動なし）
   */
  private handleBookmarkMiddleClick(
    e: MouseEvent,
    bookmarkLink: HTMLElement
  ): void {
    e.preventDefault();
    e.stopPropagation();
    const url = bookmarkLink.getAttribute('data-url');
    if (!url) {
      return;
    }
    chrome.tabs.create({ url, active: false });
  }

  /**
   * フォルダヘッダークリックの処理
   */
  private handleFolderClick(
    e: Event,
    folderHeader: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    e.preventDefault();
    e.stopPropagation();

    const folderElement = folderHeader.closest(
      '.bookmark-folder'
    ) as HTMLElement;
    const folderId = folderElement?.getAttribute('data-folder-id');

    if (!folderId) {
      return;
    }

    const folder = this.findFolder(allBookmarks, folderId);

    if (!folder) {
      return;
    }

    // フォルダの種類に応じて処理を分岐
    if (folder.subfolders.length > 0) {
      this.toggleFolderWithSubfolders(
        folder,
        folderHeader,
        folderElement,
        allBookmarks
      );
    } else if (folder.bookmarks.length > 0) {
      this.toggleFolderWithBookmarks(folder, folderHeader, folderElement);
    }
    // サブフォルダもブックマークもない場合は何もしない
  }

  /**
   * サブフォルダを持つフォルダの展開/折りたたみ処理
   */
  private toggleFolderWithSubfolders(
    folder: BookmarkFolder,
    folderHeader: HTMLElement,
    folderElement: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    // 展開状態を切り替え
    folder.expanded = !folder.expanded;

    // UI要素を更新
    this.updateFolderUI(folderHeader, folderElement, folder, allBookmarks);
  }

  /**
   * ブックマークのみを持つフォルダの展開/折りたたみ処理
   */
  private toggleFolderWithBookmarks(
    folder: BookmarkFolder,
    folderHeader: HTMLElement,
    folderElement: HTMLElement
  ): void {
    // 展開状態を切り替え
    folder.expanded = !folder.expanded;

    // UI要素を更新（ブックマークリスト用）
    this.updateBookmarkListUI(folderHeader, folderElement, folder);
  }

  /**
   * フォルダのUIを更新する
   */
  private updateFolderUI(
    folderHeader: HTMLElement,
    folderElement: HTMLElement,
    folder: BookmarkFolder,
    allBookmarks: BookmarkFolder[]
  ): void {
    const expandIcon = folderHeader.querySelector(
      '.expand-icon'
    ) as HTMLElement;
    const subfoldersContainer = folderElement.querySelector(
      '.subfolders-container'
    ) as HTMLElement;
    const bookmarkList = folderElement.querySelector(
      '.bookmark-list'
    ) as HTMLElement;

    // アイコンの更新
    this.updateExpandIcon(expandIcon, folder.expanded);

    // サブフォルダコンテナの更新
    if (subfoldersContainer) {
      this.updateSubfoldersContainer(
        subfoldersContainer,
        folderElement,
        folder,
        allBookmarks
      );
    }

    // ブックマークリストの更新
    if (bookmarkList) {
      this.updateBookmarkListElement(bookmarkList, folder.expanded);
    }
  }

  /**
   * ブックマークリストのUIを更新する（サブフォルダなしフォルダ用）
   */
  private updateBookmarkListUI(
    folderHeader: HTMLElement,
    folderElement: HTMLElement,
    folder: BookmarkFolder
  ): void {
    const expandIcon = folderHeader.querySelector(
      '.expand-icon'
    ) as HTMLElement;
    const bookmarkList = folderElement.querySelector(
      '.bookmark-list'
    ) as HTMLElement;

    // アイコンの更新
    this.updateExpandIcon(expandIcon, folder.expanded);

    // ブックマークリストの更新
    if (bookmarkList) {
      this.updateBookmarkListElement(bookmarkList, folder.expanded);
    }
  }

  /**
   * 展開アイコンを更新する
   */
  private updateExpandIcon(
    expandIcon: HTMLElement | null,
    expanded: boolean
  ): void {
    if (!expandIcon) return;

    expandIcon.textContent = expanded ? '📂' : '📁';
    expandIcon.classList.toggle('expanded', expanded);

    // フォルダヘッダの aria-expanded も更新する (キーボード操作・スクリーンリーダ用)
    const folderHeader = expandIcon.closest(
      '.folder-header'
    ) as HTMLElement | null;
    folderHeader?.setAttribute('aria-expanded', expanded ? 'true' : 'false');
  }

  /**
   * サブフォルダコンテナを更新する
   */
  private updateSubfoldersContainer(
    subfoldersContainer: HTMLElement,
    _folderElement: HTMLElement,
    folder: BookmarkFolder,
    allBookmarks: BookmarkFolder[]
  ): void {
    if (folder.expanded) {
      this.expandSubfoldersContainer(subfoldersContainer, allBookmarks);
    } else {
      this.collapseSubfoldersContainer(subfoldersContainer);
    }
  }

  /**
   * サブフォルダコンテナを展開する
   */
  private expandSubfoldersContainer(
    subfoldersContainer: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    subfoldersContainer.style.display = 'block';
    subfoldersContainer.classList.remove('collapsed');
    subfoldersContainer.classList.add('expanded');

    // 内部の子フォルダも表示
    const childFolders =
      subfoldersContainer.querySelectorAll('.bookmark-folder');
    for (const child of childFolders) {
      const childElement = child as HTMLElement;
      childElement.style.display = 'block';
      childElement.classList.remove('preserve-visible');

      // サブフォルダなしの子フォルダのブックマークリストの状態を復元
      this.restoreChildFolderState(childElement, allBookmarks);
    }
  }

  /**
   * サブフォルダコンテナを折りたたむ
   */
  private collapseSubfoldersContainer(subfoldersContainer: HTMLElement): void {
    subfoldersContainer.classList.remove('expanded');
    subfoldersContainer.classList.add('collapsed');

    // 全ての子フォルダを非表示にする
    const childFolders =
      subfoldersContainer.querySelectorAll('.bookmark-folder');
    for (const child of childFolders) {
      const childElement = child as HTMLElement;
      childElement.classList.remove('preserve-visible');
      childElement.style.display = 'none';
    }

    // サブフォルダコンテナも非表示にする
    subfoldersContainer.style.display = 'none';
  }

  /**
   * 子フォルダの状態を復元する
   */
  private restoreChildFolderState(
    childElement: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    const hasSubfoldersClass = childElement.querySelector(
      '.folder-header.has-subfolders'
    );
    const hasBookmarksClass = childElement.querySelector(
      '.folder-header.has-bookmarks'
    );

    if (!hasSubfoldersClass && hasBookmarksClass) {
      const folderId = childElement.getAttribute('data-folder-id');
      if (folderId) {
        const childFolder = findFolderById(allBookmarks, folderId);

        if (childFolder) {
          const bookmarkList = childElement.querySelector(
            '.bookmark-list'
          ) as HTMLElement;
          const expandIcon = childElement.querySelector(
            '.expand-icon'
          ) as HTMLElement;

          if (bookmarkList) {
            this.updateBookmarkListElement(bookmarkList, childFolder.expanded);
          }

          if (expandIcon) {
            this.updateExpandIcon(expandIcon, childFolder.expanded);
          }
        }
      }
    }
  }

  /**
   * ブックマークリスト要素を更新する
   */
  private updateBookmarkListElement(
    bookmarkList: HTMLElement,
    expanded: boolean
  ): void {
    bookmarkList.style.display = expanded ? 'block' : 'none';
    bookmarkList.classList.toggle('expanded', expanded);
    bookmarkList.classList.toggle('collapsed', !expanded);
  }

  /**
   * フォルダを検索する（フォールバック付き）
   */
  private findFolder(
    allBookmarks: BookmarkFolder[],
    folderId: string
  ): BookmarkFolder | null {
    let folder = findFolderById(allBookmarks, folderId);

    // フォルダが見つからない場合のフォールバック検索
    if (!folder) {
      const deepSearch = (folders: BookmarkFolder[]): BookmarkFolder | null => {
        for (const f of folders) {
          if (f.id === folderId) return f;
          const found = deepSearch(f.subfolders);
          if (found) return found;
        }
        return null;
      };
      folder = deepSearch(allBookmarks);
    }

    return folder;
  }
}
