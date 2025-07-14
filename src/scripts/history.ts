export interface HistoryItem {
  id: string;
  url: string;
  title: string;
  lastVisitTime: number;
  visitCount: number;
  typedCount: number;
}

export async function getRecentHistory(
  maxResults = 50
): Promise<HistoryItem[]> {
  try {
    const historyItems = await chrome.history.search({
      text: '',
      maxResults: maxResults,
      startTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // 過去7日間
    });

    return historyItems.map((item) => ({
      id: item.id || item.url || '',
      url: item.url || '',
      title: item.title || item.url || '',
      lastVisitTime: item.lastVisitTime || 0,
      visitCount: item.visitCount || 0,
      typedCount: item.typedCount || 0,
    }));
  } catch (error) {
    console.error('履歴の取得に失敗しました:', error);
    return [];
  }
}
