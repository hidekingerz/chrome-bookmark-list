import { loadFavicons } from '../../scripts/favicon.js';
import { getRecentHistory, type HistoryItem } from '../../scripts/history.js';
import {
  formatDateTime,
  matchesSearchTerm,
  renderHistoryListItem,
} from '../HistoryList/index.js';

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
    void loadFavicons(this.container, '.history-favicon');
  }

  private renderHistoryItem(item: HistoryItem): string {
    return renderHistoryListItem({
      url: item.url,
      title: item.title,
      subtitle: item.url,
      meta: [
        {
          className: 'history-item-date',
          text: formatDateTime(item.lastVisitTime),
        },
        {
          className: 'history-item-count',
          text: `訪問回数: ${item.visitCount}`,
        },
      ],
    });
  }

  private renderError(): void {
    if (!this.contentElement) return;
    this.contentElement.innerHTML =
      '<div class="history-error">履歴の読み込みに失敗しました</div>';
  }

  private filterHistory(searchTerm: string): void {
    this.filteredHistoryItems = this.historyItems.filter((item) =>
      matchesSearchTerm(item, searchTerm)
    );
    this.renderHistory();
  }
}
