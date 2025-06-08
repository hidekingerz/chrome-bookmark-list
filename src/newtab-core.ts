// newtab.tsの主要機能をテスト可能にするため、分離したモジュール

import { BookmarkFolder } from './types.js';
import { escapeHtml, findFolderById, getTotalBookmarks } from './utils.js';

/**
 * フォルダをHTMLに変換する関数
 */
export function renderFolder(folder: BookmarkFolder, level: number = 0): string {
    const hasSubfolders = folder.subfolders.length > 0;
    const hasBookmarks = folder.bookmarks.length > 0;
    const totalBookmarks = folder.bookmarks.length + folder.subfolders.reduce((sum, sub) => sum + getTotalBookmarks(sub), 0);
    
    // レベル1以上のサブフォルダなしフォルダは、親フォルダが折りたたまれていても表示を維持
    const shouldHide = level > 0 && hasSubfolders && !folder.expanded;
    
    return `
        <div class="bookmark-folder ${shouldHide ? 'hidden' : ''}" data-level="${level}" data-folder-id="${folder.id}">
            <div class="folder-header ${hasSubfolders ? 'has-subfolders' : hasBookmarks ? 'has-bookmarks' : ''}">
                <div class="folder-info">
                    ${hasSubfolders ? 
                        `<span class="expand-icon ${folder.expanded ? 'expanded' : ''}" style="transform: ${folder.expanded ? 'rotate(90deg)' : 'rotate(0deg)'}">${folder.expanded ? '📂' : '📁'}</span>` : 
                        hasBookmarks ? 
                            `<span class="expand-icon ${folder.expanded ? 'expanded' : ''}" style="transform: ${folder.expanded ? 'rotate(90deg)' : 'rotate(0deg)'}">${folder.expanded ? '📂' : '📁'}</span>` :
                            '<span class="folder-icon">📄</span>'
                    }
                    <h2 class="folder-title">${escapeHtml(folder.title)}</h2>
                    ${hasSubfolders ? `<span class="subfolder-count">${folder.subfolders.length}個のフォルダ</span>` : ''}
                </div>
                <span class="bookmark-count">${totalBookmarks}</span>
            </div>
            
            ${hasBookmarks ? `
                <ul class="bookmark-list ${folder.expanded ? 'expanded' : 'collapsed'}" style="display: ${folder.expanded ? 'block' : 'none'}">
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
                <div class="subfolders-container ${folder.expanded ? 'expanded' : 'collapsed'}" style="display: ${folder.expanded ? 'block' : 'none'};">
                    ${folder.subfolders.map(subfolder => renderFolder(subfolder, level + 1)).join('')}
                </div>
            ` : ''}
        </div>
    `;
}

/**
 * フォルダクリックのイベントハンドラーを設定する関数
 */
