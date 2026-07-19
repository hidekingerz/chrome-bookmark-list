import { BookmarkDragAndDrop } from '../components/BookmarkDragAndDrop/index.js';
import { CalendarHistoryPanel } from '../components/CalendarHistoryPanel/index.js';
import { HistoryPanel } from '../components/HistoryPanel/index.js';
import { KeyboardShortcuts } from '../components/KeyboardShortcuts/index.js';
import { RecentlyClosedPanel } from '../components/RecentlyClosedPanel/index.js';
import { TabController } from '../components/TabController/index.js';
import { UndoManager } from '../components/UndoManager/index.js';
import { SELECTORS } from '../constants/index.js';
import type { BookmarkFolder, ChromeBookmarkNode } from '../types/bookmark.js';
import { renderFolder, setupFolderClickHandler } from './newtab-core.js';
import { setupBookmarkSearch } from './searchInput.js';
import {
  applyExpandedState,
  filterBookmarks,
  getFavicon,
  processBookmarkTree,
} from './utils.js';

// グローバル変数として定義
let allBookmarks: BookmarkFolder[] = [];
let _historyPanel: HistoryPanel;
let _calendarHistoryPanel: CalendarHistoryPanel;
let _recentlyClosedPanel: RecentlyClosedPanel;
let _tabController: TabController;
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

  // 履歴パネル・カレンダーパネルの初期化（各タブパネル内に構築）
  const historyPanelContainer = document.querySelector(
    '#tab-panel-history'
  ) as HTMLElement | null;
  const calendarPanelContainer = document.querySelector(
    '#tab-panel-calendar'
  ) as HTMLElement | null;

  if (historyPanelContainer) {
    _historyPanel = new HistoryPanel(historyPanelContainer);
  }
  if (calendarPanelContainer) {
    _calendarHistoryPanel = new CalendarHistoryPanel(calendarPanelContainer);
  }

  const recentlyClosedPanelContainer = document.querySelector(
    '#tab-panel-recently-closed'
  ) as HTMLElement | null;

  if (recentlyClosedPanelContainer) {
    _recentlyClosedPanel = new RecentlyClosedPanel(
      recentlyClosedPanelContainer
    );
  }

  // タブの初期化（タブがアクティブになったときに各パネルのデータを読み込む）
  _tabController = new TabController();
  _tabController.onActivate('history', async () => {
    await _historyPanel?.activate();
  });
  _tabController.onActivate('recently-closed', async () => {
    await _recentlyClosedPanel?.activate();
  });
  _tabController.onActivate('calendar', async () => {
    await _calendarHistoryPanel?.activate();
  });

  // ドラッグ&ドロップ機能の初期化
  bookmarkDragAndDrop = new BookmarkDragAndDrop();
  bookmarkDragAndDrop.initialize();

  // Undo 機能 (Cmd/Ctrl+Z) の初期化
  UndoManager.getInstance().initialize();

  // キーボードショートカットの初期化 (矢印・Enter・Delete・F2・Cmd/Ctrl+F・?)
  KeyboardShortcuts.getInstance().initialize();

  // ブックマーク変更イベントリスナーを追加
  // 検索入力にフィルタが残っていれば reloadBookmarks 側で維持される
  document.addEventListener('bookmarks-changed', async () => {
    await reloadBookmarks();
  });

  try {
    // Chromeのブックマークを取得
    const bookmarkTree: ChromeBookmarkNode[] = await chrome.bookmarks.getTree();

    allBookmarks = processBookmarkTree(bookmarkTree);

    await displayBookmarks(allBookmarks);

    // 検索機能（デバウンス適用: 1キーストロークごとの全再描画を避ける #104）
    setupBookmarkSearch(
      searchInput,
      () => allBookmarks,
      (folders) => displayBookmarks(folders)
    );
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
    const previousBookmarks = allBookmarks;
    allBookmarks = processBookmarkTree(bookmarkTree);
    // 再描画でユーザーの展開/折りたたみ状態が失われないよう引き継ぐ (#104)
    applyExpandedState(allBookmarks, previousBookmarks);

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
  } catch (error) {
    console.error('ブックマーク再読み込みエラー:', error);
  }
}
