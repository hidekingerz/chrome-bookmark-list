// newtab.tsの主要機能をテスト可能にするため、分離したモジュール

import type { BookmarkFolder } from '../types/bookmark.js';
import { escapeHtml, findFolderById, getTotalBookmarks } from './utils.js';

/**
 * フォルダをHTMLに変換する関数
 */
export function renderFolder(folder: BookmarkFolder, level = 0): string {
  const hasSubfolders = folder.subfolders.length > 0;
  const hasBookmarks = folder.bookmarks.length > 0;
  const totalBookmarks =
    folder.bookmarks.length +
    folder.subfolders.reduce((sum, sub) => sum + getTotalBookmarks(sub), 0);

  // レベル1以上のサブフォルダなしフォルダは、親フォルダが折りたたまれていても表示を維持
  const shouldHide = level > 0 && hasSubfolders && !folder.expanded;

  return `
        <div class="bookmark-folder ${shouldHide ? 'hidden' : ''}" data-level="${level}" data-folder-id="${folder.id}">
            <div class="folder-header ${hasSubfolders ? 'has-subfolders' : hasBookmarks ? 'has-bookmarks' : ''}">
                <div class="folder-info">
                    ${
                      hasSubfolders
                        ? `<span class="expand-icon ${folder.expanded ? 'expanded' : ''}">${folder.expanded ? '📂' : '📁'}</span>`
                        : hasBookmarks
                          ? `<span class="expand-icon ${folder.expanded ? 'expanded' : ''}">${folder.expanded ? '📂' : '📁'}</span>`
                          : '<span class="folder-icon">📄</span>'
                    }
                    <h2 class="folder-title">${escapeHtml(folder.title)}</h2>
                    ${hasSubfolders ? `<span class="subfolder-count">${folder.subfolders.length}個のフォルダ</span>` : ''}
                </div>
                <span class="bookmark-count">${totalBookmarks}</span>
            </div>
            
            ${
              hasBookmarks
                ? `
                <ul class="bookmark-list ${folder.expanded ? 'expanded' : 'collapsed'}" style="display: ${folder.expanded ? 'block' : 'none'}">
                    ${folder.bookmarks
                      .map(
                        (bookmark) => `
                        <li class="bookmark-item">
                            <a href="#" class="bookmark-link" data-url="${escapeHtml(bookmark.url)}">
                                <div class="bookmark-favicon-container">
                                    <div class="favicon-placeholder">🔗</div>
                                    <img class="bookmark-favicon hidden" alt="" data-bookmark-url="${escapeHtml(bookmark.url)}">
                                </div>
                                <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
                            </a>
                            <div class="bookmark-actions">
                                <button class="bookmark-edit-btn" data-bookmark-url="${escapeHtml(bookmark.url)}" data-bookmark-title="${escapeHtml(bookmark.title)}" title="編集">
                                    ✏️
                                </button>
                                <button class="bookmark-delete-btn" data-bookmark-url="${escapeHtml(bookmark.url)}" data-bookmark-title="${escapeHtml(bookmark.title)}" title="削除">
                                    🗑️
                                </button>
                            </div>
                        </li>
                    `
                      )
                      .join('')}
                </ul>
            `
                : ''
            }
            
            ${
              hasSubfolders
                ? `
                <div class="subfolders-container ${folder.expanded ? 'expanded' : 'collapsed'}" style="display: ${folder.expanded ? 'block' : 'none'};">
                    ${folder.subfolders.map((subfolder) => renderFolder(subfolder, level + 1)).join('')}
                </div>
            `
                : ''
            }
        </div>
    `;
}

/**
 * フォルダクリックのイベントハンドラーを設定する関数
 */
