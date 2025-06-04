import { BookmarkFolder, ChromeBookmarkNode } from './types.js';
import {
    escapeHtml,
    filterBookmarks,
    findFolderById,
    getFavicon,
    getTotalBookmarks,
    initFaviconCache,
    processBookmarkTree
} from './utils.js';

// グローバル変数として定義
let allBookmarks: BookmarkFolder[] = [];

// ブックマークデータを取得して表示する
document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
    const bookmarkContainer = document.getElementById('bookmark-list') as HTMLElement;
    const searchInput = document.getElementById('search-input') as HTMLInputElement;
    
    // Favicon キャッシュの初期化
    await initFaviconCache();
    
    try {
        // Chromeのブックマークを取得
        const bookmarkTree: ChromeBookmarkNode[] = await chrome.bookmarks.getTree();
        allBookmarks = processBookmarkTree(bookmarkTree);
        await displayBookmarks(allBookmarks);
        
        // 検索機能
        searchInput.addEventListener('input', async (e: Event): Promise<void> => {
            const target = e.target as HTMLInputElement;
            const searchTerm = target.value.toLowerCase();
            const filteredBookmarks = filterBookmarks(allBookmarks, searchTerm);
            await displayBookmarks(filteredBookmarks);
        });
        
    } catch (error) {
        console.error('ブックマークの取得に失敗しました:', error);
        bookmarkContainer.innerHTML = '<div class="loading">ブックマークの読み込みに失敗しました。</div>';
    }
});

