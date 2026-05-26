import { findFolderById } from '../../scripts/utils.js';
import type { BookmarkFolder, BookmarkItem } from '../../types/bookmark.js';
import { FolderCreator } from '../BookmarkActions/FolderCreator.js';
import { BookmarkActions } from '../BookmarkActions/index.js';
import { ContextMenu, type ContextMenuItem } from '../ContextMenu/index.js';

/**
 * ブックマークフォルダーのイベント処理を担当するクラス
 */
export class BookmarkFolderEvents {
  private bookmarkActions: BookmarkActions;
  private clickHandler: ((e: Event) => void) | null = null;
  private contextMenuHandler: ((e: Event) => void) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private contextMenu: ContextMenu;
  private folderCreator: FolderCreator;

  constructor() {
    this.bookmarkActions = new BookmarkActions();
    this.contextMenu = new ContextMenu();
    this.folderCreator = new FolderCreator();
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
        disabled: true,
        onSelect: () => {
          console.warn('フォルダリネーム機能は別 issue (#52) で実装予定です');
        },
      },
      {
        label: 'フォルダを削除',
        icon: '🗑️',
        disabled: true,
        onSelect: () => {
          console.warn('フォルダ削除機能は別 issue (#53) で実装予定です');
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
   */
  private handleBookmarkClick(e: Event, bookmarkLink: HTMLElement): void {
    e.preventDefault();
    const url = bookmarkLink.getAttribute('data-url');
    if (url) {
      chrome.tabs.create({ url: url });
    }
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
