import { renderFolder, setupFolderClickHandler } from './newtab-core.js';
import type { BookmarkFolder, ChromeBookmarkNode } from './types.js';
import {
  filterBookmarks,
  getFavicon,
  initFaviconCache,
  processBookmarkTree,
} from './utils.js';
import { HistorySidebar } from '../components/HistorySidebar/index.js';

// グローバル変数として定義
let allBookmarks: BookmarkFolder[] = [];
let _historySidebar: HistorySidebar;

// ブックマークデータを取得して表示する
document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
  const bookmarkContainer = document.getElementById(
    'bookmarkContainer'
  ) as HTMLElement;
  const searchInput = document.getElementById(
    'searchInput'
  ) as HTMLInputElement;

  if (!bookmarkContainer) {
    console.error('❌ bookmarkContainer element not found!');
    return;
  }

  if (!searchInput) {
    console.error('❌ searchInput element not found!');
    return;
  }

  // Favicon キャッシュの初期化
  await initFaviconCache();

  // 履歴サイドバーの初期化
  _historySidebar = new HistorySidebar();

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
    console.error('❌ ブックマークの取得に失敗しました:', error);
    bookmarkContainer.innerHTML =
      '<div class="loading">ブックマークの読み込みに失敗しました。</div>';
  }
});

// ブックマークを表示
async function displayBookmarks(folders: BookmarkFolder[]): Promise<void> {
  const bookmarkContainer = document.getElementById(
    'bookmarkContainer'
  ) as HTMLElement;

  if (folders.length === 0) {
    bookmarkContainer.innerHTML =
      '<div class="no-results">ブックマークが見つかりませんでした。</div>';
    return;
  }

  const html = folders.map((folder) => renderFolder(folder)).join('');
  bookmarkContainer.innerHTML = html;

  // 既存のイベントリスナーを削除してから新しいものを追加
  const newBookmarkContainer = bookmarkContainer.cloneNode(true) as HTMLElement;
  bookmarkContainer.parentNode?.replaceChild(
    newBookmarkContainer,
    bookmarkContainer
  );

  // フォルダクリックイベントを設定
  setupFolderClickHandler(newBookmarkContainer, allBookmarks);

  // Favicon を非同期で読み込み（新しいコンテナに対して）
  await loadFavicons(newBookmarkContainer);
}

// Favicon を非同期で読み込む
async function loadFavicons(container?: HTMLElement): Promise<void> {
  const targetContainer = container || document;
  const faviconImages = targetContainer.querySelectorAll(
    '.bookmark-favicon'
  ) as NodeListOf<HTMLImageElement>;
  const faviconPlaceholders = targetContainer.querySelectorAll(
    '.favicon-placeholder'
  ) as NodeListOf<HTMLElement>;

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
