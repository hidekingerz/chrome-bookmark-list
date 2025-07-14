import { getRecentHistory, type HistoryItem } from '../../scripts/history.js';
import { getFavicon } from '../../scripts/utils.js';

export class HistorySidebar {
  private isOpen = false;
  private sidebarElement: HTMLElement | null = null;
  private overlayElement: HTMLElement | null = null;
  private toggleButton: HTMLElement | null = null;
  private historyItems: HistoryItem[] = [];
  private filteredHistoryItems: HistoryItem[] = [];
  private searchInput: HTMLInputElement | null = null;

  constructor() {
    this.init();
  }

  private init(): void {
    this.createSidebar();
    this.createToggleButton();
    this.setupEventListeners();
  }

  private createSidebar(): void {
    // サイドバーの作成
    this.sidebarElement = document.createElement('div');
    this.sidebarElement.className = 'history-sidebar';
    this.sidebarElement.innerHTML = `
      <div class="history-sidebar-header">
        <h2>🕐 履歴</h2>
        <button class="history-sidebar-close" aria-label="閉じる">×</button>
      </div>
      <div class="history-sidebar-search">
        <input type="text" class="history-search-input" placeholder="履歴を検索..." />
      </div>
      <div class="history-sidebar-content">
        <div class="history-loading">履歴を読み込み中...</div>
      </div>
    `;

    // オーバーレイの作成
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'history-sidebar-overlay';

    document.body.appendChild(this.sidebarElement);
    document.body.appendChild(this.overlayElement);

    // 検索入力要素を取得
    this.searchInput = this.sidebarElement.querySelector('.history-search-input') as HTMLInputElement;
  }

  private createToggleButton(): void {
    this.toggleButton = document.createElement('button');
    this.toggleButton.className = 'history-toggle-btn';
    this.toggleButton.innerHTML = '🕐';
    this.toggleButton.setAttribute('aria-label', '履歴を表示');
    this.toggleButton.title = '履歴を表示';

    // ヘッダーに追加
    const header = document.querySelector('header');
    if (header) {
      header.appendChild(this.toggleButton);
    }
  }

  private setupEventListeners(): void {
    // トグルボタンのクリック
    this.toggleButton?.addEventListener('click', () => {
      this.toggle();
    });

    // 閉じるボタンのクリック
    this.sidebarElement
      ?.querySelector('.history-sidebar-close')
      ?.addEventListener('click', () => {
        this.close();
      });

    // オーバーレイのクリック
    this.overlayElement?.addEventListener('click', () => {
      this.close();
    });

    // ESCキーで閉じる
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.close();
      }
    });

    // 検索入力の監視
    this.searchInput?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.filterHistory(target.value);
    });
  }

  public async toggle(): Promise<void> {
    if (this.isOpen) {
      this.close();
    } else {
      await this.open();
    }
  }

  public async open(): Promise<void> {
    if (this.isOpen) return;

    this.isOpen = true;
    this.sidebarElement?.classList.add('open');
    this.overlayElement?.classList.add('active');
    document.body.style.overflow = 'hidden';

    // 履歴を読み込み
    await this.loadHistory();
  }

  public close(): void {
    if (!this.isOpen) return;

    this.isOpen = false;
    this.sidebarElement?.classList.remove('open');
    this.overlayElement?.classList.remove('active');
    document.body.style.overflow = '';
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
    const content = this.sidebarElement?.querySelector(
      '.history-sidebar-content'
    );
    if (!content) return;

    if (this.filteredHistoryItems.length === 0) {
      if (this.historyItems.length === 0) {
        content.innerHTML =
          '<div class="history-empty">履歴が見つかりませんでした</div>';
      } else {
        content.innerHTML =
          '<div class="history-empty">検索結果が見つかりませんでした</div>';
      }
      return;
    }

    const html = this.filteredHistoryItems
      .map((item) => this.renderHistoryItem(item))
      .join('');
    content.innerHTML = `<div class="history-list">${html}</div>`;

    // Faviconの非同期読み込み
    this.loadFavicons();
  }

  private renderHistoryItem(item: HistoryItem): string {
    const date = new Date(item.lastVisitTime).toLocaleDateString('ja-JP');
    const time = new Date(item.lastVisitTime).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return `
      <div class="history-item">
        <div class="history-item-icon">
          <img class="history-favicon hidden" data-history-url="${item.url}" alt="favicon">
          <span class="favicon-placeholder">🌐</span>
        </div>
        <div class="history-item-content">
          <a href="${item.url}" class="history-item-title" target="_blank">${item.title}</a>
          <div class="history-item-url">${item.url}</div>
          <div class="history-item-meta">
            <span class="history-item-date">${date} ${time}</span>
            <span class="history-item-count">訪問回数: ${item.visitCount}</span>
          </div>
        </div>
      </div>
    `;
  }

  private renderError(): void {
    const content = this.sidebarElement?.querySelector(
      '.history-sidebar-content'
    );
    if (!content) return;

    content.innerHTML =
      '<div class="history-error">履歴の読み込みに失敗しました</div>';
  }

  private async loadFavicons(): Promise<void> {
    const faviconImages = this.sidebarElement?.querySelectorAll(
      '.history-favicon'
    ) as NodeListOf<HTMLImageElement>;
    const faviconPlaceholders = this.sidebarElement?.querySelectorAll(
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
