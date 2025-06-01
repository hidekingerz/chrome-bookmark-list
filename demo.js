// デモ用のモックデータとJavaScript
document.addEventListener('DOMContentLoaded', async () => {
    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const searchInput = document.getElementById('searchInput');
    
    // デモ用のモックブックマークデータ
    const mockBookmarks = [
        {
            id: '1',
            title: '開発ツール',
            bookmarks: [
                { title: 'GitHub', url: 'https://github.com', favicon: 'chrome://favicon/https://github.com' },
                { title: 'VS Code', url: 'https://code.visualstudio.com', favicon: 'chrome://favicon/https://code.visualstudio.com' }
            ],
            subfolders: [
                {
                    id: '1-1',
                    title: 'フロントエンド',
                    bookmarks: [
                        { title: 'React', url: 'https://reactjs.org', favicon: 'chrome://favicon/https://reactjs.org' },
                        { title: 'Vue.js', url: 'https://vuejs.org', favicon: 'chrome://favicon/https://vuejs.org' }
                    ],
                    subfolders: [
                        {
                            id: '1-1-1',
                            title: 'CSS Frameworks',
                            bookmarks: [
                                { title: 'Tailwind CSS', url: 'https://tailwindcss.com', favicon: 'chrome://favicon/https://tailwindcss.com' },
                                { title: 'Bootstrap', url: 'https://getbootstrap.com', favicon: 'chrome://favicon/https://getbootstrap.com' }
                            ],
                            subfolders: [],
                            expanded: false
                        }
                    ],
                    expanded: false
                },
                {
                    id: '1-2',
                    title: 'バックエンド',
                    bookmarks: [
                        { title: 'Node.js', url: 'https://nodejs.org', favicon: 'chrome://favicon/https://nodejs.org' },
                        { title: 'Express', url: 'https://expressjs.com', favicon: 'chrome://favicon/https://expressjs.com' }
                    ],
                    subfolders: [],
                    expanded: false
                }
            ],
            expanded: false
        },
        {
            id: '2',
            title: 'ニュース・メディア',
            bookmarks: [
                { title: 'NHK NEWS WEB', url: 'https://www3.nhk.or.jp/news/', favicon: 'chrome://favicon/https://www3.nhk.or.jp/news/' },
                { title: '朝日新聞デジタル', url: 'https://www.asahi.com', favicon: 'chrome://favicon/https://www.asahi.com' }
            ],
            subfolders: [
                {
                    id: '2-1',
                    title: 'テック系',
                    bookmarks: [
                        { title: 'TechCrunch', url: 'https://techcrunch.com', favicon: 'chrome://favicon/https://techcrunch.com' },
                        { title: 'Qiita', url: 'https://qiita.com', favicon: 'chrome://favicon/https://qiita.com' }
                    ],
                    subfolders: [],
                    expanded: false
                }
            ],
            expanded: false
        },
        {
            id: '3',
            title: 'エンターテイメント',
            bookmarks: [
                { title: 'YouTube', url: 'https://youtube.com', favicon: 'chrome://favicon/https://youtube.com' },
                { title: 'Netflix', url: 'https://netflix.com', favicon: 'chrome://favicon/https://netflix.com' }
            ],
            subfolders: [],
            expanded: false
        }
    ];
    
    let allBookmarks = mockBookmarks;
    
    displayBookmarks(allBookmarks);
    
    // 検索機能
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredBookmarks = filterBookmarks(allBookmarks, searchTerm);
        displayBookmarks(filteredBookmarks);
    });
});