export function setupFolderClickHandler(
  container: HTMLElement,
  allBookmarks: BookmarkFolder[]
): void {
  container.addEventListener('click', (e: Event) => {
    const target = e.target as HTMLElement;
    const folderHeader = target.closest('.folder-header') as HTMLElement | null;
    const bookmarkLink = target.closest('.bookmark-link') as HTMLElement | null;
    const deleteBtn = target.closest(
      '.bookmark-delete-btn'
    ) as HTMLElement | null;
    const editBtn = target.closest('.bookmark-edit-btn') as HTMLElement | null;

    if (editBtn) {
      e.preventDefault();
      e.stopPropagation();
      handleBookmarkEdit(editBtn);
    } else if (deleteBtn) {
      e.preventDefault();
      e.stopPropagation();
      handleBookmarkDelete(deleteBtn);
    } else if (bookmarkLink) {
      e.preventDefault();
      const url = bookmarkLink.getAttribute('data-url');
      if (url) {
        chrome.tabs.create({ url: url });
      }
    } else if (folderHeader && !target.closest('.bookmark-link')) {
      e.preventDefault();
      e.stopPropagation();

      const folderElement = folderHeader.closest(
        '.bookmark-folder'
      ) as HTMLElement;
      const folderId = folderElement?.getAttribute('data-folder-id');

      if (folderId) {
        let folder = findFolderById(allBookmarks, folderId);

        // フォルダが見つからない場合のフォールバック検索
        if (!folder) {
          function deepSearch(
            folders: BookmarkFolder[]
          ): BookmarkFolder | null {
            for (const f of folders) {
              if (f.id === folderId) return f;
              const found = deepSearch(f.subfolders);
              if (found) return found;
            }
            return null;
          }
          folder = deepSearch(allBookmarks);
        }

        if (folder) {
          // サブフォルダがある場合：そのフォルダを展開/折りたたみ
          if (folder.subfolders.length > 0) {
            // 展開状態を切り替え
            folder.expanded = !folder.expanded;

            // UI要素を更新
            updateFolderUI(folderHeader, folderElement, folder, allBookmarks);
          } else if (folder.bookmarks.length > 0) {
            // サブフォルダはないがブックマークがある場合：ブックマークリストを展開/折りたたみ
            // 展開状態を切り替え
            folder.expanded = !folder.expanded;

            // UI要素を更新（ブックマークリスト用）
            updateBookmarkListUI(folderHeader, folderElement, folder);
          } else {
            // サブフォルダもブックマークもない場合：何もしない
          }
        }
      }
    }
  });
}

/**
 * フォルダのUIを更新する関数
 */
export function updateFolderUI(
  folderHeader: HTMLElement,
  folderElement: HTMLElement,
  folder: BookmarkFolder,
  allBookmarks: BookmarkFolder[]
): void {
  const expandIcon = folderHeader.querySelector('.expand-icon') as HTMLElement;
  const subfoldersContainer = folderElement.querySelector(
    '.subfolders-container'
  ) as HTMLElement;
  const bookmarkList = folderElement.querySelector(
    '.bookmark-list'
  ) as HTMLElement;

  if (expandIcon) {
    expandIcon.textContent = folder.expanded ? '📂' : '📁';
    if (folder.expanded) {
      expandIcon.classList.add('expanded');
    } else {
      expandIcon.classList.remove('expanded');
    }
  }

  if (subfoldersContainer) {
    if (folder.expanded) {
      // 展開時の処理
      subfoldersContainer.style.display = 'block';
      subfoldersContainer.classList.remove('collapsed');
      subfoldersContainer.classList.add('expanded');

      // 内部の子フォルダも表示
      const childFolders =
        subfoldersContainer.querySelectorAll('.bookmark-folder');
      for (const child of childFolders) {
        const childElement = child as HTMLElement;
        childElement.style.display = 'block';

        // 展開時はpreserve-visibleクラスを削除（通常の表示制御に戻す）
        childElement.classList.remove('preserve-visible');

        // サブフォルダなしの子フォルダのブックマークリストは個別の展開状態に従って表示
        // ただし、親フォルダが展開されているときのみUI状態を復元する
        const hasSubfoldersClass = childElement.querySelector(
          '.folder-header.has-subfolders'
        );
        const hasBookmarksClass = childElement.querySelector(
          '.folder-header.has-bookmarks'
        );

        if (!hasSubfoldersClass && hasBookmarksClass) {
          const folderId = childElement.getAttribute('data-folder-id');
          if (folderId) {
            // 子フォルダの実際の展開状態を取得（深い検索は避ける）
            const childFolder = findFolderById(allBookmarks, folderId);

            if (childFolder) {
              const bookmarkList = childElement.querySelector(
                '.bookmark-list'
              ) as HTMLElement;
              const expandIcon = childElement.querySelector(
                '.expand-icon'
              ) as HTMLElement;

              if (bookmarkList) {
                bookmarkList.style.display = childFolder.expanded
                  ? 'block'
                  : 'none';
                bookmarkList.classList.toggle('expanded', childFolder.expanded);
                bookmarkList.classList.toggle(
                  'collapsed',
                  !childFolder.expanded
                );
              }

              if (expandIcon) {
                expandIcon.textContent = childFolder.expanded ? '📂' : '📁';
                expandIcon.classList.toggle('expanded', childFolder.expanded);
              }
            }
          }
        }
      }
    } else {
      // 折りたたみ時の処理
      subfoldersContainer.classList.remove('expanded');
      subfoldersContainer.classList.add('collapsed');

      // 親フォルダが折りたたまれた時は、すべての子フォルダを非表示にする
      // 重要：子フォルダの内部状態（expanded）は一切変更しない
      const childFolders =
        subfoldersContainer.querySelectorAll('.bookmark-folder');

      for (const child of childFolders) {
        const childElement = child as HTMLElement;

        // すべての子フォルダを非表示にする
        childElement.classList.remove('preserve-visible');
        childElement.style.display = 'none';

        // 重要：子フォルダの内部状態（expanded状態）は一切変更しない
        // 表示/非表示のみを制御し、フォルダのexpanded状態やUI状態は保持する
      }

      // サブフォルダコンテナも非表示にする
      subfoldersContainer.style.display = 'none';
    }
  }

  // ブックマークリストの制御を追加
  if (bookmarkList) {
    if (folder.expanded) {
      // 展開時の処理
      bookmarkList.style.display = 'block';
      bookmarkList.classList.remove('collapsed');
      bookmarkList.classList.add('expanded');
    } else {
      // 折りたたみ時の処理
      bookmarkList.classList.remove('expanded');
      bookmarkList.classList.add('collapsed');
      bookmarkList.style.display = 'none';
    }
  }
}

