import { escapeHtml } from '../../scripts/utils.js';

/**
 * 履歴系パネル（最近の履歴 / 最近閉じたタブ / カレンダーのタイムライン）で
 * 共通に使う 1 行分の表示データ。
 */
export interface HistoryListItemView {
  /** クリック先 URL（title の data-url と favicon の data-favicon-url に使う） */
  url: string;
  title: string;
  /** URL 行に表示する文字列（URL 全体 or ドメイン） */
  subtitle: string;
  /** メタ行。空なら描画しない */
  meta: Array<{ className: string; text: string }>;
  /** ルート要素に付ける追加属性（例: data-session-id）。値はエスケープされる */
  attributes?: Record<string, string>;
}

/**
 * 履歴アイテム 1 件の HTML を返す。favicon は loadFavicons(container, '.history-favicon') で読み込む。
 */
export function renderHistoryListItem(view: HistoryListItemView): string {
  const safeUrl = escapeHtml(view.url);
  const attrs = Object.entries(view.attributes ?? {})
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  const metaHtml =
    view.meta.length > 0
      ? `<div class="history-item-meta">${view.meta
          .map(
            (m) => `<span class="${m.className}">${escapeHtml(m.text)}</span>`
          )
          .join('')}</div>`
      : '';

  return `
      <div class="history-item"${attrs}>
        <div class="history-item-icon">
          <img class="history-favicon hidden" data-favicon-url="${safeUrl}" alt="favicon">
          <span class="favicon-placeholder">🌐</span>
        </div>
        <div class="history-item-content">
          <a href="#" class="history-item-title" data-url="${safeUrl}">${escapeHtml(view.title)}</a>
          <div class="history-item-url">${escapeHtml(view.subtitle)}</div>${metaHtml}
        </div>
      </div>
    `;
}

/** 'YYYY/M/D HH:MM'（ja-JP ロケール） */
export function formatDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString(
    'ja-JP',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  )}`;
}

/** 'HH:MM:SS'（ja-JP ロケール） */
export function formatTimeWithSeconds(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** title または url に検索語が大文字小文字を無視して部分一致するか。空の検索語は常に一致 */
export function matchesSearchTerm(
  item: { title: string; url: string },
  term: string
): boolean {
  const needle = term.trim().toLowerCase();
  if (!needle) return true;
  return (
    item.title.toLowerCase().includes(needle) ||
    item.url.toLowerCase().includes(needle)
  );
}