// ブックマークを表示
async function displayBookmarks(folders: BookmarkFolder[]): Promise<void> {
    const bookmarkContainer = document.getElementById('bookmarkContainer') as HTMLElement;
    
    if (folders.length === 0) {
        bookmarkContainer.innerHTML = '<div class="no-results">ブックマークが見つかりませんでした。</div>';
        return;
    }

    // まず基本構造をレンダリング
    function renderFolder(folder: BookmarkFolder, level: number = 0): string {
        const hasSubfolders = folder.subfolders.length > 0;
        const totalBookmarks = folder.bookmarks.length + folder.subfolders.reduce((sum, sub) => sum + getTotalBookmarks(sub), 0);
        
        return `
            <div class="bookmark-folder ${level > 0 && !folder.expanded ? 'hidden' : ''}" data-level="${level}" data-folder-id="${folder.id}">
                <div class="folder-header" ${hasSubfolders ? 'style="cursor: pointer;"' : ''}>
                    <div class="folder-info">
                        ${hasSubfolders ? `<span class="expand-icon ${folder.expanded ? 'expanded' : ''}">${folder.expanded ? '📂' : '📁'}</span>` : '<span class="folder-icon">📄</span>'}
                        <h2 class="folder-title">${escapeHtml(folder.title)}</h2>
                        ${hasSubfolders ? `<span class="subfolder-count">${folder.subfolders.length}個のフォルダ</span>` : ''}
                    </div>
                    <span class="bookmark-count">${totalBookmarks}</span>
                </div>
                
                ${folder.bookmarks.length > 0 ? `
                    <ul class="bookmark-list">
                        ${folder.bookmarks.map(bookmark => `
                            <li class="bookmark-item">
                                <a href="#" class="bookmark-link" data-url="${escapeHtml(bookmark.url)}">
                                    <div class="bookmark-favicon-container">
                                        <div class="favicon-placeholder">🔗</div>
                                        <img class="bookmark-favicon hidden" alt="" data-bookmark-url="${escapeHtml(bookmark.url)}">
                                    </div>
                                    <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
                                </a>
                            </li>
                        `).join('')}
                    </ul>
                ` : ''}
                
                ${hasSubfolders ? `
                    <div class="subfolder-list">
                        <ul class="subfolder-items">
                            ${folder.subfolders.map(subfolder => {
                                const subfolderBookmarkCount = getTotalBookmarks(subfolder);
                                return `
                                    <li class="subfolder-item">
                                        <div class="subfolder-header" data-subfolder-id="${subfolder.id}">
                                            <span class="subfolder-expand-icon ${subfolder.expanded ? 'expanded' : ''}">${subfolder.expanded ? '📂' : '📁'}</span>
                                            <span class="subfolder-name">${escapeHtml(subfolder.title)}</span>
                                            <span class="subfolder-bookmark-count">${subfolderBookmarkCount}</span>
                                        </div>
                                    </li>
                                `;
                            }).join('')}
                        </ul>
                    </div>
                    <div class="subfolders-container ${folder.expanded ? 'expanded' : 'collapsed'}">
                        ${folder.subfolders.map(subfolder => renderFolder(subfolder, level + 1)).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }
    
    const html = folders.map(folder => renderFolder(folder)).join('');
    bookmarkContainer.innerHTML = html;
    
    // Favicon を非同期で読み込み
    await loadFavicons();
    
    // フォルダクリックイベントを設定
    bookmarkContainer.addEventListener('click', (e: Event) => {
        const target = e.target as HTMLElement;
        const folderHeader = target.closest('.folder-header') as HTMLElement | null;
        const subfolderHeader = target.closest('.subfolder-header') as HTMLElement | null;
        const bookmarkLink = target.closest('.bookmark-link') as HTMLElement | null;
        
        if (bookmarkLink) {
            e.preventDefault();
            const url = bookmarkLink.getAttribute('data-url');
            if (url) {
                chrome.tabs.create({ url: url });
            }
        } else if (subfolderHeader) {
            // 子フォルダのクリック処理
            e.preventDefault();
            const subfolderId = subfolderHeader.getAttribute('data-subfolder-id');
            const parentFolderElement = subfolderHeader.closest('.bookmark-folder') as HTMLElement;
            const parentFolderId = parentFolderElement.getAttribute('data-folder-id');
            
            if (parentFolderId && subfolderId) {
                const parentFolder = findFolderById(allBookmarks, parentFolderId);
                const subfolder = parentFolder ? findFolderById(parentFolder.subfolders, subfolderId) : null;
                
                if (subfolder) {
                    // 子フォルダの表示状態を切り替え
                    subfolder.expanded = !subfolder.expanded;
                    
                    // サブフォルダリスト内のアイコンを更新
                    const expandIcon = subfolderHeader.querySelector('.subfolder-expand-icon') as HTMLElement;
                    if (expandIcon) {
                        expandIcon.textContent = subfolder.expanded ? '📂' : '📁';
                        expandIcon.classList.toggle('expanded');
                    }
                    
                    // 親フォルダも展開状態にする（子フォルダの内容を表示するため）
                    if (subfolder.expanded && parentFolder) {
                        parentFolder.expanded = true;
                        
                        // 親フォルダの展開状態も更新
                        const parentExpandIcon = parentFolderElement.querySelector('.expand-icon') as HTMLElement;
                        const parentSubfoldersContainer = parentFolderElement.querySelector('.subfolders-container') as HTMLElement;
                        
                        if (parentExpandIcon && parentSubfoldersContainer) {
                            parentExpandIcon.textContent = '📂';
                            parentExpandIcon.classList.add('expanded');
                            parentSubfoldersContainer.classList.add('expanded');
                            parentSubfoldersContainer.classList.remove('collapsed');
                        }
                    }
                    
                    // 対象の子フォルダのコンテナを探して表示/非表示を切り替え
                    const subfolderContainers = parentFolderElement.querySelectorAll('.subfolders-container .bookmark-folder') as NodeListOf<HTMLElement>;
                    subfolderContainers.forEach(container => {
                        if (container.getAttribute('data-folder-id') === subfolderId) {
                            if (subfolder.expanded) {
                                container.classList.remove('hidden');
                            } else {
                                container.classList.add('hidden');
                            }
                        }
                    });
                }
            }
        } else if (folderHeader) {
            const folderElement = folderHeader.closest('.bookmark-folder') as HTMLElement;
            const folderId = folderElement.getAttribute('data-folder-id');
            const expandIcon = folderHeader.querySelector('.expand-icon') as HTMLElement;
            const subfoldersContainer = folderElement.querySelector('.subfolders-container') as HTMLElement;
            
            if (expandIcon && subfoldersContainer && folderId) {
                const folder = findFolderById(allBookmarks, folderId);
                if (folder) {
                    folder.expanded = !folder.expanded;
                    expandIcon.textContent = folder.expanded ? '📂' : '📁';
                    expandIcon.classList.toggle('expanded');
                    subfoldersContainer.classList.toggle('expanded');
                    subfoldersContainer.classList.toggle('collapsed');
                }
            }
        }
    });
}

// Favicon を非同期で読み込む
async function loadFavicons(): Promise<void> {
    const faviconImages = document.querySelectorAll('.bookmark-favicon') as NodeListOf<HTMLImageElement>;
    const faviconPlaceholders = document.querySelectorAll('.favicon-placeholder') as NodeListOf<HTMLElement>;
    
    // プロミスの配列を作成（並列処理のため）
    const faviconPromises = Array.from(faviconImages).map(async (img, index) => {
        const url = img.getAttribute('data-bookmark-url');
        const placeholder = faviconPlaceholders[index];
        
        if (url) {
            try {
                const faviconUrl = await getFavicon(url);
                img.src = faviconUrl;
                img.onload = () => {
                    img.classList.remove('hidden');
                    if (placeholder) placeholder.style.display = 'none';
                };
                img.onerror = () => {
                    // エラーの場合はプレースホルダーを表示
                    if (placeholder) {
                        placeholder.textContent = '🌐';
                        placeholder.style.display = 'block';
                    }
                };
            } catch (error) {
                console.warn('Favicon 読み込みエラー:', url, error);
                if (placeholder) {
                    placeholder.textContent = '🌐';
                    placeholder.style.display = 'block';
                }
            }
        }
    });
    
    // すべてのfavicon読み込みが完了するのを待つ（最大5秒）
    try {
        await Promise.allSettled(faviconPromises);
    } catch (error) {
        console.warn('一部のfaviconの読み込みに失敗しました:', error);
    }
}
