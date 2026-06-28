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

  it('ArrowDown / ArrowUp でフォーカスが循環移動する', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [
      { label: 'A', onSelect: vi.fn() },
      { label: 'B', onSelect: vi.fn() },
      { label: 'C', onSelect: vi.fn() },
    ]);

    const items = document.querySelectorAll('.context-menu-item');
    // open() で最初の有効項目にフォーカスが当たる
    expect(document.activeElement).toBe(items[0]);

    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown' })
    );
    expect(document.activeElement).toBe(items[1]);

    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown' })
    );
    expect(document.activeElement).toBe(items[2]);

    // 末尾から ArrowDown で先頭へ循環
    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown' })
    );
    expect(document.activeElement).toBe(items[0]);

    // 先頭から ArrowUp で末尾へ循環
    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowUp' })
    );
    expect(document.activeElement).toBe(items[2]);
  });

  it('スクロールでメニューが閉じる', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [{ label: '項目', onSelect: vi.fn() }]);
    expect(menu.isOpen()).toBe(true);

    window.dispatchEvent(new dom.window.Event('scroll'));

    expect(menu.isOpen()).toBe(false);
  });

  it('メニュー外で右クリック(contextmenu)するとメニューが閉じる', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [{ label: '項目', onSelect: vi.fn() }]);
    expect(menu.isOpen()).toBe(true);

    const event = new dom.window.MouseEvent('contextmenu', { bubbles: true });
    document.body.dispatchEvent(event);

    expect(menu.isOpen()).toBe(false);
  });

  it('disabled 項目に click イベントが届いても onSelect は呼ばれず閉じない', () => {
    const menu = new ContextMenu();
    const handler = vi.fn();
    menu.open(0, 0, [
      { label: '有効', onSelect: vi.fn() },
      { label: '無効', disabled: true, onSelect: handler },
    ]);

    const buttons = document.querySelectorAll('.context-menu-item');
    // disabled ボタンは .click() が no-op になるため click イベントを直接 dispatch
    buttons[1].dispatchEvent(
      new dom.window.MouseEvent('click', { bubbles: true })
    );

    expect(handler).not.toHaveBeenCalled();
    expect(menu.isOpen()).toBe(true);
  });

  it('onSelect が reject してもエラーをキャッチして握り潰す', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const menu = new ContextMenu();
    const error = new Error('アクション失敗');
    menu.open(0, 0, [{ label: '実行', onSelect: () => Promise.reject(error) }]);

    const button = document.querySelector(
      '.context-menu-item'
    ) as HTMLButtonElement;
    button.click();

    // close 後に Promise.resolve(...).catch(...) が走るまでマイクロタスクを待つ
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(menu.isOpen()).toBe(false);
    expect(consoleSpy).toHaveBeenCalledWith(
      '❌ コンテキストメニューアクションの実行に失敗:',
      error
    );
    consoleSpy.mockRestore();
  });

  it('icon 付き項目ではアイコンが描画される', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [{ label: '削除', icon: '🗑️', onSelect: vi.fn() }]);

    const icon = document.querySelector('.context-menu-icon');
    expect(icon).not.toBeNull();
    expect(icon?.textContent).toBe('🗑️');
  });

  it('全項目が disabled のときの矢印キーはフォーカスを動かさない', () => {
    const menu = new ContextMenu();
    menu.open(0, 0, [
      { label: 'A', disabled: true, onSelect: vi.fn() },
      { label: 'B', disabled: true, onSelect: vi.fn() },
    ]);

    // 有効項目が無いので open() ではどこにもフォーカスしない
    const before = document.activeElement;
    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'ArrowDown' })
    );
    // moveFocus は対象 0 件で即 return し、フォーカスは変化しない
    expect(document.activeElement).toBe(before);
    expect(menu.isOpen()).toBe(true);
  });

  it('画面端を超える座標では表示位置が viewport 内に補正される', () => {
    const menu = new ContextMenu();
    // requestAnimationFrame は即時実行スタブ。innerWidth/innerHeight を超える
    // 座標を渡し、positionMenu の補正分岐を通す。
    menu.open(99999, 99999, [{ label: '項目', onSelect: vi.fn() }]);

    const el = document.getElementById('bookmark-context-menu') as HTMLElement;
    expect(el.style.visibility).toBe('visible');
    expect(Number.parseInt(el.style.left, 10)).toBeLessThan(99999);
    expect(Number.parseInt(el.style.top, 10)).toBeLessThan(99999);
  });
});
