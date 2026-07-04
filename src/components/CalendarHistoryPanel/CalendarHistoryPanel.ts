import type { HistoryItem } from '../../scripts/history.js';
import { escapeHtml, getFavicon } from '../../scripts/utils.js';

interface DayHistory {
  date: Date;
  historyCount: number;
  items: HistoryItem[];
}

interface HourGroup {
  hour: number;
  items: HistoryItem[];
}

/**
 * 「カレンダー」タブパネル
 *
 * 月単位のカレンダー上に履歴の有無を表示し、日付を選択すると
 * その日のタイムラインを時間帯ごとに表示する。
 * 与えられたコンテナ要素の中にUIを構築する。
 */
export class CalendarHistoryPanel {
  private container: HTMLElement;
  private currentMonth: Date;
  private selectedDate: Date | null = null;
  private monthHistory: Map<string, DayHistory> = new Map();
  private searchInput: HTMLInputElement | null = null;
  private searchTerm = '';
  // 月送りの非同期競合対策。loadMonthHistory はこの世代トークンを進め、
  // await 後に自分が最新世代でなければ結果を破棄する。
  private loadRequestId = 0;

  constructor(container: HTMLElement) {
    this.container = container;
    this.currentMonth = new Date();
    this.currentMonth.setDate(1);
    this.currentMonth.setHours(0, 0, 0, 0);
    this.init();
  }

