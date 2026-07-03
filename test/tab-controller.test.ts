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

  it('存在しないタブIDをactivateしても何も起きない', async () => {
    controller = new TabController(document);
    // 初期は bookmarks がアクティブ
    expect(controller.getActiveTab()).toBe('bookmarks');

    await controller.activate('nonexistent');

    // 早期 return されるため activeTab は変わらない
    expect(controller.getActiveTab()).toBe('bookmarks');
    // 既存パネルの状態も維持される
    const bookmarksPanel = document.getElementById('tab-panel-bookmarks');
    expect(bookmarksPanel?.classList.contains('active')).toBe(true);
    expect(bookmarksPanel?.hasAttribute('hidden')).toBe(false);
  });

  it('data-tab属性のないボタンは無視される', () => {
    const localDom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <button class="tab-button active" data-tab="bookmarks"></button>
          <button class="tab-button"></button>
          <section class="tab-panel active" id="tab-panel-bookmarks"></section>
        </body>
      </html>
    `,
      { url: 'http://localhost' }
    );
    const localDoc = localDom.window.document;

    const localController = new TabController(localDoc);

    // data-tab 無しボタンは登録されないので click してもタブは切り替わらない
    const noTabButton = localDoc.querySelectorAll(
      '.tab-button'
    )[1] as HTMLElement;
    noTabButton.click();

    expect(localController.getActiveTab()).toBe('bookmarks');
    expect(noTabButton.classList.contains('active')).toBe(false);

    localDom.window.close();
  });

  it('対応するパネルが無いタブでもボタンのみで切り替えられる', async () => {
    const localDom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <button class="tab-button active" data-tab="bookmarks"></button>
          <button class="tab-button" data-tab="settings"></button>
          <section class="tab-panel active" id="tab-panel-bookmarks"></section>
        </body>
      </html>
    `,
      { url: 'http://localhost' }
    );
    const localDoc = localDom.window.document;

    const localController = new TabController(localDoc);
    // settings にはパネルが存在しない (if (panel) の false 分岐)
    await localController.activate('settings');

    expect(localController.getActiveTab()).toBe('settings');
    const settingsButton = localDoc.querySelector(
      '[data-tab="settings"]'
    ) as HTMLElement;
    expect(settingsButton.classList.contains('active')).toBe(true);
    expect(settingsButton.getAttribute('aria-selected')).toBe('true');

    localDom.window.close();
  });

  it('activeクラスを持つボタンが無い場合はactiveTabがnull', () => {
    const localDom = new JSDOM(
      `
      <!DOCTYPE html>
      <html>
        <body>
          <button class="tab-button" data-tab="bookmarks"></button>
          <button class="tab-button" data-tab="history"></button>
          <section class="tab-panel" id="tab-panel-bookmarks"></section>
          <section class="tab-panel" id="tab-panel-history"></section>
        </body>
      </html>
    `,
      { url: 'http://localhost' }
    );
    const localDoc = localDom.window.document;

    const localController = new TabController(localDoc);

    expect(localController.getActiveTab()).toBeNull();

    localDom.window.close();
  });
});
