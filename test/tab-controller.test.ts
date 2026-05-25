import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabController } from '../src/components/TabController/TabController';

describe('TabController', () => {
  let dom: JSDOM;
  let document: Document;
  let controller: TabController;

  beforeEach(() => {
    dom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <nav class="tab-nav">
            <button class="tab-button active" data-tab="bookmarks" aria-selected="true"></button>
            <button class="tab-button" data-tab="history" aria-selected="false"></button>
            <button class="tab-button" data-tab="calendar" aria-selected="false"></button>
          </nav>
          <section class="tab-panel active" id="tab-panel-bookmarks"></section>
          <section class="tab-panel" id="tab-panel-history" hidden></section>
          <section class="tab-panel" id="tab-panel-calendar" hidden></section>
        </body>
      </html>
    `,
      { url: 'http://localhost', pretendToBeVisual: true }
    );

    document = dom.window.document;
    Object.defineProperty(globalThis, 'document', {
      value: document,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('初期状態でactiveなタブを認識する', () => {
    controller = new TabController(document);
    expect(controller.getActiveTab()).toBe('bookmarks');
  });

  it('タブボタンのクリックでタブが切り替わる', async () => {
    controller = new TabController(document);

    const historyButton = document.querySelector(
      '[data-tab="history"]'
    ) as HTMLElement;
    historyButton.click();
    // クリックハンドラ内のactivateの完了を待つ
    await Promise.resolve();

    expect(historyButton.classList.contains('active')).toBe(true);
    expect(historyButton.getAttribute('aria-selected')).toBe('true');

    const historyPanel = document.getElementById('tab-panel-history');
    expect(historyPanel?.classList.contains('active')).toBe(true);
    expect(historyPanel?.hasAttribute('hidden')).toBe(false);

    const bookmarksPanel = document.getElementById('tab-panel-bookmarks');
    expect(bookmarksPanel?.classList.contains('active')).toBe(false);
    expect(bookmarksPanel?.hasAttribute('hidden')).toBe(true);
  });

  it('登録したactivateハンドラがタブ切り替え時に呼ばれる', async () => {
    controller = new TabController(document);

    const handler = vi.fn();
    controller.onActivate('calendar', handler);

    await controller.activate('calendar');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(controller.getActiveTab()).toBe('calendar');
  });
});
