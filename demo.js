// デモ用のモックデータとJavaScript
document.addEventListener('DOMContentLoaded', async () => {
    const bookmarkContainer = document.getElementById('bookmarkContainer');
    const searchInput = document.getElementById('searchInput');
    
    // Favicon キャッシュの初期化（デモ版用）
    await initFaviconCache();
    
    // デモ用のモックブックマークデータ（階層レベルに応じた初期展開状態）
    const mockBookmarks = [
        {
            id: '1',
            title: '開発ツール',
            bookmarks: [
                { title: 'GitHub', url: 'https://github.com', favicon: null },
                { title: 'VS Code', url: 'https://code.visualstudio.com', favicon: null }
            ],
            subfolders: [
                {
                    id: '1-1',
                    title: 'フロントエンド',
                    bookmarks: [
                        { title: 'React', url: 'https://reactjs.org', favicon: null },
                        { title: 'Vue.js', url: 'https://vuejs.org', favicon: null }
                    ],
                    subfolders: [
                        {
                            id: '1-1-1',
                            title: 'CSS Frameworks',
                            bookmarks: [
                                { title: 'Tailwind CSS', url: 'https://tailwindcss.com', favicon: null },
                                { title: 'Bootstrap', url: 'https://getbootstrap.com', favicon: null }
                            ],
                            subfolders: [],
                            expanded: false // 3層目は折りたたみ
                        }
                    ],
                    expanded: true // 2層目は展開
                },
                {
                    id: '1-2',
                    title: 'バックエンド',
                    bookmarks: [
                        { title: 'Node.js', url: 'https://nodejs.org', favicon: null },
                        { title: 'Express', url: 'https://expressjs.com', favicon: null }
                    ],
                    subfolders: [],
                    expanded: true // 2層目は展開
                }
            ],
            expanded: true // 1層目は展開
        },
        {
            id: '2',
            title: 'ニュース・メディア',
            bookmarks: [
                { title: 'NHK NEWS WEB', url: 'https://www3.nhk.or.jp/news/', favicon: null },
                { title: '朝日新聞デジタル', url: 'https://www.asahi.com', favicon: null }
            ],
            subfolders: [
                {
                    id: '2-1',
                    title: 'テック系',
                    bookmarks: [
                        { title: 'TechCrunch', url: 'https://techcrunch.com', favicon: null },
                        { title: 'Qiita', url: 'https://qiita.com', favicon: null }
                    ],
                    subfolders: [
                        {
                            id: '2-1-1',
                            title: 'AI・機械学習',
                            bookmarks: [
                                { title: 'Hugging Face', url: 'https://huggingface.co', favicon: null },
                                { title: 'Papers with Code', url: 'https://paperswithcode.com', favicon: null }
                            ],
                            subfolders: [],
                            expanded: false // 3層目は折りたたみ
                        }
                    ],
                    expanded: true // 2層目は展開
                }
            ],
            expanded: true // 1層目は展開
        },
        {
            id: '3',
            title: 'エンターテイメント',
            bookmarks: [
                { title: 'YouTube', url: 'https://youtube.com', favicon: null },
                { title: 'Netflix', url: 'https://netflix.com', favicon: null }
            ],
            subfolders: [],
            expanded: true // 1層目は展開
        }
    ];
    
    let allBookmarks = mockBookmarks;
    
    await displayBookmarks(allBookmarks);
    
    // 検索機能
    searchInput.addEventListener('input', async (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredBookmarks = filterBookmarks(allBookmarks, searchTerm);
        await displayBookmarks(filteredBookmarks);
    });
});

// Favicon キャッシュ管理（デモ版用）
const faviconCache = new Map();
const FAVICON_CACHE_KEY = 'bookmark_favicon_cache_demo';
const CACHE_EXPIRY_DAYS = 7;

// Favicon キャッシュの初期化
async function initFaviconCache() {
    try {
        const stored = localStorage.getItem(FAVICON_CACHE_KEY);
        if (stored) {
            const { data, timestamp } = JSON.parse(stored);
            const isExpired = Date.now() - timestamp > (CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
            
            if (!isExpired) {
                Object.entries(data).forEach(([url, favicon]) => {
                    faviconCache.set(url, favicon);
                });
            } else {
                localStorage.removeItem(FAVICON_CACHE_KEY);
            }
        }
    } catch (error) {
        console.warn('Favicon キャッシュの読み込みに失敗:', error);
    }
}

// Favicon キャッシュの保存
function saveFaviconCache() {
    try {
        const data = Object.fromEntries(faviconCache);
        const cacheData = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(FAVICON_CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
        console.warn('Favicon キャッシュの保存に失敗:', error);
    }
}

// Favicon の取得（キャッシュ機能付き）
async function getFavicon(url) {
    // キャッシュから取得を試行
    if (faviconCache.has(url)) {
        return faviconCache.get(url);
    }
    
    // 複数のfavicon取得方法を試行
    const faviconSources = [
        `https://www.google.com/s2/favicons?domain=${getDomain(url)}&sz=32`,
        `https://${getDomain(url)}/favicon.ico`
    ];
    
    for (const faviconUrl of faviconSources) {
        try {
            // favicon の有効性をチェック
            const isValid = await checkFaviconValidity(faviconUrl);
            if (isValid) {
                faviconCache.set(url, faviconUrl);
                saveFaviconCache();
                return faviconUrl;
            }
        } catch (error) {
            continue; // 次のソースを試行
        }
    }
    
    // すべて失敗した場合はデフォルトアイコンを返す
    const defaultFavicon = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjE2IiBoZWlnaHQ9IjE2IiByeD0iMiIgZmlsbD0iIzk0YTNiOCIvPgo8cGF0aCBkPSJNOCAzQzUuNzkgMyA0IDQuNzkgNCA3QzQgOS4yMSA1Ljc5IDExIDggMTFDMTAuMjEgMTEgMTIgOS4yMSAxMiA3QzEyIDQuNzkgMTAuMjEgMyA4IDNaTTggOUEyIDIgMCAwIDEgNiA3QTIgMiAwIDAgMCA4IDVBMiAyIDAgMCAxIDEwIDdBMiAyIDAgMCAxIDggOVoiIGZpbGw9IndoaXRlIi8+Cjwvc3ZnPgo=';
    faviconCache.set(url, defaultFavicon);
    saveFaviconCache();
    return defaultFavicon;
}

// Favicon の有効性チェック
function checkFaviconValidity(faviconUrl) {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = faviconUrl;
        
        // タイムアウト設定（2秒）
        setTimeout(() => resolve(false), 2000);
    });
}

// Favicon を非同期で読み込む
async function loadFavicons() {
    const faviconImages = document.querySelectorAll('.bookmark-favicon');
    const faviconPlaceholders = document.querySelectorAll('.favicon-placeholder');
    
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

// ブックマークを表示
async function displayBookmarks(folders) {
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
