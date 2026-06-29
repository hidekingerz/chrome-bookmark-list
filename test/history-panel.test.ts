import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HistoryPanel } from '../src/components/HistoryPanel/HistoryPanel';
import { getRecentHistory } from '../src/scripts/history';
import { getFavicon } from '../src/scripts/utils';

// モック（escapeHtml など他のユーティリティは本物を使い、getFaviconのみモック）
vi.mock('../src/scripts/history');
vi.mock('../src/scripts/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/scripts/utils')>();
  return {
    ...actual,
    getFavicon: vi.fn(),
  };
});

const mockGetRecentHistory = vi.mocked(getRecentHistory);
const mockGetFavicon = vi.mocked(getFavicon);

describe('HistoryPanel', () => {
  let panel: HistoryPanel;
  let dom: JSDOM;
  let document: Document;
  let container: HTMLElement;

  beforeEach(() => {
    // DOM環境を設定
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <head><title>Test</title></head>
        <body>
          <section id="tab-panel-history"></section>
        </body>
      </html>
    `,
      {
        url: 'http://localhost',
        pretendToBeVisual: true,
      }
    );

    document = dom.window.document;

    Object.defineProperty(globalThis, 'document', {
      value: document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'Event', {
      value: dom.window.Event,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'MouseEvent', {
      value: dom.window.MouseEvent,
      writable: true,
      configurable: true,
    });

    // Chrome API のモック
    globalThis.chrome = {
      tabs: { create: vi.fn() },
    } as unknown as typeof chrome;

    vi.clearAllMocks();

    mockGetRecentHistory.mockResolvedValue([]);
    mockGetFavicon.mockResolvedValue('data:image/png;base64,test');

    container = document.getElementById('tab-panel-history') as HTMLElement;
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  describe('初期化', () => {
    it('コンテナ内に検索バーとコンテンツ領域が構築される', () => {
      panel = new HistoryPanel(container);

      expect(container.classList.contains('history-panel')).toBe(true);
      expect(container.querySelector('.history-search-input')).toBeTruthy();
      expect(container.querySelector('.history-panel-content')).toBeTruthy();
    });

    it('検索バーが正しいプレースホルダーを持つ', () => {
      panel = new HistoryPanel(container);

      const searchInput = container.querySelector('.history-search-input');
      expect(searchInput?.getAttribute('placeholder')).toBe('履歴を検索...');
    });
  });

  describe('履歴の読み込みと表示', () => {
    beforeEach(() => {
      panel = new HistoryPanel(container);
    });

    it('activate で過去7日間の履歴（最大50件）が読み込まれる', async () => {
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

      await panel.activate();

      expect(mockGetRecentHistory).toHaveBeenCalledWith(50);

      const historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(2);

      const firstItem = historyItems[0];
      expect(firstItem.querySelector('.history-item-title')?.textContent).toBe(
        'Example Site'
      );
      expect(firstItem.querySelector('.history-item-url')?.textContent).toBe(
        'https://example.com'
      );
    });

    it('履歴が空の場合、適切なメッセージが表示される', async () => {
      mockGetRecentHistory.mockResolvedValue([]);

      await panel.activate();

      const emptyMessage = document.querySelector('.history-empty');
      expect(emptyMessage?.textContent).toBe('履歴が見つかりませんでした');
    });

    it('履歴読み込みに失敗した場合、エラーメッセージが表示される', async () => {
      mockGetRecentHistory.mockRejectedValue(new Error('API Error'));
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await panel.activate();

      const errorMessage = document.querySelector('.history-error');
      expect(errorMessage?.textContent).toBe('履歴の読み込みに失敗しました');
      expect(consoleSpy).toHaveBeenCalledWith(
        '履歴の読み込みに失敗しました:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('履歴アイテムが正しいフォーマットで表示される', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      const historyItem = document.querySelector('.history-item');
      expect(historyItem).toBeTruthy();

      const title = historyItem?.querySelector('.history-item-title');
      expect(title?.textContent).toBe('Example Site');
      // セキュリティ: 生のhrefではなくdata-url属性でURLを保持する
      expect(title?.getAttribute('data-url')).toBe('https://example.com');

      const visitCount = historyItem?.querySelector('.history-item-count');
      expect(visitCount?.textContent).toBe('訪問回数: 5');

      const favicon = historyItem?.querySelector('.history-favicon');
      expect(favicon?.getAttribute('data-history-url')).toBe(
        'https://example.com'
      );
    });

    it('日付と時刻が正しく表示される', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      const dateElement = document.querySelector('.history-item-date');
      expect(dateElement?.textContent).toMatch(
        /\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}/
      );
    });
  });

  describe('セキュリティ（XSSエスケープ）', () => {
    beforeEach(() => {
      panel = new HistoryPanel(container);
    });

    it('悪意のあるタイトルがスクリプトとして実行されずにエスケープされる', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: '<img src=x onerror=alert(1)>',
          lastVisitTime: 1640995200000,
          visitCount: 1,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      // タイトル内のHTMLはエスケープされ、img要素は生成されない
      const injectedImg = container.querySelector('.history-item-title img');
      expect(injectedImg).toBeNull();

      const title = container.querySelector('.history-item-title');
      expect(title?.textContent).toBe('<img src=x onerror=alert(1)>');
    });
  });

  describe('クリックでタブを開く', () => {
    beforeEach(() => {
      panel = new HistoryPanel(container);
    });

    it('履歴アイテムのタイトルクリックで新しいタブが開く', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      const title = container.querySelector(
        '.history-item-title'
      ) as HTMLElement;
      title.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true })
      );

      expect(chrome.tabs.create).toHaveBeenCalledWith({
        url: 'https://example.com',
      });
    });

    it('タイトル以外の要素をクリックしてもタブは開かない', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ]);

      await panel.activate();

      // .history-item-title の外側（URL 表示部分）をクリック
      const urlElement = container.querySelector(
        '.history-item-url'
      ) as HTMLElement;
      urlElement.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true })
      );

      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });

    it('data-url が空のタイトルをクリックしてもタブは開かない', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: '',
          title: 'URL なしアイテム',
          lastVisitTime: 1640995200000,
          visitCount: 0,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      const title = container.querySelector(
        '.history-item-title'
      ) as HTMLElement;
      expect(title.getAttribute('data-url')).toBe('');

      title.dispatchEvent(
        new dom.window.MouseEvent('click', { bubbles: true })
      );

      expect(chrome.tabs.create).not.toHaveBeenCalled();
    });
  });

  describe('検索機能', () => {
    beforeEach(() => {
      panel = new HistoryPanel(container);
    });

    const items = [
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

    it('タイトルでフィルタリングできる', async () => {
      mockGetRecentHistory.mockResolvedValue(items);
      await panel.activate();

      const searchInput = container.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;

      expect(document.querySelectorAll('.history-item')).toHaveLength(2);

      searchInput.value = 'GitHub';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      const historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(1);
      expect(
        historyItems[0].querySelector('.history-item-title')?.textContent
      ).toBe('GitHub');
    });

    it('URLでフィルタリングできる', async () => {
      mockGetRecentHistory.mockResolvedValue(items);
      await panel.activate();

      const searchInput = container.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;

      searchInput.value = 'github.com';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      const historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(1);
      expect(
        historyItems[0].querySelector('.history-item-url')?.textContent
      ).toBe('https://github.com');
    });

    it('検索結果が空の場合、適切なメッセージが表示される', async () => {
      mockGetRecentHistory.mockResolvedValue(items);
      await panel.activate();

      const searchInput = container.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;
      searchInput.value = 'nonexistent';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      const emptyMessage = document.querySelector('.history-empty');
      expect(emptyMessage?.textContent).toBe('検索結果が見つかりませんでした');
    });

    it('検索をクリアすると全アイテムが再表示される', async () => {
      mockGetRecentHistory.mockResolvedValue(items);
      await panel.activate();

      const searchInput = container.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;

      searchInput.value = 'GitHub';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.querySelectorAll('.history-item')).toHaveLength(1);

      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      expect(document.querySelectorAll('.history-item')).toHaveLength(2);
    });

    it('大文字小文字を区別しない検索ができる', async () => {
      mockGetRecentHistory.mockResolvedValue([items[0]]);
      await panel.activate();

      const searchInput = container.querySelector(
        '.history-search-input'
      ) as HTMLInputElement;
      searchInput.value = 'github';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      const historyItems = document.querySelectorAll('.history-item');
      expect(historyItems).toHaveLength(1);
    });
  });

  describe('Favicon読み込み', () => {
    beforeEach(() => {
      panel = new HistoryPanel(container);
    });

    it('Faviconが正常に読み込まれる', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ]);
      mockGetFavicon.mockResolvedValue('data:image/png;base64,testicon');

      await panel.activate();

      expect(mockGetFavicon).toHaveBeenCalledWith('https://example.com');

      const favicon = container.querySelector(
        '.history-favicon'
      ) as HTMLImageElement;
      favicon.onload?.({} as Event);

      expect(favicon.src).toBe('data:image/png;base64,testicon');
      expect(favicon.classList.contains('hidden')).toBe(false);
    });

    it('Favicon読み込みに失敗した場合、プレースホルダーが表示される', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ]);
      mockGetFavicon.mockRejectedValue(new Error('Favicon not found'));
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await panel.activate();

      const placeholder = container.querySelector(
        '.favicon-placeholder'
      ) as HTMLElement;
      expect(placeholder?.textContent).toBe('🌐');
      expect(placeholder?.style.display).toBe('block');

      consoleSpy.mockRestore();
    });

    it('Favicon取得成功後に画像のonerrorが発火するとプレースホルダーが表示される', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ]);
      mockGetFavicon.mockResolvedValue('data:image/png;base64,broken');

      await panel.activate();

      const favicon = container.querySelector(
        '.history-favicon'
      ) as HTMLImageElement;
      const placeholder = container.querySelector(
        '.favicon-placeholder'
      ) as HTMLElement;

      // getFavicon 成功で onerror ハンドラが設定されている
      expect(favicon.onerror).toBeTypeOf('function');

      // 画像のデコードに失敗（壊れた data URL 等）→ onerror 発火
      favicon.onerror?.({} as Event);

      expect(placeholder.textContent).toBe('🌐');
      expect(placeholder.style.display).toBe('block');
    });

    it('data-history-url が空のアイテムは Favicon を読み込まない', async () => {
      mockGetRecentHistory.mockResolvedValue([
        {
          id: '1',
          url: '',
          title: 'URL なしアイテム',
          lastVisitTime: 1640995200000,
          visitCount: 0,
          typedCount: 0,
        },
      ]);

      await panel.activate();

      const favicon = container.querySelector(
        '.history-favicon'
      ) as HTMLImageElement;
      // data-history-url が空のため getFavicon は呼ばれず、画像は hidden のまま
      expect(favicon.getAttribute('data-history-url')).toBe('');
      expect(mockGetFavicon).not.toHaveBeenCalled();
      expect(favicon.classList.contains('hidden')).toBe(true);
    });
  });
});
