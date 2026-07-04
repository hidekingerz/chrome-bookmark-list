import type { FaviconCacheData } from '../types/bookmark.js';

/**
 * Faviconの取得とキャッシュ管理を担当するサービス
 */
export class FaviconService {
  private cache = new Map<string, string>();
  // ドメイン単位の in-flight リクエスト。同一ドメインの並行取得を1つの
  // Promise に集約し、多重フェッチ・多重 storage 書込を防ぐ（#104）
  private inFlight = new Map<string, Promise<string>>();
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

      // 同一ドメインが既に取得中なら、その Promise を共有して重複を避ける
      const pending = this.inFlight.get(domain);
      if (pending) {
        return await pending;
      }

      // 新規取得（in-flight に登録し、完了後に必ず解除する）
      const request = this.fetchAndCache(domain, url);
      this.inFlight.set(domain, request);
      try {
        return await request;
      } finally {
        this.inFlight.delete(domain);
      }
    } catch (error) {
      console.warn('Favicon取得エラー:', url, error);
      return this.getDefaultFavicon();
    }
  }

  /**
   * ファビコンを取得してキャッシュへ保存する（in-flight 集約の実体）
   */
  private async fetchAndCache(domain: string, url: string): Promise<string> {
    const faviconUrl = await this.fetchFavicon(url);
    this.cache.set(domain, faviconUrl);
    await this.saveCacheToStorage();
    return faviconUrl;
  }

  /**
   * ファビコンを実際に取得する
   */
  private async fetchFavicon(url: string): Promise<string> {
    const strategies = [() => this.tryStandardPath(url)];

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
