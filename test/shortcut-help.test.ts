import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutHelp } from '../src/components/ShortcutHelp/index';

describe('ShortcutHelp', () => {
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
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('open() でダイアログがDOMに追加される', () => {
    const help = new ShortcutHelp();
    help.open();

    const dialog = document.getElementById('shortcut-help-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
  });

  it('複数のショートカットエントリが表示される', () => {
    const help = new ShortcutHelp();
    help.open();

    const items = document.querySelectorAll('.shortcut-help-item');
    expect(items.length).toBeGreaterThan(5);
  });

  it('閉じるボタンでダイアログが閉じる', () => {
    const help = new ShortcutHelp();
    help.open();

    const closeBtn = document.querySelector(
      '.shortcut-help-close'
    ) as HTMLButtonElement;
    closeBtn.click();

    expect(document.getElementById('shortcut-help-dialog')).toBeNull();
    expect(help.isOpen()).toBe(false);
  });

  it('Esc キーでダイアログが閉じる', () => {
    const help = new ShortcutHelp();
    help.open();

    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    expect(document.getElementById('shortcut-help-dialog')).toBeNull();
  });

  it('背景クリックでダイアログが閉じる', () => {
    const help = new ShortcutHelp();
    help.open();

    const overlay = document.getElementById(
      'shortcut-help-dialog'
    ) as HTMLElement;
    // overlay 自身をクリック (内容ではなく)
    const clickEvent = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(clickEvent, 'target', { value: overlay });
    overlay.dispatchEvent(clickEvent);

    expect(document.getElementById('shortcut-help-dialog')).toBeNull();
  });

  it('open() を 2 回呼んでもダイアログは 1 つだけ', () => {
    const help = new ShortcutHelp();
    help.open();
    help.open();

    expect(document.querySelectorAll('.shortcut-help-overlay').length).toBe(1);
  });

  it('ダイアログ内側要素のクリックでは閉じない', () => {
    const help = new ShortcutHelp();
    help.open();

    const overlay = document.getElementById(
      'shortcut-help-dialog'
    ) as HTMLElement;
    const inner = overlay.querySelector('.shortcut-help-dialog') as HTMLElement;
    // overlay 自身ではなく内側要素を target にする → e.target !== dialogElement の false 側
    const clickEvent = new dom.window.MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(clickEvent, 'target', { value: inner });
    overlay.dispatchEvent(clickEvent);

    expect(document.getElementById('shortcut-help-dialog')).not.toBeNull();
    expect(help.isOpen()).toBe(true);
  });

  it('Esc 以外のキーではダイアログは閉じない', () => {
    const help = new ShortcutHelp();
    help.open();

    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'a',
      bubbles: true,
      cancelable: true,
    });
    document.dispatchEvent(event);

    // e.key === 'Escape' の false 側 → close されず preventDefault もされない
    expect(document.getElementById('shortcut-help-dialog')).not.toBeNull();
    expect(help.isOpen()).toBe(true);
    expect(event.defaultPrevented).toBe(false);
  });
});