  private init(): void {
    this.container.classList.add('calendar-history-panel');
    this.container.innerHTML = `
      <div class="panel-search">
        <input type="text" class="calendar-history-search-input" placeholder="履歴を検索..." />
      </div>
      <div class="calendar-history-panel-content">
        <div class="calendar-view">
          <div class="calendar-header">
            <button class="calendar-nav-btn prev-month" aria-label="前月">‹</button>
            <div class="calendar-month-year"></div>
            <button class="calendar-nav-btn next-month" aria-label="次月">›</button>
          </div>
          <div class="calendar-weekdays">
            <div class="calendar-weekday">日</div>
            <div class="calendar-weekday">月</div>
            <div class="calendar-weekday">火</div>
            <div class="calendar-weekday">水</div>
            <div class="calendar-weekday">木</div>
            <div class="calendar-weekday">金</div>
            <div class="calendar-weekday">土</div>
          </div>
          <div class="calendar-days"></div>
        </div>
        <div class="history-timeline">
          <div class="timeline-placeholder">日付を選択してください</div>
        </div>
      </div>
    `;

    this.searchInput = this.container.querySelector(
      '.calendar-history-search-input'
    );

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // 月の切り替えボタン
    this.container
      .querySelector('.prev-month')
      ?.addEventListener('click', async () => {
        await this.changeMonth(-1);
      });

    this.container
      .querySelector('.next-month')
      ?.addEventListener('click', async () => {
        await this.changeMonth(1);
      });

    // 検索入力の監視
    // selectedDate が無くても毎回 renderTimeline を呼ぶことで、入力ごとに DOM が更新され
    // ブラウザの undo (Cmd+Z) が他の検索欄と同様に細かい単位で動くようにする
    this.searchInput?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.searchTerm = target.value;
      if (this.selectedDate) {
        this.renderTimeline(this.selectedDate);
      } else {
        this.renderEmptyTimeline();
      }
    });

    // タイムラインアイテムのクリックで新しいタブを開く（イベント委譲）
    this.container
      .querySelector('.history-timeline')
      ?.addEventListener('click', (e) => {
        const link = (e.target as HTMLElement).closest(
          '.timeline-item-title'
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
   * タブがアクティブになったときに当月の履歴を読み込んでカレンダーを描画する
   */
  public async activate(): Promise<void> {
    await this.loadMonthHistory();
    this.renderCalendar();
  }

  private async changeMonth(delta: number): Promise<void> {
    this.currentMonth.setMonth(this.currentMonth.getMonth() + delta);
    await this.loadMonthHistory();
    this.renderCalendar();
  }

  private async loadMonthHistory(): Promise<void> {
    const requestId = ++this.loadRequestId;
    try {
      const startOfMonth = new Date(this.currentMonth);
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const endOfMonth = new Date(this.currentMonth);
      endOfMonth.setMonth(endOfMonth.getMonth() + 1);
      endOfMonth.setDate(0);
      endOfMonth.setHours(23, 59, 59, 999);

      const historyItems = await chrome.history.search({
        text: '',
        startTime: startOfMonth.getTime(),
        endTime: endOfMonth.getTime(),
        maxResults: 10000,
      });

      // 世代チェック: await 中により新しい読み込みが始まっていたら、この結果は破棄する。
      // 先発リクエストの遅延完了が後発（新しい月）の表示を上書きし、ヘッダとデータが
      // 食い違うのを防ぐ。
      if (requestId !== this.loadRequestId) {
        return;
      }

      // 日付ごとにグループ化
      this.monthHistory.clear();
      for (const item of historyItems) {
        if (!item.lastVisitTime) continue;

        const date = new Date(item.lastVisitTime);
        const dateKey = this.getDateKey(date);

        if (!this.monthHistory.has(dateKey)) {
          this.monthHistory.set(dateKey, {
            date: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
            historyCount: 0,
            items: [],
          });
        }

        const dayHistory = this.monthHistory.get(dateKey);
        if (dayHistory) {
          dayHistory.historyCount++;
          dayHistory.items.push({
            id: item.id || item.url || '',
            url: item.url || '',
            title: item.title || item.url || '',
            lastVisitTime: item.lastVisitTime || 0,
            visitCount: item.visitCount || 0,
            typedCount: item.typedCount || 0,
          });
        }
      }
    } catch (error) {
      // 失敗したのが最新世代の読み込みなら、古い月のデータを破棄して
      // 新しい月として流用されるのを防ぐ（古い世代の失敗は無視）。
      if (requestId === this.loadRequestId) {
        this.monthHistory.clear();
      }
      console.error('履歴の読み込みに失敗しました:', error);
    }
  }

  private getDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  private renderCalendar(): void {
    const monthYearElement = this.container.querySelector(
      '.calendar-month-year'
    );
    const daysElement = this.container.querySelector('.calendar-days');

    if (!monthYearElement || !daysElement) return;

    // 月年の表示
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth() + 1;
    monthYearElement.textContent = `${year}年 ${month}月`;

    // カレンダーの日付を生成
    const firstDay = new Date(this.currentMonth);
    const lastDay = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth() + 1,
      0
    );

    const firstDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    let html = '';

    // 前月の日付
    const prevMonthLastDay = new Date(
      this.currentMonth.getFullYear(),
      this.currentMonth.getMonth(),
      0
    );
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const day = prevMonthLastDay.getDate() - i;
      html += `<div class="calendar-day other-month">${day}</div>`;
    }

    // 今月の日付
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(
        this.currentMonth.getFullYear(),
        this.currentMonth.getMonth(),
        day
      );
      const dateKey = this.getDateKey(date);
      const dayHistory = this.monthHistory.get(dateKey);
      const historyCount = dayHistory?.historyCount || 0;

      const isToday = date.getTime() === today.getTime();
      const isSelected =
        this.selectedDate && date.getTime() === this.selectedDate.getTime();

      let classes = 'calendar-day';
      if (isToday) classes += ' today';
      if (isSelected) classes += ' selected';
      if (historyCount > 0) classes += ' has-history';

      const indicator =
        historyCount > 0
          ? `<div class="history-indicator" data-count="${historyCount}"></div>`
          : '';

      html += `
        <div class="${classes}" data-date="${dateKey}">
          <span class="day-number">${day}</span>
          ${indicator}
        </div>
      `;
    }

    // 次月の日付
    const remainingDays = 42 - (firstDayOfWeek + daysInMonth);
    for (let day = 1; day <= remainingDays; day++) {
      html += `<div class="calendar-day other-month">${day}</div>`;
    }

    daysElement.innerHTML = html;

    // 日付クリックイベント
    const dayElements = daysElement.querySelectorAll(
      '.calendar-day:not(.other-month)'
    );
    for (const dayElement of dayElements) {
      dayElement.addEventListener('click', () => {
        const dateKey = dayElement.getAttribute('data-date');
        if (dateKey) {
          const [year, month, day] = dateKey.split('-').map(Number);
          this.selectedDate = new Date(year, month - 1, day);
          this.renderCalendar();
          this.renderTimeline(this.selectedDate);
        }
      });
    }
  }

  /**
   * 日付未選択時のプレースホルダー表示。
   * 検索入力時にも毎回呼び出すことで DOM を更新し、ブラウザの undo 履歴を
   * 細かい単位で記録させる目的も兼ねる。
   */
  private renderEmptyTimeline(): void {
    const timelineElement = this.container.querySelector(
      '.history-timeline'
    ) as HTMLElement;
    if (!timelineElement) return;
    timelineElement.innerHTML =
      '<div class="timeline-placeholder">日付を選択してください</div>';
  }

  private renderTimeline(date: Date): void {
    const timelineElement = this.container.querySelector(
      '.history-timeline'
    ) as HTMLElement;
    if (!timelineElement) return;

    const dateKey = this.getDateKey(date);
    const dayHistory = this.monthHistory.get(dateKey);

    if (!dayHistory || dayHistory.items.length === 0) {
      timelineElement.innerHTML =
        '<div class="timeline-placeholder">この日の履歴はありません</div>';
      return;
    }

    // 検索フィルタリング
    let items = dayHistory.items;
    if (this.searchTerm.trim()) {
      const lowercaseSearchTerm = this.searchTerm.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(lowercaseSearchTerm) ||
          item.url.toLowerCase().includes(lowercaseSearchTerm)
      );
    }

    if (items.length === 0) {
      timelineElement.innerHTML =
        '<div class="timeline-placeholder">検索結果が見つかりませんでした</div>';
      return;
    }

    // 時間帯ごとにグループ化
    const hourGroups = this.groupByHour(items);

    // 時間帯アンカーリンクナビゲーション
    let html = '<div class="timeline-hour-nav">';
    for (const hourGroup of hourGroups) {
      const hourLabel = String(hourGroup.hour).padStart(2, '0');
      html += `<a href="#hour-${hourGroup.hour}" class="hour-nav-link">${hourLabel}時</a>`;
    }
    html += '</div>';

    // 時間帯グループの表示
    for (const hourGroup of hourGroups) {
      html += this.renderHourGroup(hourGroup);
    }

    timelineElement.innerHTML = html;

    // スクロールをトップに戻す
    timelineElement.scrollTop = 0;

    // アンカーリンククリックイベント
    this.setupHourNavigation();

    // Faviconの非同期読み込み
    this.loadTimelineFavicons();
    this.loadDomainFavicons();
  }

  private groupByHour(items: HistoryItem[]): HourGroup[] {
    const groups = new Map<number, HistoryItem[]>();

    for (const item of items) {
      const date = new Date(item.lastVisitTime);
      const hour = date.getHours();

      if (!groups.has(hour)) {
        groups.set(hour, []);
      }
      groups.get(hour)?.push(item);
    }

    // 時間順にソート
    const hourGroups: HourGroup[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const items = groups.get(hour);
      if (items && items.length > 0) {
        // 時間内で古い順にソート
        items.sort((a, b) => a.lastVisitTime - b.lastVisitTime);
        hourGroups.push({ hour, items });
      }
    }

    return hourGroups;
  }

  private renderHourGroup(group: HourGroup): string {
    const hourStr = `${String(group.hour).padStart(2, '0')}:00 - ${String(group.hour).padStart(2, '0')}:59`;

    // ドメイン別の訪問回数を集計
    const domainCounts = new Map<string, number>();
    for (const item of group.items) {
      try {
        const url = new URL(item.url);
        const domain = url.hostname;
        domainCounts.set(domain, (domainCounts.get(domain) || 0) + 1);
      } catch {
        // Invalid URL
      }
    }

    // ドメインを訪問回数でソート
    const sortedDomains = Array.from(domainCounts.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    const domainStatsHtml = sortedDomains
      .map(([domain, count]) => {
        const safeDomain = escapeHtml(domain);
        return `<span class="domain-stat">
            <img class="domain-favicon hidden" data-domain="${safeDomain}" alt="favicon">
            <span class="favicon-placeholder">🌐</span>
            <span class="domain-name">${safeDomain}</span>
            <span class="domain-count">${count}</span>
          </span>`;
      })
      .join('');

    const itemsHtml = group.items
      .map((item) => this.renderTimelineItem(item))
      .join('');

    return `
      <div class="timeline-hour-group" id="hour-${group.hour}">
        <div class="timeline-hour-header">
          <span class="timeline-hour">${hourStr}</span>
          <span class="timeline-hour-count">${group.items.length}件</span>
        </div>
        <div class="timeline-domain-stats">
          ${domainStatsHtml}
        </div>
        <div class="timeline-items">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  private renderTimelineItem(item: HistoryItem): string {
    const time = new Date(item.lastVisitTime).toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const safeUrl = escapeHtml(item.url);
    const safeTitle = escapeHtml(item.title);

    return `
      <div class="timeline-item">
        <div class="timeline-item-icon">
          <img class="timeline-favicon hidden" data-timeline-url="${safeUrl}" alt="favicon">
          <span class="favicon-placeholder">🌐</span>
        </div>
        <div class="timeline-item-content">
          <a href="#" class="timeline-item-title" data-url="${safeUrl}">${safeTitle}</a>
          <div class="timeline-item-url">${safeUrl}</div>
          <div class="timeline-item-meta">
            <span class="timeline-item-time">${time}</span>
            <span class="timeline-item-count">訪問回数: ${item.visitCount}</span>
          </div>
        </div>
      </div>
    `;
  }

  private async loadTimelineFavicons(): Promise<void> {
    const faviconImages = this.container.querySelectorAll(
      '.timeline-favicon'
    ) as NodeListOf<HTMLImageElement>;
    const faviconPlaceholders = this.container.querySelectorAll(
      '.timeline-item-icon .favicon-placeholder'
    ) as NodeListOf<HTMLElement>;

    if (!faviconImages || !faviconPlaceholders) return;

    const faviconPromises = Array.from(faviconImages).map(
      async (img, index) => {
        const url = img.getAttribute('data-timeline-url');
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

  private async loadDomainFavicons(): Promise<void> {
    const domainFaviconImages = this.container.querySelectorAll(
      '.domain-favicon'
    ) as NodeListOf<HTMLImageElement>;
    const domainPlaceholders = this.container.querySelectorAll(
      '.timeline-domain-stats .favicon-placeholder'
    ) as NodeListOf<HTMLElement>;

    if (!domainFaviconImages || !domainPlaceholders) return;

    const faviconPromises = Array.from(domainFaviconImages).map(
      async (img, index) => {
        const domain = img.getAttribute('data-domain');
        const placeholder = domainPlaceholders[index];

        if (domain) {
          try {
            // ドメインからURLを構築
            const url = `https://${domain}`;
            const faviconUrl = await getFavicon(url);
            img.src = faviconUrl;
            img.onload = () => {
              img.classList.remove('hidden');
              if (placeholder) placeholder.style.display = 'none';
            };
            img.onerror = () => {
              if (placeholder) {
                placeholder.textContent = '🌐';
                placeholder.style.display = 'inline-block';
              }
            };
          } catch (error) {
            console.warn('Domain favicon 読み込みエラー:', domain, error);
            if (placeholder) {
              placeholder.textContent = '🌐';
              placeholder.style.display = 'inline-block';
            }
          }
        }
      }
    );

    await Promise.allSettled(faviconPromises);
  }

  private setupHourNavigation(): void {
    const hourNavLinks = this.container.querySelectorAll('.hour-nav-link');
    if (!hourNavLinks) return;

    for (const link of hourNavLinks) {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const href = link.getAttribute('href');
        if (!href) return;

        const targetId = href.substring(1); // Remove '#'
        const targetElement = this.container.querySelector(`#${targetId}`);
        const timelineElement =
          this.container.querySelector('.history-timeline');
        const navElement = this.container.querySelector('.timeline-hour-nav');

        if (targetElement && timelineElement && navElement) {
          // スティッキーナビゲーションバーの高さを取得
          const navHeight = (navElement as HTMLElement).offsetHeight;
          // タイムライン要素内でスクロール（ナビゲーションバーの高さ分オフセット）
          const targetOffset = (targetElement as HTMLElement).offsetTop;
          const timelineOffset = (timelineElement as HTMLElement).offsetTop;
          timelineElement.scrollTop =
            targetOffset - timelineOffset - navHeight - 10;
        }
      });
    }
  }
}
