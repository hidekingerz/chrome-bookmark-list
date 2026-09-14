import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  formatDateTime,
  formatTimeWithSeconds,
  matchesSearchTerm,
  renderHistoryListItem,
} from '../src/components/HistoryList/index';

function render(html: string): HTMLElement {
  const dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return dom.window.document.body;
}

describe('renderHistoryListItem', () => {
  it('title / url / meta をエスケープして描画する', () => {
    const body = render(
      renderHistoryListItem({
        url: 'https://example.com/?a=1&b=2',
        title: '<img src=x onerror=alert(1)>',
        subtitle: 'example.com',
        meta: [
          { className: 'history-item-date', text: '2022/1/1 09:00' },
          { className: 'history-item-count', text: '訪問回数: 5' },
        ],
      })
    );

    const item = body.querySelector('.history-item') as HTMLElement;
    expect(item).not.toBeNull();
    expect(item.querySelector('.history-item-title img')).toBeNull();
    expect(item.querySelector('.history-item-title')?.textContent).toBe(
      '<img src=x onerror=alert(1)>'
    );
    expect(
      item.querySelector('.history-item-title')?.getAttribute('data-url')
    ).toBe('https://example.com/?a=1&b=2');
    expect(
      item.querySelector('.history-favicon')?.getAttribute('data-favicon-url')
    ).toBe('https://example.com/?a=1&b=2');
    expect(item.querySelector('.history-item-url')?.textContent).toBe(
      'example.com'
    );
    expect(item.querySelector('.history-item-date')?.textContent).toBe(
      '2022/1/1 09:00'
    );
    expect(item.querySelector('.history-item-count')?.textContent).toBe(
      '訪問回数: 5'
    );
  });

  it('meta が空なら .history-item-meta を描画しない', () => {
    const body = render(
      renderHistoryListItem({
        url: 'https://a',
        title: 'A',
        subtitle: 'a',
        meta: [],
      })
    );
    expect(body.querySelector('.history-item-meta')).toBeNull();
  });

  it('attributes をルート要素に付与する', () => {
    const body = render(
      renderHistoryListItem({
        url: 'https://a',
        title: 'A',
        subtitle: 'a',
        meta: [],
        attributes: { 'data-session-id': 's"1' },
      })
    );
    expect(
      body.querySelector('.history-item')?.getAttribute('data-session-id')
    ).toBe('s"1');
  });
});

describe('formatDateTime / formatTimeWithSeconds', () => {
  it('日付 時刻 の形式で返す', () => {
    expect(formatDateTime(1640995200000)).toMatch(
      /^\d{4}\/\d{1,2}\/\d{1,2} \d{1,2}:\d{2}$/
    );
  });

  it('秒付き時刻を返す', () => {
    expect(formatTimeWithSeconds(1640995200000)).toMatch(
      /^\d{1,2}:\d{2}:\d{2}$/
    );
  });
});

describe('matchesSearchTerm', () => {
  const item = { title: 'GitHub Home', url: 'https://github.com' };

  it('空・空白のみの検索語は常に一致', () => {
    expect(matchesSearchTerm(item, '')).toBe(true);
    expect(matchesSearchTerm(item, '   ')).toBe(true);
  });

  it('title または url に大文字小文字を無視して部分一致', () => {
    expect(matchesSearchTerm(item, 'github')).toBe(true);
    expect(matchesSearchTerm(item, 'HOME')).toBe(true);
    expect(matchesSearchTerm(item, 'gitlab')).toBe(false);
  });
});