export function setupFolderClickHandler(container: HTMLElement, allBookmarks: BookmarkFolder[]): void {
    console.log('DEBUG: setupFolderClickHandler called', { 
        containerId: container.id,
        containerClassName: container.className,
        allBookmarksCount: allBookmarks.length,
        folderHeaderCount: container.querySelectorAll('.folder-header').length
    });
    
    container.addEventListener('click', (e: Event) => {
        const target = e.target as HTMLElement;
        const folderHeader = target.closest('.folder-header') as HTMLElement | null;
        const bookmarkLink = target.closest('.bookmark-link') as HTMLElement | null;
        
        console.log('DEBUG: Click event detected:', { 
            targetTag: target.tagName,
            targetClass: target.className,
            targetText: target.textContent?.trim().substring(0, 30) + '...',
            targetId: target.id,
            folderHeader: folderHeader ? 'found' : 'not found',
            folderHeaderClass: folderHeader?.className,
            bookmarkLink: bookmarkLink ? 'found' : 'not found',
            hasSubfolders: folderHeader?.classList.contains('has-subfolders'),
            eventPhase: e.eventPhase,
            bubbles: e.bubbles,
            cancelable: e.cancelable
        });
        
        // クリックされた要素の親階層をデバッグ出力
        let currentElement = target;
        const hierarchy: string[] = [];
        while (currentElement && currentElement !== container && hierarchy.length < 10) {
            hierarchy.push(`${currentElement.tagName}.${currentElement.className.replace(/\s+/g, '.')}`);
            currentElement = currentElement.parentElement as HTMLElement;
        }
        console.log('DEBUG: Element hierarchy:', hierarchy);
        
        if (bookmarkLink) {
            e.preventDefault();
            const url = bookmarkLink.getAttribute('data-url');
            console.log('DEBUG: Bookmark link clicked:', url);
            if (url) {
                chrome.tabs.create({ url: url });
            }
        } else if (folderHeader && !target.closest('.bookmark-link')) {
            e.preventDefault();
            e.stopPropagation();
            
            console.log('DEBUG: Folder header clicked');
            
            const folderElement = folderHeader.closest('.bookmark-folder') as HTMLElement;
            const folderId = folderElement?.getAttribute('data-folder-id');
            
            console.log('DEBUG: Folder element and ID:', { 
                folderElement: folderElement ? 'found' : 'not found',
                folderId: folderId,
                folderElementClass: folderElement?.className
            });
            
            if (folderId) {
                let folder = findFolderById(allBookmarks, folderId);
                
                // フォルダが見つからない場合のフォールバック検索
                if (!folder) {
                    console.log('DEBUG: Folder not found in top level, searching deeper...');
                    function deepSearch(folders: BookmarkFolder[]): BookmarkFolder | null {
                        for (const f of folders) {
                            if (f.id === folderId) return f;
                            const found = deepSearch(f.subfolders);
                            if (found) return found;
                        }
                        return null;
                    }
                    folder = deepSearch(allBookmarks);
                }
                
                console.log('DEBUG: Found folder:', folder ? {
                    title: folder.title,
                    id: folder.id,
                    subfolderCount: folder.subfolders.length,
                    hasSubfolders: folder.subfolders.length > 0,
                    currentExpanded: folder.expanded
                } : 'null');
                
                if (folder) {
                    // サブフォルダがある場合：そのフォルダを展開/折りたたみ
                    if (folder.subfolders.length > 0) {
                        console.log('DEBUG: Toggling folder state (has subfolders):', {
                            before: folder.expanded,
                            after: !folder.expanded,
                            hasSubfolders: true
                        });
                        // 展開状態を切り替え
                        folder.expanded = !folder.expanded;
                        
                        // UI要素を更新
                        updateFolderUI(folderHeader, folderElement, folder, allBookmarks);
                        
                        console.log('DEBUG: UI update completed for folder:', folder.title);
                    } else if (folder.bookmarks.length > 0) {
                        // サブフォルダはないがブックマークがある場合：ブックマークリストを展開/折りたたみ
                        console.log('DEBUG: Toggling bookmark list for folder with no subfolders:', {
                            before: folder.expanded,
                            hasBookmarks: true,
                            bookmarkCount: folder.bookmarks.length,
                            folderId: folder.id
                        });
                        
                        // 展開状態を切り替え（詳細デバッグ）
                        const oldExpanded = folder.expanded;
                        folder.expanded = !folder.expanded;
                        console.log('DEBUG: Folder state change:', {
                            oldExpanded: oldExpanded,
                            newExpanded: folder.expanded,
                            wasToggled: oldExpanded !== folder.expanded
                        });
                        
                        // UI要素を更新（ブックマークリスト用）
                        updateBookmarkListUI(folderHeader, folderElement, folder);
                        
                        console.log('DEBUG: Bookmark list UI update completed for folder:', folder.title);
                        
                        // デバッグ: 3層目フォルダ操作後の他フォルダの状態を確認
                        if (folder.id === '300') {
                            console.log('DEBUG: 3層目フォルダ操作完了後の2層目フォルダAの状態確認');
                            const layer2FolderA = findFolderById(allBookmarks, '200');
                            console.log('DEBUG: 2層目フォルダA状態:', {
                                found: !!layer2FolderA,
                                expanded: layer2FolderA?.expanded,
                                title: layer2FolderA?.title
                            });
                        }
                    } else {
                        // サブフォルダもブックマークもない場合：何もしない
                        console.log('DEBUG: Empty folder clicked - no action taken:', folder.title);
                    }
                } else {
                    console.log('DEBUG: Folder not found, cannot toggle');
                }
            }
        }
    });
}

/**
 * フォルダのUIを更新する関数
 */
