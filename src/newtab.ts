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
        const hasBookmarks = folder.bookmarks.length > 0;
        const hasContent = hasSubfolders || hasBookmarks;
        const totalBookmarks = folder.bookmarks.length + folder.subfolders.reduce((sum, sub) => sum + getTotalBookmarks(sub), 0);
        
        return `
            <div class="bookmark-folder" data-folder-id="${folder.id}">
                <div class="folder-header" ${hasContent ? 'style="cursor: pointer;"' : ''}>
                    <div class="folder-info">
                        ${hasContent ? `<span class="expand-icon ${folder.expanded ? 'expanded' : ''}">${folder.expanded ? '📂' : '📁'}</span>` : '<span class="folder-icon">📄</span>'}
                        <h2 class="folder-title">${escapeHtml(folder.title)}</h2>
                        ${hasSubfolders ? `<span class="subfolder-count">${folder.subfolders.length}個のフォルダ</span>` : ''}
                    </div>
                    <span class="bookmark-count">${totalBookmarks}</span>
                </div>
                
                <div class="folder-content ${folder.expanded ? 'expanded' : 'collapsed'}">
                    ${hasBookmarks ? `
                        <ul class="bookmark-list">
                            ${folder.bookmarks.map(bookmark => `
                                <li class="bookmark-item">
                                    <a href="#" class="bookmark-link" data-url="${escapeHtml(bookmark.url)}">
                                        <div class="bookmark-content">
                                            <div class="bookmark-header">
                                                <div class="bookmark-favicon-container">
                                                    <div class="favicon-placeholder">🔗</div>
                                                    <img class="bookmark-favicon hidden" alt="" data-bookmark-url="${escapeHtml(bookmark.url)}">
                                                </div>
                                                <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
                                            </div>
                                            <div class="bookmark-url">${escapeHtml(bookmark.url)}</div>
                                        </div>
                                    </a>
                                </li>
                            `).join('')}
                        </ul>
                    ` : ''}
                    
                    ${hasSubfolders ? `
                        <div class="subfolders-container">
                            ${folder.subfolders.map(subfolder => renderFolder(subfolder, level + 1)).join('')}
                        </div>
                    ` : ''}
                </div>
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
        const bookmarkLink = target.closest('.bookmark-link') as HTMLElement | null;
        
        if (bookmarkLink) {
            e.preventDefault();
            const url = bookmarkLink.getAttribute('data-url');
            if (url) {
                chrome.tabs.create({ url: url });
            }
        } else if (folderHeader) {
            e.preventDefault();
            const folderElement = folderHeader.closest('.bookmark-folder') as HTMLElement;
            const folderId = folderElement.getAttribute('data-folder-id');
            
            // 全てのフォルダ（親・子関係なく）で展開/折りたたみ処理を行う
            const expandIcon = folderHeader.querySelector('.expand-icon') as HTMLElement;
            const folderContent = folderElement.querySelector('.folder-content') as HTMLElement;
            
            if (folderId) {
                const folder = findFolderById(allBookmarks, folderId);
                
                if (folder) {
                    // 展開アイコンがない場合（コンテンツがない場合）は何もしない
                    if (!expandIcon) {
                        return;
                    }
                    
                    // 展開状態を切り替え
                    folder.expanded = !folder.expanded;
                    
                    // アイコンとクラスを更新
                    expandIcon.textContent = folder.expanded ? '📂' : '📁';
                    expandIcon.classList.toggle('expanded');
                    
                    if (folderContent) {
                        folderContent.classList.toggle('expanded');
                        folderContent.classList.toggle('collapsed');
                    }
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
