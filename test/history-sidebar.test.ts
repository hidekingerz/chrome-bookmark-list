import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistorySidebar } from '../src/components/HistorySidebar/HistorySidebar';
import { getRecentHistory } from '../src/scripts/history';
import { getFavicon } from '../src/scripts/utils';

// モック
vi.mock('../src/scripts/history');
vi.mock('../src/scripts/utils');

const mockGetRecentHistory = vi.mocked(getRecentHistory);
const mockGetFavicon = vi.mocked(getFavicon);

describe('HistorySidebar', () => {
  let sidebar: HistorySidebar;
  let dom: JSDOM;
  let document: Document;

  beforeEach(() => {
    // DOM環境を設定
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Test</title>
        </head>
        <body>
          <header>
            <h1>Bookmarks</h1>
          </header>
        </body>
      </html>
    `,
      {
        url: 'http://localhost',
        pretendToBeVisual: true,
      }
    );

    document = dom.window.document;

    // グローバルオブジェクトを設定
    Object.defineProperty(globalThis, 'document', {
      value: document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'KeyboardEvent', {
      value: dom.window.KeyboardEvent,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Event', {
      value: dom.window.Event,
      writable: true,
      configurable: true,
    });

    // モックのリセット
    vi.clearAllMocks();

    // デフォルトのモック設定
    mockGetRecentHistory.mockResolvedValue([]);
    mockGetFavicon.mockResolvedValue('data:image/png;base64,test');
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  describe('初期化', () => {
    it('サイドバーコンポーネントが正しく初期化される', () => {
      sidebar = new HistorySidebar();

      // サイドバー要素が作成される
      const sidebarElement = document.querySelector('.history-sidebar');
      expect(sidebarElement).toBeTruthy();

      // オーバーレイが作成される
      const overlayElement = document.querySelector('.history-sidebar-overlay');
      expect(overlayElement).toBeTruthy();

      // トグルボタンが作成される
      const toggleButton = document.querySelector('.history-toggle-btn');
      expect(toggleButton).toBeTruthy();
    });

    it('サイドバーの初期状態は閉じている', () => {
      sidebar = new HistorySidebar();

      const sidebarElement = document.querySelector('.history-sidebar');
      expect(sidebarElement?.classList.contains('open')).toBe(false);

      const overlayElement = document.querySelector('.history-sidebar-overlay');
      expect(overlayElement?.classList.contains('active')).toBe(false);
    });

    it('トグルボタンが正しい属性を持つ', () => {
      sidebar = new HistorySidebar();

      const toggleButton = document.querySelector('.history-toggle-btn');
      expect(toggleButton?.getAttribute('aria-label')).toBe('履歴を表示');
      expect(toggleButton?.getAttribute('title')).toBe('履歴を表示');
      expect(toggleButton?.innerHTML).toBe('🕐');
    });
  });

  describe('サイドバーの開閉', () => {
    beforeEach(() => {
      sidebar = new HistorySidebar();
    });

    it('トグルボタンクリックでサイドバーが開く', async () => {
      const toggleButton = document.querySelector(
        '.history-toggle-btn'
      ) as HTMLButtonElement;

      toggleButton.click();

      const sidebarElement = document.querySelector('.history-sidebar');
      const overlayElement = document.querySelector('.history-sidebar-overlay');

      expect(sidebarElement?.classList.contains('open')).toBe(true);
      expect(overlayElement?.classList.contains('active')).toBe(true);
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('閉じるボタンクリックでサイドバーが閉じる', async () => {
      // まず開く
      await sidebar.open();

      const closeButton = document.querySelector(
        '.history-sidebar-close'
      ) as HTMLButtonElement;
      closeButton.click();

      const sidebarElement = document.querySelector('.history-sidebar');
      const overlayElement = document.querySelector('.history-sidebar-overlay');

      expect(sidebarElement?.classList.contains('open')).toBe(false);
      expect(overlayElement?.classList.contains('active')).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });

    it('オーバーレイクリックでサイドバーが閉じる', async () => {
      // まず開く
      await sidebar.open();

      const overlayElement = document.querySelector(
        '.history-sidebar-overlay'
      ) as HTMLElement;
      overlayElement.click();

      const sidebarElement = document.querySelector('.history-sidebar');

      expect(sidebarElement?.classList.contains('open')).toBe(false);
      expect(overlayElement?.classList.contains('active')).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });

    it('ESCキーでサイドバーが閉じる', async () => {
      // まず開く
      await sidebar.open();

      // ESCキーイベントを発火
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escEvent);

      const sidebarElement = document.querySelector('.history-sidebar');
      const overlayElement = document.querySelector('.history-sidebar-overlay');

      expect(sidebarElement?.classList.contains('open')).toBe(false);
      expect(overlayElement?.classList.contains('active')).toBe(false);
      expect(document.body.style.overflow).toBe('');
    });

    it('サイドバーが閉じている時にESCキーを押しても何も起こらない', async () => {
      // サイドバーは閉じたまま
      const escEvent = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(escEvent);

      const sidebarElement = document.querySelector('.history-sidebar');
      const overlayElement = document.querySelector('.history-sidebar-overlay');

      expect(sidebarElement?.classList.contains('open')).toBe(false);
      expect(overlayElement?.classList.contains('active')).toBe(false);
    });
  });

  describe('検索機能', () => {
    beforeEach(() => {
      sidebar = new HistorySidebar();
    });

    it('検索バーが正しく追加される', () => {
      const searchInput = document.querySelector('.history-search-input');
      expect(searchInput).toBeTruthy();
      expect(searchInput?.getAttribute('placeholder')).toBe('履歴を検索...');
    });

    it('検索入力でアイテムがフィルタリングされる', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://github.com',
          title: 'GitHub',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
        {
          id: '2',
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          lastVisitTime: 1640995100000,
          visitCount: 10,
          typedCount: 1,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);

      await sidebar.open();

      const searchInput = document.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;

      // 検索前は全アイテムが表示
      let historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(2);

      // 'GitHub'で検索
      searchInput.value = 'GitHub';
      const inputEvent = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(inputEvent);

      // GitHubのアイテムのみ表示
      historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(1);
      expect(
        historyItems[0].querySelector('.history-item-title')?.textContent
      ).toBe('GitHub');
    });

    it('URLでの検索が動作する', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://github.com',
          title: 'GitHub',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
        {
          id: '2',
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          lastVisitTime: 1640995100000,
          visitCount: 10,
          typedCount: 1,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);

      await sidebar.open();

      const searchInput = document.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;

      // 'github.com'で検索
      searchInput.value = 'github.com';
      const inputEvent = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(inputEvent);

      // GitHubのアイテムのみ表示
      const historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(1);
      expect(
        historyItems[0].querySelector('.history-item-url')?.textContent
      ).toBe('https://github.com');
    });

    it('検索結果が空の場合、適切なメッセージが表示される', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://github.com',
          title: 'GitHub',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);

      await sidebar.open();

      const searchInput = document.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;

      // 存在しないキーワードで検索
      searchInput.value = 'nonexistent';
      const inputEvent = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(inputEvent);

      // 検索結果なしのメッセージが表示
      const emptyMessage = document.querySelector('.history-empty');
      expect(emptyMessage?.textContent).toBe('検索結果が見つかりませんでした');
    });

    it('検索をクリアすると全アイテムが再表示される', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://github.com',
          title: 'GitHub',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
        {
          id: '2',
          url: 'https://stackoverflow.com',
          title: 'Stack Overflow',
          lastVisitTime: 1640995100000,
          visitCount: 10,
          typedCount: 1,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);

      await sidebar.open();

      const searchInput = document.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;

      // 検索してフィルタリング
      searchInput.value = 'GitHub';
      const inputEvent1 = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(inputEvent1);

      let historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(1);

      // 検索をクリア
      searchInput.value = '';
      const inputEvent2 = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(inputEvent2);

      // 全アイテムが再表示
      historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(2);
    });

    it('大文字小文字を区別しない検索が動作する', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://github.com',
          title: 'GitHub',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);

      await sidebar.open();

      const searchInput = document.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;

      // 小文字で検索
      searchInput.value = 'github';
      const inputEvent = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(inputEvent);

      // GitHubのアイテムが表示される
      const historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(1);
      expect(
        historyItems[0].querySelector('.history-item-title')?.textContent
      ).toBe('GitHub');
    });
  });

  describe('履歴の読み込みと表示', () => {
    beforeEach(() => {
      sidebar = new HistorySidebar();
    });

    it('履歴が正常に読み込まれた場合、履歴アイテムが表示される', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
        {
          id: '2',
          url: 'https://github.com',
          title: 'GitHub',
          lastVisitTime: 1640995100000,
          visitCount: 10,
          typedCount: 1,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);

      await sidebar.open();

      expect(mockGetRecentHistory).toHaveBeenCalledWith(50);

      const historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(2);

      const firstItem = historyItems[0];
      const firstTitle = firstItem.querySelector('.history-item-title');
      const firstUrl = firstItem.querySelector('.history-item-url');

      expect(firstTitle?.textContent).toBe('Example Site');
      expect(firstUrl?.textContent).toBe('https://example.com');
    });

    it('履歴が空の場合、適切なメッセージが表示される', async () => {
      mockGetRecentHistory.mockResolvedValue([]);

      await sidebar.open();

      const emptyMessage = document.querySelector('.history-empty');
      expect(emptyMessage?.textContent).toBe('履歴が見つかりませんでした');
    });

    it('履歴読み込みに失敗した場合、エラーメッセージが表示される', async () => {
      mockGetRecentHistory.mockRejectedValue(new Error('API Error'));

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await sidebar.open();

      const errorMessage = document.querySelector('.history-error');
      expect(errorMessage?.textContent).toBe('履歴の読み込みに失敗しました');
      expect(consoleSpy).toHaveBeenCalledWith(
        '履歴の読み込みに失敗しました:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('履歴アイテムの表示', () => {
    beforeEach(() => {
      sidebar = new HistorySidebar();
    });

    it('履歴アイテムが正しいフォーマットで表示される', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000, // 2022-01-01 00:00:00 UTC
          visitCount: 5,
          typedCount: 2,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);

      await sidebar.open();

      const historyItem = document.querySelector('.history-item');
      expect(historyItem).toBeTruthy();

      const title = historyItem?.querySelector('.history-item-title');
      expect(title?.textContent).toBe('Example Site');
      expect(title?.getAttribute('href')).toBe('https://example.com');
      expect(title?.getAttribute('target')).toBe('_blank');

      const url = historyItem?.querySelector('.history-item-url');
      expect(url?.textContent).toBe('https://example.com');

      const visitCount = historyItem?.querySelector('.history-item-count');
      expect(visitCount?.textContent).toBe('訪問回数: 5');

      const favicon = historyItem?.querySelector('.history-favicon');
      expect(favicon?.getAttribute('data-history-url')).toBe(
        'https://example.com'
      );
    });

    it('日付と時刻が正しく表示される', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000, // 2022-01-01 00:00:00 UTC
          visitCount: 5,
          typedCount: 2,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);

      await sidebar.open();

      const dateElement = document.querySelector('.history-item-date');
      expect(dateElement?.textContent).toMatch(
        /\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}/
      );
    });
  });

  describe('Favicon読み込み', () => {
    beforeEach(() => {
      sidebar = new HistorySidebar();
    });

    it('Faviconが正常に読み込まれる', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);
      mockGetFavicon.mockResolvedValue('data:image/png;base64,testicon');

      await sidebar.open();

      expect(mockGetFavicon).toHaveBeenCalledWith('https://example.com');

      const favicon = document.querySelector(
        '.history-favicon'
      ) as HTMLImageElement;

      // onloadイベントをシミュレート
      favicon.onload?.({} as Event);

      expect(favicon.src).toBe('data:image/png;base64,testicon');
      expect(favicon.classList.contains('hidden')).toBe(false);
    });

    it('Favicon読み込みに失敗した場合、プレースホルダーが表示される', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ];

      mockGetRecentHistory.mockResolvedValue(mockHistoryItems);
      mockGetFavicon.mockRejectedValue(new Error('Favicon not found'));

      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await sidebar.open();

      const placeholder = document.querySelector(
        '.favicon-placeholder'
      ) as HTMLElement;
      expect(placeholder?.textContent).toBe('🌐');
      expect(placeholder?.style.display).toBe('block');

      consoleSpy.mockRestore();
    });
  });

  describe('toggle メソッド', () => {
    beforeEach(() => {
      sidebar = new HistorySidebar();
    });

    it('閉じている状態でtoggleを呼ぶと開く', async () => {
      await sidebar.toggle();

      const sidebarElement = document.querySelector('.history-sidebar');
      expect(sidebarElement?.classList.contains('open')).toBe(true);
    });

    it('開いている状態でtoggleを呼ぶと閉じる', async () => {
      await sidebar.open();
      sidebar.close();

      const sidebarElement = document.querySelector('.history-sidebar');
      expect(sidebarElement?.classList.contains('open')).toBe(false);
    });
  });
});