/**
 * ブックマークリストのUIを更新する関数（サブフォルダなしフォルダ用）
 */
export function updateBookmarkListUI(
  folderHeader: HTMLElement,
  folderElement: HTMLElement,
  folder: BookmarkFolder
): void {
  const expandIcon = folderHeader.querySelector('.expand-icon') as HTMLElement;
  const bookmarkList = folderElement.querySelector(
    '.bookmark-list'
  ) as HTMLElement;

  if (expandIcon) {
    expandIcon.textContent = folder.expanded ? '📂' : '📁';
    if (folder.expanded) {
      expandIcon.classList.add('expanded');
    } else {
      expandIcon.classList.remove('expanded');
    }
  }

  if (bookmarkList) {
    if (folder.expanded) {
      // 展開時の処理
      bookmarkList.style.display = 'block';
      bookmarkList.classList.remove('collapsed');
      bookmarkList.classList.add('expanded');
    } else {
      // 折りたたみ時の処理
      bookmarkList.classList.remove('expanded');
      bookmarkList.classList.add('collapsed');
      bookmarkList.style.display = 'none';
    }
  }
}

/**
 * ブックマークを表示する関数（テスト可能版）
 */
export async function displayBookmarksTestable(
  folders: BookmarkFolder[],
  container: HTMLElement
): Promise<void> {
  if (folders.length === 0) {
    container.innerHTML =
      '<div class="no-results">ブックマークが見つかりませんでした。</div>';
    return;
  }

  const html = folders.map((folder) => renderFolder(folder)).join('');
  container.innerHTML = html;

  // イベントリスナーを設定
  setupFolderClickHandler(container, folders);
}

/**
 * ブックマーク削除の処理を行う関数
 */
