import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContextMenu } from '../src/components/ContextMenu/index';

describe('ContextMenu', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
      url: 'chrome-extension://test/newtab.html',
    });

    Object.defineProperty(globalThis, 'document', {
      value: dom.window.document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: dom.window,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'requestAnimationFrame', {
      value: (cb: FrameRequestCallback) => {
        cb(0);
        return 0;
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('open() でメニューがDOMに追加される', () => {
    const menu = new ContextMenu();
    menu.open(10, 20, [
      { label: '項目1', onSelect: vi.fn() },
      { label: '項目2', onSelect: vi.fn() },
    ]);

    const el = document.getElementById('bookmark-context-menu');
    expect(el).not.toBeNull();
    expect(el?.querySelectorAll('.context-menu-item').length).toBe(2);
  });

  it('項目クリックで onSelect が呼ばれメニューが閉じる', () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.open(0, 0, [{ label: '実行', onSelect: handler }]);

    const button = document.querySelector(
      '.context-menu-item'
    ) as HTMLButtonElement;
    button.click();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(menu.isOpen()).toBe(false);
  });

  it('disabled 項目クリックでは onSelect が呼ばれない', () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.open(0, 0, [{ label: '無効', disabled: true, onSelect: handler }]);

    const button = document.querySelector(
      '.context-menu-item'
    ) as HTMLButtonElement;
    button.click();

    expect(handler).not.toHaveBeenCalled();
  });

  it('ESCキーでメニューが閉じる', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [{ label: '項目', onSelect: vi.fn() }]);

    expect(menu.isOpen()).toBe(true);

    const event = new dom.window.KeyboardEvent('keydown', { key: 'Escape' });
    document.dispatchEvent(event);

    expect(menu.isOpen()).toBe(false);
  });

  it('メニュー外クリックでメニューが閉じる', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [{ label: '項目', onSelect: vi.fn() }]);

    expect(menu.isOpen()).toBe(true);

    const outside = document.body;
    const event = new dom.window.MouseEvent('mousedown', { bubbles: true });
    outside.dispatchEvent(event);

    expect(menu.isOpen()).toBe(false);
  });

  it('再度 open() を呼ぶと以前のメニューが置き換わる', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [{ label: 'A', onSelect: vi.fn() }]);
    menu.open(0, 0, [{ label: 'B', onSelect: vi.fn() }]);

    const elements = document.querySelectorAll('#bookmark-context-menu');
    expect(elements.length).toBe(1);
    expect(elements[0].textContent).toContain('B');
  });

  it('空の項目配列ではメニューを開かない', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, []);
    expect(menu.isOpen()).toBe(false);
  });

  it('separatorBefore でセパレータが描画される', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [
      { label: 'A', onSelect: vi.fn() },
      { label: 'B', separatorBefore: true, onSelect: vi.fn() },
    ]);

    const separators = document.querySelectorAll('.context-menu-separator');
    expect(separators.length).toBe(1);
  });
});
