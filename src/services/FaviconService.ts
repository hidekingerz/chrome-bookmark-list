/**
 * Faviconの取得を担当するサービス。
 * Chrome の _favicon API（chrome.runtime.getURL('/_favicon/...')）を用いて
 * ローカル保有の favicon を返す。外部通信・ホスト名流出は発生しない（#98/#111）。
 */
export class FaviconService {
  private readonly size = 32;

  /**
   * ページ URL に対応する favicon の URL を返す。
   * Chrome がローカルに favicon を持っていれば実 favicon、無ければ Chrome の
   * デフォルトアイコンを返す。chrome.runtime が使えない場合は既存の SVG を返す。
   */
  getFavicon(url: string): string {
    try {
      if (chrome?.runtime?.getURL) {
        return chrome.runtime.getURL(
          `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=${this.size}`
        );
      }
    } catch {
      // フォールバックへ
    }
    return this.getDefaultFavicon();
  }

  /**
   * デフォルトファビコン（安全網）
   */
  private getDefaultFavicon(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMUMxMS44NjYgMSAxNSA0LjEzNCAxNSA4QzE1IDExLjg2NiAxMS44NjYgMTUgOCAxNUM0LjEzNCAxNSAxIDExLjg2NiAxIDhDMSA0LjEzNCA0LjEzNCAxIDggMVoiIGZpbGw9IiM2NjdFRUEiLz4KPHA7dGggZD0iTTUuNSA2SDEwLjVWMTBINS41VjZaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K';
  }
}
