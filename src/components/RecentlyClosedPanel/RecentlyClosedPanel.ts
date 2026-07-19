import { escapeHtml, getFavicon } from '../../scripts/utils.js';

/** 最近閉じたタブの表示用データ */
interface RecentlyClosedTab {
  sessionId: string;
  title: string;
  url: string;
  /** 閉じた時刻（ms）。lastModified が無ければ null */
  closedAt: number | null;
}

/**
 * 「最近閉じたタブ」タブパネル
 *
 * chrome.sessions.getRecentlyClosed() から単体タブ（window エントリは除外）を
 * 一覧表示し、クリックで chrome.sessions.restore() により復元する。
 * 復元後は一覧を再読み込みする（復元した項目は一覧から消える）。
 * 与えられたコンテナ要素の中にUIを構築する。
 */
export class RecentlyClosedPanel {
  private container: HTMLElement;
  private contentElement: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.init();
  }

  private init(): void {
    this.container.classList.add('recently-closed-panel');
    this.container.innerHTML = `
      <div class="recently-closed-content">
        <div class="history-loading">最近閉じたタブを読み込み中...</div>
      </div>
    `;

    this.contentElement = this.container.querySelector(
      '.recently-closed-content'
    );

    // 行クリックで復元（イベント委譲）
    this.contentElement?.addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest(
        '.history-item[data-session-id]'
      ) as HTMLElement | null;
      if (!item) return;

      e.preventDefault();
      const sessionId = item.getAttribute('data-session-id');
      if (sessionId) {
        void this.restoreTab(sessionId);
      }
    });
  }

  /**
   * タブがアクティブになったときに一覧を読み込んで表示する。
   * restore で内容が変わるため毎回再取得する。
   */
  public async activate(): Promise<void> {
    await this.load();
  }

  private async load(): Promise<void> {
    try {
      const sessions = await chrome.sessions.getRecentlyClosed();
      // 自拡張の New Tab ページはノイズなので除外する
      const ownPagePrefix = `chrome-extension://${chrome.runtime.id}/`;
      const seenUrls = new Set<string>();
      const tabs: RecentlyClosedTab[] = [];
      for (const session of sessions) {
        const tab = session.tab;
        // window エントリ、および sessionId/url の無いタブは表示しない
        if (!tab?.sessionId || !tab.url) continue;
        if (tab.url.startsWith(ownPagePrefix)) continue;
        // 同一 URL は最新（先頭側）のみ表示
        if (seenUrls.has(tab.url)) continue;
        seenUrls.add(tab.url);
        tabs.push({
          sessionId: tab.sessionId,
          title: tab.title || tab.url,
          url: tab.url,
          closedAt: session.lastModified ? session.lastModified * 1000 : null,
        });
      }
      this.render(tabs);
    } catch (error) {
      console.error('最近閉じたタブの読み込みに失敗しました:', error);
      this.renderError();
    }
  }

  private async restoreTab(sessionId: string): Promise<void> {
    try {
      await chrome.sessions.restore(sessionId);
    } catch (error) {
      console.error('タブの復元に失敗しました:', error);
    }
    // 復元後（失敗時も実状態に合わせるため）一覧を再読み込み
    await this.load();
  }

  private render(tabs: RecentlyClosedTab[]): void {
    if (!this.contentElement) return;

    if (tabs.length === 0) {
      this.contentElement.innerHTML =
        '<div class="history-empty">最近閉じたタブはありません</div>';
      return;
    }

    const html = tabs.map((tab) => this.renderItem(tab)).join('');
    this.contentElement.innerHTML = `<div class="history-list">${html}</div>`;

    // Favicon の非同期読み込み
    void this.loadFavicons();
  }

  private renderItem(tab: RecentlyClosedTab): string {
    const safeUrl = escapeHtml(tab.url);
    const safeTitle = escapeHtml(tab.title);
    const safeSessionId = escapeHtml(tab.sessionId);

    let domain: string;
    try {
      domain = new URL(tab.url).hostname;
    } catch {
      domain = tab.url;
    }

    // 閉じた時刻（履歴パネルと同じ体裁）
    let metaHtml = '';
    if (tab.closedAt) {
      const date = new Date(tab.closedAt).toLocaleDateString('ja-JP');
      const time = new Date(tab.closedAt).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
      });
      metaHtml = `
          <div class="history-item-meta">
            <span class="history-item-date">${date} ${time}</span>
          </div>`;
    }

    return `
      <div class="history-item" data-session-id="${safeSessionId}">
        <div class="history-item-icon">
          <img class="recently-closed-favicon hidden" data-tab-url="${safeUrl}" alt="favicon">
          <span class="favicon-placeholder">🌐</span>
        </div>
        <div class="history-item-content">
          <a href="#" class="history-item-title">${safeTitle}</a>
          <div class="history-item-url">${escapeHtml(domain)}</div>${metaHtml}
        </div>
      </div>
    `;
  }

  private renderError(): void {
    if (!this.contentElement) return;
    this.contentElement.innerHTML =
      '<div class="history-error">最近閉じたタブの読み込みに失敗しました</div>';
  }

  private async loadFavicons(): Promise<void> {
    const faviconImages = this.container.querySelectorAll(
      '.recently-closed-favicon'
    ) as NodeListOf<HTMLImageElement>;
    const faviconPlaceholders = this.container.querySelectorAll(
      '.favicon-placeholder'
    ) as NodeListOf<HTMLElement>;

    const faviconPromises = Array.from(faviconImages).map(
      async (img, index) => {
        const url = img.getAttribute('data-tab-url');
        const placeholder = faviconPlaceholders[index];
        if (!url) return;

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
        }
      }
    );

    await Promise.allSettled(faviconPromises);
  }
}
