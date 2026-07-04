import type { FaviconCacheData } from '../types/bookmark.js';

/**
 * Faviconの取得とキャッシュ管理を担当するサービス
 */
export class FaviconService {
  private cache = new Map<string, string>();
  private readonly cacheKey = 'bookmark_favicon_cache';
  private readonly cacheExpiryDays = 7;

  /**
   * Faviconキャッシュを初期化する
   */
  async initCache(): Promise<void> {
    try {
      // chrome.storageの存在チェック
      if (!chrome?.storage?.local) {
        console.warn(
          'chrome.storage.localが利用できません。キャッシュ機能を無効化します。'
        );
        return;
      }

      const result = await chrome.storage.local.get(this.cacheKey);
      const cacheData = result[this.cacheKey] as FaviconCacheData | undefined;

      if (cacheData && this.isCacheValid(cacheData)) {
        this.cache = new Map(Object.entries(cacheData.data));
        console.log(`✅ Faviconキャッシュ読み込み完了: ${this.cache.size}件`);
      } else {
        console.log('🔄 Faviconキャッシュが期限切れまたは存在しません');
        await this.saveCacheToStorage();
      }
    } catch (error) {
      console.warn('⚠️ Faviconキャッシュの初期化に失敗:', error);
    }
  }

  /**
   * ドメインのファビコンを取得する（キャッシュ優先）
   */
  async getFavicon(url: string): Promise<string> {
    try {
      const domain = this.getDomain(url);

      // キャッシュから取得
      const cached = this.cache.get(domain);
      if (cached) {
        return cached;
      }

      // 新規取得
      const faviconUrl = await this.fetchFavicon(url);

      // キャッシュに保存
      this.cache.set(domain, faviconUrl);
      await this.saveCacheToStorage();

      return faviconUrl;
    } catch (error) {
      console.warn('Favicon取得エラー:', url, error);
      return this.getDefaultFavicon();
    }
  }

  /**
   * ファビコンを実際に取得する
   */
  private async fetchFavicon(url: string): Promise<string> {
    const strategies = [
      () => this.tryStandardPath(url),
      () => this.tryHtmlParsing(url),
    ];

    for (const strategy of strategies) {
      try {
        const result = await strategy();
        if (result) {
          return result;
        }
      } catch {
        // 次の戦略を試す
      }
    }

    return this.getDefaultFavicon();
  }

  /**
   * 標準パス（/favicon.ico）でファビコンを取得
   */
  private async tryStandardPath(url: string): Promise<string | null> {
    const domain = this.getDomain(url);
    const faviconUrl = `https://${domain}/favicon.ico`;

    return this.validateFaviconUrl(faviconUrl);
  }

  /**
   * HTMLを解析してファビコンリンクを取得
   */
  private async tryHtmlParsing(url: string): Promise<string | null> {
    const hasPermission = await this.checkHostPermission(url);
    if (!hasPermission) {
      return null;
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (!response.ok) return null;

      const html = await response.text();
      const faviconUrl = this.extractFaviconFromHtml(html, url);

      return faviconUrl ? await this.validateFaviconUrl(faviconUrl) : null;
    } catch {
      return null;
    }
  }

  /**
   * HTMLからファビコンリンクを抽出
   */
  private extractFaviconFromHtml(html: string, baseUrl: string): string | null {
    const faviconRegex =
      /<link[^>]*rel=['"](?:shortcut )?icon['"][^>]*href=['"]([^'"]+)['"][^>]*>/i;
    const match = html.match(faviconRegex);

    if (match?.[1]) {
      const href = match[1];

      if (href.startsWith('http')) {
        return href;
      }

      const domain = this.getDomain(baseUrl);
      return href.startsWith('/')
        ? `https://${domain}${href}`
        : `https://${domain}/${href}`;
    }

    return null;
  }

  /**
   * ファビコンURLの有効性を検証
   */
  private async validateFaviconUrl(faviconUrl: string): Promise<string | null> {
    return new Promise((resolve) => {
      const img = new Image();

      const timeout = setTimeout(() => {
        resolve(null);
      }, 1000);

      img.onload = () => {
        clearTimeout(timeout);
        resolve(faviconUrl);
      };

      img.onerror = () => {
        clearTimeout(timeout);
        resolve(null);
      };

      img.src = faviconUrl;
    });
  }

  /**
   * ホストの権限を確認
   */
  private async checkHostPermission(url: string): Promise<boolean> {
    try {
      return await chrome.permissions.contains({
        origins: [`${new URL(url).origin}/*`],
      });
    } catch (error) {
      console.warn('権限チェックエラー:', error);
      console.warn('HTMLからのfavicon検出には権限が必要です:', url);
      return false;
    }
  }

  /**
   * URLからドメインを抽出
   */
  private getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'localhost';
    }
  }

  /**
   * デフォルトファビコンを取得
   */
  private getDefaultFavicon(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTggMUMxMS44NjYgMSAxNSA0LjEzNCAxNSA4QzE1IDExLjg2NiAxMS44NjYgMTUgOCAxNUM0LjEzNCAxNSAxIDExLjg2NiAxIDhDMSA0LjEzNCA0LjEzNCAxIDggMVoiIGZpbGw9IiM2NjdFRUEiLz4KPHA7dGggZD0iTTUuNSA2SDEwLjVWMTBINS41VjZaIiBmaWxsPSJ3aGl0ZSIvPgo8L3N2Zz4K';
  }

  /**
   * キャッシュの有効性を確認
   */
  private isCacheValid(cacheData: FaviconCacheData): boolean {
    const now = Date.now();
    const expiry = this.cacheExpiryDays * 24 * 60 * 60 * 1000;
    return now - cacheData.timestamp < expiry;
  }

  /**
   * キャッシュをストレージに保存
   */
  private async saveCacheToStorage(): Promise<void> {
    try {
      // chrome.storageの存在チェック
      if (!chrome?.storage?.local) {
        console.warn(
          'chrome.storage.localが利用できません。キャッシュ保存をスキップします。'
        );
        return;
      }

      const cacheData: FaviconCacheData = {
        data: Object.fromEntries(this.cache),
        timestamp: Date.now(),
      };

      await chrome.storage.local.set({
        [this.cacheKey]: cacheData,
      });
    } catch (error) {
      console.warn('Faviconキャッシュの保存に失敗:', error);
    }
  }

  /**
   * キャッシュをクリア
   */
  async clearCache(): Promise<void> {
    this.cache.clear();

    if (chrome?.storage?.local) {
      await chrome.storage.local.remove(this.cacheKey);
    }

    console.log('Faviconキャッシュをクリアしました');
  }
}