export function updateFolderUI(folderHeader: HTMLElement, folderElement: HTMLElement, folder: BookmarkFolder, allBookmarks: BookmarkFolder[]): void {
    console.log('DEBUG: updateFolderUI called for folder:', {
        folderTitle: folder.title,
        folderId: folder.id,
        expanded: folder.expanded,
        subfolderCount: folder.subfolders.length,
        bookmarkCount: folder.bookmarks.length
    });
    
    const expandIcon = folderHeader.querySelector('.expand-icon') as HTMLElement;
    const subfoldersContainer = folderElement.querySelector('.subfolders-container') as HTMLElement;
    const bookmarkList = folderElement.querySelector('.bookmark-list') as HTMLElement;
    
    console.log('DEBUG: UI elements found:', {
        expandIcon: expandIcon ? 'found' : 'not found',
        subfoldersContainer: subfoldersContainer ? 'found' : 'not found',
        bookmarkList: bookmarkList ? 'found' : 'not found',
        subfoldersContainerClass: subfoldersContainer?.className,
        subfoldersContainerDisplay: subfoldersContainer?.style.display,
        bookmarkListDisplay: bookmarkList?.style.display
    });
    
    if (expandIcon) {
        const oldIcon = expandIcon.textContent;
        expandIcon.textContent = folder.expanded ? '📂' : '📁';
        if (folder.expanded) {
            expandIcon.classList.add('expanded');
        } else {
            expandIcon.classList.remove('expanded');
        }
        console.log('DEBUG: Expand icon updated:', {
            oldIcon: oldIcon,
            newIcon: expandIcon.textContent,
            expanded: folder.expanded,
            classes: expandIcon.className
        });
    } else {
        console.log('DEBUG: Expand icon not found!');
    }
    
    if (subfoldersContainer) {
        if (folder.expanded) {
            // 展開時の処理
            console.log('DEBUG: Expanding subfolders container');
            subfoldersContainer.style.display = 'block';
            subfoldersContainer.classList.remove('collapsed');
            subfoldersContainer.classList.add('expanded');
            
            // 内部の子フォルダも表示
            const childFolders = subfoldersContainer.querySelectorAll('.bookmark-folder');
            console.log('DEBUG: Found child folders:', childFolders.length);
            childFolders.forEach(child => {
                const childElement = child as HTMLElement;
                childElement.style.display = 'block';
                
                // 展開時はpreserve-visibleクラスを削除（通常の表示制御に戻す）
                childElement.classList.remove('preserve-visible');
                
                // サブフォルダなしの子フォルダのブックマークリストは個別の展開状態に従って表示
                // ただし、親フォルダが展開されているときのみUI状態を復元する
                const hasSubfoldersClass = childElement.querySelector('.folder-header.has-subfolders');
                const hasBookmarksClass = childElement.querySelector('.folder-header.has-bookmarks');
                
                if (!hasSubfoldersClass && hasBookmarksClass) {
                    const folderId = childElement.getAttribute('data-folder-id');
                    if (folderId) {
                        // 子フォルダの実際の展開状態を取得（深い検索は避ける）
                        const childFolder = findFolderById(allBookmarks, folderId);
                        
                        if (childFolder) {
                            const bookmarkList = childElement.querySelector('.bookmark-list') as HTMLElement;
                            const expandIcon = childElement.querySelector('.expand-icon') as HTMLElement;
                            
                            if (bookmarkList) {
                                bookmarkList.style.display = childFolder.expanded ? 'block' : 'none';
                                bookmarkList.classList.toggle('expanded', childFolder.expanded);
                                bookmarkList.classList.toggle('collapsed', !childFolder.expanded);
                            }
                            
                            if (expandIcon) {
                                expandIcon.textContent = childFolder.expanded ? '📂' : '📁';
                                expandIcon.classList.toggle('expanded', childFolder.expanded);
                            }
                            
                            console.log('DEBUG: Restored bookmark list state for child folder:', {
                                folderId: folderId,
                                expanded: childFolder.expanded
                            });
                        }
                    }
                }
            });
        } else {
            // 折りたたみ時の処理
            console.log('DEBUG: Collapsing subfolders container');
            subfoldersContainer.classList.remove('expanded');
            subfoldersContainer.classList.add('collapsed');
            
            // 親フォルダが折りたたまれた時は、すべての子フォルダを非表示にする
            // 重要：子フォルダの内部状態（expanded）は一切変更しない
            const childFolders = subfoldersContainer.querySelectorAll('.bookmark-folder');
            console.log('DEBUG: Processing child folders during collapse:', childFolders.length);
            
            childFolders.forEach(child => {
                const childElement = child as HTMLElement;
                const childId = childElement.getAttribute('data-folder-id');
                
                console.log('DEBUG: Hiding child folder during parent collapse:', childId);
                
                // すべての子フォルダを非表示にする
                childElement.classList.remove('preserve-visible');
                childElement.style.display = 'none';
                
                // 重要：子フォルダの内部状態（expanded状態）は一切変更しない
                // 表示/非表示のみを制御し、フォルダのexpanded状態やUI状態は保持する
            });
            
            // サブフォルダコンテナも非表示にする
            console.log('DEBUG: Hiding subfolders container');
            subfoldersContainer.style.display = 'none';
        }
    } else {
        console.log('DEBUG: Subfolders container not found!');
    }
    
    // ブックマークリストの制御を追加
    if (bookmarkList) {
        if (folder.expanded) {
            // 展開時の処理
            console.log('DEBUG: Expanding bookmark list');
            bookmarkList.style.display = 'block';
            bookmarkList.classList.remove('collapsed');
            bookmarkList.classList.add('expanded');
        } else {
            // 折りたたみ時の処理
            console.log('DEBUG: Collapsing bookmark list');
            bookmarkList.classList.remove('expanded');
            bookmarkList.classList.add('collapsed');
            bookmarkList.style.display = 'none';
        }
    } else {
        console.log('DEBUG: Bookmark list not found (this folder may not have bookmarks)');
    }
}

