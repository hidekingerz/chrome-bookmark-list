import { getRecentHistory, type HistoryItem } from '../../scripts/history.js';
import { escapeHtml, getFavicon } from '../../scripts/utils.js';

/**
 * 「最近の履歴」タブパネル
 *
 * 過去7日間の履歴を一覧表示し、検索でフィルタリングできる。
 * 与えられたコンテナ要素の中にUIを構築する。
 */
export class HistoryPanel {
  private container: HTMLElement;
  private contentElement: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private historyItems: HistoryItem[] = [];
  private filteredHistoryItems: HistoryItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init(): void {
    this.container.classList.add('history-panel');
    this.container.innerHTML = `
      <div class="panel-search">
        <input type="text" class="history-search-input" placeholder="履歴を検索..." />
      </div>
      <div class="history-panel-content">
        <div class="history-loading">履歴を読み込み中...</div>
      </div>
    `;

    this.searchInput = this.container.querySelector('.history-search-input');
    this.contentElement = this.container.querySelector(
      '.history-panel-content'
    );

    this.searchInput?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.filterHistory(target.value);
    });

    // 履歴アイテムのクリックで新しいタブを開く（イベント委譲）
    this.contentElement?.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest(
        '.history-item-title'
      ) as HTMLElement | null;
      if (!link) return;

      e.preventDefault();
      const url = link.getAttribute('data-url');
      if (url) {
        chrome.tabs.create({ url });
      }
    });
  }

  /**
   * タブがアクティブになったときに履歴を読み込んで表示する
   */
  public async activate(): Promise<void> {
    await this.loadHistory();
  }

  private async loadHistory(): Promise<void> {
    try {
      this.historyItems = await getRecentHistory(50);
      this.filteredHistoryItems = this.historyItems;
      this.renderHistory();
    } catch (error) {
      console.error('履歴の読み込みに失敗しました:', error);
      this.renderError();
    }
  }

  private renderHistory(): void {
    if (!this.contentElement) return;

    if (this.filteredHistoryItems.length === 0) {
      if (this.historyItems.length === 0) {
        this.contentElement.innerHTML =
          '<div class="history-empty">履歴が見つかりませんでした</div>';
      } else {
        this.contentElement.innerHTML =
          '<div class="history-empty">検索結果が見つかりませんでした</div>';
      }
      return;
    }

    const html = this.filteredHistoryItems
      .map((item) => this.renderHistoryItem(item))
      .join('');
    this.contentElement.innerHTML = `<div class="history-list">${html}</div>`;

    // Faviconの非同期読み込み
    this.loadFavicons();
  }

  private renderHistoryItem(item: HistoryItem): string {
    const date = new Date(item.lastVisitTime).toLocaleDateString('ja-JP');
    const time = new Date(item.lastVisitTime).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const safeUrl = escapeHtml(item.url);
    const safeTitle = escapeHtml(item.title);

    return `
      <div class="history-item">
        <div class="history-item-icon">
          <img class="history-favicon hidden" data-history-url="${safeUrl}" alt="favicon">
          <span class="favicon-placeholder">🌐</span>
        </div>
        <div class="history-item-content">
          <a href="#" class="history-item-title" data-url="${safeUrl}">${safeTitle}</a>
          <div class="history-item-url">${safeUrl}</div>
          <div class="history-item-meta">
            <span class="history-item-date">${date} ${time}</span>
            <span class="history-item-count">訪問回数: ${item.visitCount}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderError(): void {
    if (!this.contentElement) return;
    this.contentElement.innerHTML =
      '<div class="history-error">履歴の読み込みに失敗しました</div>';
  }

  private async loadFavicons(): Promise<void> {
    const faviconImages = this.container.querySelectorAll(
      '.history-favicon'
    ) as NodeListOf<HTMLImageElement>;
    const faviconPlaceholders = this.container.querySelectorAll(
      '.favicon-placeholder'
    ) as NodeListOf<HTMLElement>;

    if (!faviconImages || !faviconPlaceholders) return;

    const faviconPromises = Array.from(faviconImages).map(
      async (img, index) => {
        const url = img.getAttribute('data-history-url');
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
      }
    );

    await Promise.allSettled(faviconPromises);
  }

  private filterHistory(searchTerm: string): void {
    if (!searchTerm.trim()) {
      this.filteredHistoryItems = this.historyItems;
    } else {
      const lowercaseSearchTerm = searchTerm.toLowerCase();
      this.filteredHistoryItems = this.historyItems.filter(
        (item) =>
          item.title.toLowerCase().includes(lowercaseSearchTerm) ||
          item.url.toLowerCase().includes(lowercaseSearchTerm)
      );
    }
    this.renderHistory();
  }
}
