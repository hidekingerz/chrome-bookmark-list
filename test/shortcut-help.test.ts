// ショートカット一覧は、ネイティブの <dialog> をモーダルで開く。
// Esc と外側のクリックで閉じる動作はブラウザ（closedby="any"）に任せるので、
// ここではその設定と、閉じたあとの後始末を確かめる。実際に閉じることは実ブラウザで確かめる。
// JSDOM には showModal() がないので、happy-dom の Window を使う。
import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutHelp } from '../src/components/ShortcutHelp/index';

describe('ShortcutHelp', () => {
  let win: Window;
  const saved = new Map<string, PropertyDescriptor | undefined>();

  beforeEach(() => {
    win = new Window({ url: 'chrome-extension://test/newtab.html' });
    for (const key of ['document', 'window', 'HTMLDialogElement'] as const) {
      saved.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Object.defineProperty(globalThis, key, {
        value:
          key === 'window'
            ? win
            : (win as unknown as Record<string, unknown>)[key],
        writable: true,
        configurable: true,
      });
    }
  });

  afterEach(() => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete (globalThis as Record<string, unknown>)[key];
    }
    saved.clear();
    win.close();
    vi.restoreAllMocks();
  });

  const dialogElement = () =>
    document.getElementById('shortcut-help-dialog') as HTMLDialogElement | null;

  it('open() でネイティブの dialog をモーダルで開く', () => {
    const showModal = vi.spyOn(
      win.HTMLDialogElement.prototype as unknown as HTMLDialogElement,
      'showModal'
    );
    const help = new ShortcutHelp();
    help.open();

    const dialog = dialogElement();
    expect(dialog?.tagName).toBe('DIALOG');
    expect(dialog?.open).toBe(true);
    expect(showModal).toHaveBeenCalledTimes(1);
    expect(dialog?.getAttribute('aria-labelledby')).toBe('shortcut-help-title');
    // ネイティブのモーダルが持つので、自前の role / aria-modal は付けない
    expect(dialog?.hasAttribute('role')).toBe(false);
    expect(dialog?.hasAttribute('aria-modal')).toBe(false);
  });

  it('外側のクリックと Esc で閉じられるよう closedby="any" を指定する', () => {
    new ShortcutHelp().open();

    expect(dialogElement()?.getAttribute('closedby')).toBe('any');
  });

  it('複数のショートカットエントリが表示される', () => {
    new ShortcutHelp().open();

    const items = document.querySelectorAll('.shortcut-help-item');
    expect(items.length).toBeGreaterThan(5);
  });

  it('開いたら閉じるボタンにフォーカスする', () => {
    new ShortcutHelp().open();

    expect(
      document.activeElement?.classList.contains('shortcut-help-close')
    ).toBe(true);
  });

  it('閉じるボタンでダイアログが閉じる', () => {
    const help = new ShortcutHelp();
    help.open();

    (
      document.querySelector('.shortcut-help-close') as HTMLButtonElement
    ).click();

    expect(dialogElement()).toBeNull();
    expect(help.isOpen()).toBe(false);
  });

  it('ブラウザが閉じたとき（Esc・外側のクリック）も後始末して、もう一度開ける', () => {
    const help = new ShortcutHelp();
    help.open();

    // Esc や外側のクリックでは、ブラウザが dialog を閉じて close イベントを出す
    dialogElement()?.close();

    expect(dialogElement()).toBeNull();
    expect(help.isOpen()).toBe(false);

    help.open();
    expect(dialogElement()?.open).toBe(true);
  });

  it('close() で閉じる', () => {
    const help = new ShortcutHelp();
    help.open();
    help.close();

    expect(dialogElement()).toBeNull();
    expect(help.isOpen()).toBe(false);
  });

  it('ダイアログの中で押した Esc は、背後の一覧（選択の解除など）に届かない', () => {
    new ShortcutHelp().open();
    const pageHandler = vi.fn();
    document.addEventListener('keydown', pageHandler);

    const event = new win.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    document.querySelector('.shortcut-help-close')?.dispatchEvent(event);

    expect(pageHandler).not.toHaveBeenCalled();
    // 閉じる動作（ブラウザの既定の動作）は止めない
    expect(event.defaultPrevented).toBe(false);
    document.removeEventListener('keydown', pageHandler);
  });

  it('Esc 以外のキーは背後にも届く', () => {
    new ShortcutHelp().open();
    const pageHandler = vi.fn();
    document.addEventListener('keydown', pageHandler);

    document
      .querySelector('.shortcut-help-close')
      ?.dispatchEvent(
        new win.KeyboardEvent('keydown', { key: 'a', bubbles: true })
      );

    expect(pageHandler).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', pageHandler);
  });

  it('open() を 2 回呼んでもダイアログは 1 つだけ', () => {
    const help = new ShortcutHelp();
    help.open();
    help.open();

    expect(document.querySelectorAll('dialog').length).toBe(1);
  });
});