export async function handleBookmarkDelete(
  deleteBtn: HTMLElement
): Promise<void> {
  const url = deleteBtn.getAttribute('data-bookmark-url');
  const title = deleteBtn.getAttribute('data-bookmark-title');

  if (!url || !title) {
    console.error('❌ ブックマークのURLまたはタイトルが取得できませんでした');
    return;
  }

  // 削除確認ダイアログを表示
  const confirmed = confirm(`ブックマーク「${title}」を削除しますか？`);

  if (!confirmed) {
    return;
  }

  try {
    // Chrome APIを使用してブックマークを削除
    const bookmarks = await chrome.bookmarks.search({ url: url });

    if (bookmarks.length === 0) {
      console.error('❌ 削除対象のブックマークが見つかりませんでした');
      return;
    }

    // 最初に見つかったブックマークを削除
    await chrome.bookmarks.remove(bookmarks[0].id);

    // 削除後、ページを再読み込みして表示を更新
    window.location.reload();
  } catch (error) {
    console.error('❌ ブックマークの削除に失敗しました:', error);
    alert('ブックマークの削除に失敗しました。');
  }
}

/**
 * ブックマーク編集の処理を行う関数
 */
export async function handleBookmarkEdit(editBtn: HTMLElement): Promise<void> {
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
    const allFolders = await getAllFolders();

    // 編集ダイアログを表示
    showEditDialog(bookmark, allFolders);
  } catch (error) {
    console.error('❌ ブックマークの編集準備に失敗しました:', error);
    alert('ブックマークの編集準備に失敗しました。');
  }
}

/**
 * すべてのフォルダーを取得する関数
 */
async function getAllFolders(): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const bookmarkTree = await chrome.bookmarks.getTree();
  const folders: chrome.bookmarks.BookmarkTreeNode[] = [];

  function collectFolders(nodes: chrome.bookmarks.BookmarkTreeNode[]) {
    for (const node of nodes) {
      if (node.children && !node.url) {
        // フォルダー（URLがない）の場合
        folders.push(node);
        collectFolders(node.children);
      }
    }
  }

  collectFolders(bookmarkTree);
  return folders;
}

/**
 * 編集ダイアログを表示する関数
 */
function showEditDialog(
  bookmark: chrome.bookmarks.BookmarkTreeNode,
  folders: chrome.bookmarks.BookmarkTreeNode[]
): void {
  // 既存のダイアログがあれば削除
  const existingDialog = document.getElementById('edit-dialog');
  if (existingDialog) {
    existingDialog.remove();
  }

  // ダイアログのHTML作成
  const dialogHTML = `
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
              ${folders
                .map(
                  (folder) => `
                <option value="${folder.id}" ${folder.id === bookmark.parentId ? 'selected' : ''}>
                  ${escapeHtml(folder.title)}
                </option>
              `
                )
                .join('')}
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

  // ダイアログをDOMに追加
  document.body.insertAdjacentHTML('beforeend', dialogHTML);

  // イベントリスナーを設定
  setupEditDialogEvents(bookmark);
}

/**
 * 編集ダイアログのイベントを設定する関数
 */
function setupEditDialogEvents(
  bookmark: chrome.bookmarks.BookmarkTreeNode
): void {
  const dialog = document.getElementById('edit-dialog');
  const closeBtn = dialog?.querySelector('.edit-dialog-close');
  const cancelBtn = dialog?.querySelector('.edit-dialog-cancel');
  const saveBtn = dialog?.querySelector('.edit-dialog-save');
  const overlay = dialog;

  // 閉じるボタン
  closeBtn?.addEventListener('click', closeEditDialog);
  cancelBtn?.addEventListener('click', closeEditDialog);

  // オーバーレイクリックで閉じる
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeEditDialog();
    }
  });

  // 保存ボタン
  saveBtn?.addEventListener('click', async () => {
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
      await chrome.bookmarks.update(bookmark.id, {
        title: newTitle,
        url: newUrl,
      });

      // フォルダーが変更された場合は移動
      if (newParentId !== bookmark.parentId) {
        await chrome.bookmarks.move(bookmark.id, {
          parentId: newParentId,
        });
      }

      closeEditDialog();

      // ページを再読み込みして表示を更新
      window.location.reload();
    } catch (error) {
      console.error('❌ ブックマークの更新に失敗しました:', error);
      alert('ブックマークの更新に失敗しました。');
    }
  });

  // ESCキーで閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeEditDialog();
    }
  });
}

/**
 * 編集ダイアログを閉じる関数
 */
function closeEditDialog(): void {
  const dialog = document.getElementById('edit-dialog');
  if (dialog) {
    dialog.remove();
  }
}