/**
 * ブックマークリストのUIを更新する関数（サブフォルダなしフォルダ用）
 */
export function updateBookmarkListUI(folderHeader: HTMLElement, folderElement: HTMLElement, folder: BookmarkFolder): void {
    console.log('DEBUG: updateBookmarkListUI called for folder:', {
        folderTitle: folder.title,
        folderId: folder.id,
        expanded: folder.expanded,
        bookmarkCount: folder.bookmarks.length
    });
    
    const expandIcon = folderHeader.querySelector('.expand-icon') as HTMLElement;
    const bookmarkList = folderElement.querySelector('.bookmark-list') as HTMLElement;
    
    console.log('DEBUG: UI elements found for bookmark list:', {
        expandIcon: expandIcon ? 'found' : 'not found',
        bookmarkList: bookmarkList ? 'found' : 'not found',
        bookmarkListClass: bookmarkList?.className,
        bookmarkListDisplay: bookmarkList?.style.display
    });
    
    if (expandIcon) {
        const oldIcon = expandIcon.textContent;
        expandIcon.textContent = folder.expanded ? '📂' : '📁';
        if (folder.expanded) {
            expandIcon.classList.add('expanded');
        } else {
            expandIcon.classList.remove('expanded');
        }
        console.log('DEBUG: Expand icon updated for bookmark list:', {
            oldIcon: oldIcon,
            newIcon: expandIcon.textContent,
            expanded: folder.expanded,
            classes: expandIcon.className
        });
    } else {
        console.log('DEBUG: Expand icon not found for bookmark list!');
    }
    
    if (bookmarkList) {
        if (folder.expanded) {
            // 展開時の処理
            console.log('DEBUG: Expanding bookmark list');
            bookmarkList.style.display = 'block';
            bookmarkList.classList.remove('collapsed');
            bookmarkList.classList.add('expanded');
        } else {
            // 折りたたみ時の処理
            console.log('DEBUG: Collapsing bookmark list');
            bookmarkList.classList.remove('expanded');
            bookmarkList.classList.add('collapsed');
            bookmarkList.style.display = 'none';
        }
    } else {
        console.log('DEBUG: Bookmark list not found!');
    }
}

/**
 * ブックマークを表示する関数（テスト可能版）
 */
export async function displayBookmarksTestable(folders: BookmarkFolder[], container: HTMLElement): Promise<void> {
    if (folders.length === 0) {
        container.innerHTML = '<div class="no-results">ブックマークが見つかりませんでした。</div>';
        return;
    }

    const html = folders.map(folder => renderFolder(folder)).join('');
    container.innerHTML = html;
    
    // イベントリスナーを設定
    setupFolderClickHandler(container, folders);
}
