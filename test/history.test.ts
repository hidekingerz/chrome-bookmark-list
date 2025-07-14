import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRecentHistory, type HistoryItem } from '../src/scripts/history';

// Chrome APIのモック
const mockHistorySearch = vi.fn();
global.chrome = {
  history: {
    search: mockHistorySearch,
  },
} as any;

describe('履歴API (history.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getRecentHistory', () => {
    it('正常なレスポンスの場合、履歴アイテムを正しく変換して返す', async () => {
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

      mockHistorySearch.mockResolvedValue(mockHistoryItems);

      const result = await getRecentHistory();

      expect(mockHistorySearch).toHaveBeenCalledWith({
        text: '',
        maxResults: 50,
        startTime: expect.any(Number),
      });

      expect(result).toEqual([
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
      ]);
    });

    it('カスタムmaxResultsパラメータを指定した場合、正しくAPIに渡される', async () => {
      mockHistorySearch.mockResolvedValue([]);

      await getRecentHistory(25);

      expect(mockHistorySearch).toHaveBeenCalledWith({
        text: '',
        maxResults: 25,
        startTime: expect.any(Number),
      });
    });

    it('不完全なデータでもデフォルト値で補完される', async () => {
      const mockHistoryItems = [
        {
          // idなし
          url: 'https://example.com',
          title: 'Example Site',
          // lastVisitTimeなし
          // visitCountなし
          // typedCountなし
        },
        {
          id: '2',
          // urlなし
          // titleなし
          lastVisitTime: 1640995100000,
          visitCount: 10,
          typedCount: 1,
        },
      ];

      mockHistorySearch.mockResolvedValue(mockHistoryItems);

      const result = await getRecentHistory();

      expect(result).toEqual([
        {
          id: 'https://example.com',
          url: 'https://example.com',
          title: 'Example Site',
          lastVisitTime: 0,
          visitCount: 0,
          typedCount: 0,
        },
        {
          id: '2',
          url: '',
          title: '',
          lastVisitTime: 1640995100000,
          visitCount: 10,
          typedCount: 1,
        },
      ]);
    });

    it('タイトルがない場合はURLをタイトルとして使用', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          url: 'https://example.com',
          // titleなし
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ];

      mockHistorySearch.mockResolvedValue(mockHistoryItems);

      const result = await getRecentHistory();

      expect(result[0].title).toBe('https://example.com');
    });

    it('urlもtitleもない場合は空文字を使用', async () => {
      const mockHistoryItems = [
        {
          id: '1',
          // urlなし
          // titleなし
          lastVisitTime: 1640995200000,
          visitCount: 5,
          typedCount: 2,
        },
      ];

      mockHistorySearch.mockResolvedValue(mockHistoryItems);

      const result = await getRecentHistory();

      expect(result[0].url).toBe('');
      expect(result[0].title).toBe('');
    });

    it('startTimeが過去7日間に設定されている', async () => {
      mockHistorySearch.mockResolvedValue([]);

      const beforeCall = Date.now();
      await getRecentHistory();
      const afterCall = Date.now();

      const callArgs = mockHistorySearch.mock.calls[0][0];
      const expectedStartTime = beforeCall - 7 * 24 * 60 * 60 * 1000;
      const actualStartTime = callArgs.startTime;

      // 呼び出し前後の時間を考慮して範囲チェック
      expect(actualStartTime).toBeGreaterThanOrEqual(
        expectedStartTime - 1000
      );
      expect(actualStartTime).toBeLessThanOrEqual(
        afterCall - 7 * 24 * 60 * 60 * 1000 + 1000
      );
    });

    it('API呼び出しが失敗した場合は空配列を返す', async () => {
      mockHistorySearch.mockRejectedValue(new Error('API Error'));

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await getRecentHistory();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalledWith(
        '履歴の取得に失敗しました:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('空の履歴が返された場合は空配列を返す', async () => {
      mockHistorySearch.mockResolvedValue([]);

      const result = await getRecentHistory();

      expect(result).toEqual([]);
    });
  });

  describe('HistoryItem型', () => {
    it('正しい型定義を持つ', () => {
      const historyItem: HistoryItem = {
        id: '1',
        url: 'https://example.com',
        title: 'Example Site',
        lastVisitTime: 1640995200000,
        visitCount: 5,
        typedCount: 2,
      };

      expect(typeof historyItem.id).toBe('string');
      expect(typeof historyItem.url).toBe('string');
      expect(typeof historyItem.title).toBe('string');
      expect(typeof historyItem.lastVisitTime).toBe('number');
      expect(typeof historyItem.visitCount).toBe('number');
      expect(typeof historyItem.typedCount).toBe('number');
    });
  });
});