// ブックマークを表示
function displayBookmarks(folders) {
    const bookmarkContainer = document.getElementById('bookmarkContainer');
    
    if (folders.length === 0) {
        bookmarkContainer.innerHTML = '<div class="no-results">ブックマークが見つかりませんでした。</div>';
        return;
    }
    
    function renderFolder(folder, level = 0) {
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
                                    <img src="${bookmark.favicon}" alt="" class="bookmark-favicon" 
                                         onerror="this.style.display='none'">
                                    <span class="bookmark-title">${escapeHtml(bookmark.title)}</span>
                                    <span class="bookmark-url">${getDomain(bookmark.url)}</span>
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
    
    // フォルダクリックイベントを設定
    bookmarkContainer.addEventListener('click', (e) => {
        const folderHeader = e.target.closest('.folder-header');
        const subfolderHeader = e.target.closest('.subfolder-header');
        const bookmarkLink = e.target.closest('.bookmark-link');
        
        if (bookmarkLink) {
            e.preventDefault();
            const url = bookmarkLink.getAttribute('data-url');
            // デモ版では新しいウィンドウで開く
            window.open(url, '_blank');
        } else if (subfolderHeader) {
            // 子フォルダのクリック処理
            e.preventDefault();
            const subfolderId = subfolderHeader.getAttribute('data-subfolder-id');
            const parentFolderElement = subfolderHeader.closest('.bookmark-folder');
            const parentFolderId = parentFolderElement.getAttribute('data-folder-id');
            
            const parentFolder = findFolderById(folders, parentFolderId);
            const subfolder = findFolderById(parentFolder.subfolders, subfolderId);
            
            if (subfolder) {
                // 子フォルダの表示状態を切り替え
                subfolder.expanded = !subfolder.expanded;
                
                // サブフォルダリスト内のアイコンを更新
                const expandIcon = subfolderHeader.querySelector('.subfolder-expand-icon');
                if (expandIcon) {
                    expandIcon.textContent = subfolder.expanded ? '📂' : '📁';
                    expandIcon.classList.toggle('expanded');
                }
                
                // 親フォルダも展開状態にする（子フォルダの内容を表示するため）
                if (subfolder.expanded) {
                    parentFolder.expanded = true;
                    
                    // 親フォルダの展開状態も更新
                    const parentExpandIcon = parentFolderElement.querySelector('.expand-icon');
                    const parentSubfoldersContainer = parentFolderElement.querySelector('.subfolders-container');
                    
                    if (parentExpandIcon && parentSubfoldersContainer) {
                        parentExpandIcon.textContent = '📂';
                        parentExpandIcon.classList.add('expanded');
                        parentSubfoldersContainer.classList.add('expanded');
                        parentSubfoldersContainer.classList.remove('collapsed');
                    }
                }
                
                // 対象の子フォルダのコンテナを探して表示/非表示を切り替え
                const subfolderContainers = parentFolderElement.querySelectorAll('.subfolders-container .bookmark-folder');
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
        } else if (folderHeader) {
            const folderElement = folderHeader.closest('.bookmark-folder');
            const folderId = folderElement.getAttribute('data-folder-id');
            const expandIcon = folderHeader.querySelector('.expand-icon');
            const subfoldersContainer = folderElement.querySelector('.subfolders-container');
            
            if (expandIcon && subfoldersContainer) {
                const folder = findFolderById(folders, folderId);
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

// フォルダIDでフォルダを検索するヘルパー関数
function findFolderById(folders, id) {
    for (const folder of folders) {
        if (folder.id === id) return folder;
        const found = findFolderById(folder.subfolders, id);
        if (found) return found;
    }
    return null;
}

// 総ブックマーク数を計算するヘルパー関数
function getTotalBookmarks(folder) {
    return folder.bookmarks.length + folder.subfolders.reduce((sum, sub) => sum + getTotalBookmarks(sub), 0);
}

// ブックマークを検索でフィルタリング
function filterBookmarks(folders, searchTerm) {
    if (!searchTerm) return folders;
    
    function filterFolder(folder) {
        const filteredBookmarks = folder.bookmarks.filter(bookmark => 
            bookmark.title.toLowerCase().includes(searchTerm) ||
            bookmark.url.toLowerCase().includes(searchTerm)
        );
        
        const filteredSubfolders = folder.subfolders
            .map(subfolder => filterFolder(subfolder))
            .filter(subfolder => subfolder.bookmarks.length > 0 || subfolder.subfolders.length > 0);
        
        return {
            ...folder,
            bookmarks: filteredBookmarks,
            subfolders: filteredSubfolders,
            expanded: searchTerm ? true : folder.expanded // 検索時は自動展開
        };
    }
    
    return folders
        .map(folder => filterFolder(folder))
        .filter(folder => folder.bookmarks.length > 0 || folder.subfolders.length > 0);
}

// HTMLエスケープ
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// URLからドメインを取得
function getDomain(url) {
    try {
        return new URL(url).hostname;
    } catch {
        return url;
    }
}
