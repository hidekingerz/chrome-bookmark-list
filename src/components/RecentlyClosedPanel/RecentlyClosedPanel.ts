import { loadFavicons } from '../../scripts/favicon.js';
import { formatDateTime, renderHistoryListItem } from '../HistoryList/index.js';

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
    void loadFavicons(this.container, '.history-favicon');
  }

  private renderItem(tab: RecentlyClosedTab): string {
    let domain: string;
    try {
      domain = new URL(tab.url).hostname;
    } catch {
      domain = tab.url;
    }
    return renderHistoryListItem({
      url: tab.url,
      title: tab.title,
      subtitle: domain,
      // 閉じた時刻（履歴パネルと同じ体裁）。無ければメタ行なし
      meta: tab.closedAt
        ? [
            {
              className: 'history-item-date',
              text: formatDateTime(tab.closedAt),
            },
          ]
        : [],
      attributes: { 'data-session-id': tab.sessionId },
    });
  }

  private renderError(): void {
    if (!this.contentElement) return;
    this.contentElement.innerHTML =
      '<div class="history-error">最近閉じたタブの読み込みに失敗しました</div>';
  }
}
