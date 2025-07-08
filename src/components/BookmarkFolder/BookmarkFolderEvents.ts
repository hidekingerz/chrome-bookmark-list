import type { BookmarkFolder } from '../../types/bookmark.js';
import { findFolderById } from '../../scripts/utils.js';
import { BookmarkActions } from '../BookmarkActions/index.js';

/**
 * ブックマークフォルダーのイベント処理を担当するクラス
 */
export class BookmarkFolderEvents {
  private bookmarkActions: BookmarkActions;

  constructor() {
    this.bookmarkActions = new BookmarkActions();
  }

  /**
   * フォルダクリックのイベントハンドラーを設定する
   */
  setupFolderClickHandler(
    container: HTMLElement,
    allBookmarks: BookmarkFolder[]
  ): void {
    container.addEventListener('click', (e: Event) => {
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
    });
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
