import { BookmarkDragAndDrop } from '../components/BookmarkDragAndDrop/index.js';
import { HistorySidebar } from '../components/HistorySidebar/index.js';
import { SELECTORS } from '../constants/index.js';
import type { BookmarkFolder, ChromeBookmarkNode } from '../types/bookmark.js';
import { renderFolder, setupFolderClickHandler } from './newtab-core.js';
import {
  filterBookmarks,
  getFavicon,
  initFaviconCache,
  processBookmarkTree,
} from './utils.js';

// グローバル変数として定義
let allBookmarks: BookmarkFolder[] = [];
let _historySidebar: HistorySidebar;
let bookmarkDragAndDrop: BookmarkDragAndDrop;

// ブックマークデータを取得して表示する
document.addEventListener('DOMContentLoaded', async (): Promise<void> => {
  const bookmarkContainer = document.querySelector(
    SELECTORS.BOOKMARK_CONTAINER
  ) as HTMLElement;
  const searchInput = document.querySelector(
    SELECTORS.SEARCH_INPUT
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

  // ドラッグ&ドロップ機能の初期化
  bookmarkDragAndDrop = new BookmarkDragAndDrop();
  bookmarkDragAndDrop.initialize();

  // ブックマーク変更イベントリスナーを追加
  document.addEventListener('bookmarks-changed', async () => {
    console.log('ブックマークが変更されました。リロードします...');
    await reloadBookmarks();
  });

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
  const bookmarkContainer = document.querySelector(
    SELECTORS.BOOKMARK_CONTAINER
  ) as HTMLElement;

  if (folders.length === 0) {
    bookmarkContainer.innerHTML =
      '<div class="no-results">ブックマークが見つかりませんでした。</div>';
    return;
  }

  const html = folders.map((folder) => renderFolder(folder)).join('');
  bookmarkContainer.innerHTML = html;

  // フォルダクリックイベントを設定
  setupFolderClickHandler(bookmarkContainer, allBookmarks);

  // ドラッグ&ドロップ機能を有効化
  if (bookmarkDragAndDrop) {
    bookmarkDragAndDrop.makeBookmarksDraggable();
  }

  // Favicon を非同期で読み込み
  await loadFavicons(bookmarkContainer);
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

// ブックマークを再読み込みする関数
async function reloadBookmarks(): Promise<void> {
  try {
    const bookmarkTree: ChromeBookmarkNode[] = await chrome.bookmarks.getTree();
    allBookmarks = processBookmarkTree(bookmarkTree);

    // 検索入力がある場合はフィルタリングして表示
    const searchInput = document.querySelector(
      SELECTORS.SEARCH_INPUT
    ) as HTMLInputElement;
    if (searchInput?.value) {
      const searchTerm = searchInput.value.toLowerCase();
      const filteredBookmarks = filterBookmarks(allBookmarks, searchTerm);
      await displayBookmarks(filteredBookmarks);
    } else {
      await displayBookmarks(allBookmarks);
    }

    console.log('ブックマーク再読み込み完了');
  } catch (error) {
    console.error('ブックマーク再読み込みエラー:', error);
  }
}
