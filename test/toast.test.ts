import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '../src/components/Toast/index';

describe('Toast', () => {
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    Toast.dismissCurrent();
    vi.useRealTimers();
    dom.window.close();
    vi.clearAllMocks();
  });

  it('show() で Toast がDOMに表示される', () => {
    Toast.show({ message: 'テストメッセージ' });
    const el = document.querySelector('.app-toast');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('テストメッセージ');
  });

  it('アクション付きで表示するとボタンが描画される', () => {
    Toast.show({
      message: 'メッセージ',
      action: { label: '元に戻す', onActivate: vi.fn() },
    });
    const btn = document.querySelector('.app-toast-action');
    expect(btn).not.toBeNull();
    expect(btn?.textContent?.trim()).toBe('元に戻す');
  });

  it('アクションボタンクリックで onActivate が呼ばれ Toast が閉じる', async () => {
    const handler = vi.fn();
    Toast.show({
      message: 'メッセージ',
      action: { label: '元に戻す', onActivate: handler },
    });

    const btn = document.querySelector(
      '.app-toast-action'
    ) as HTMLButtonElement;
    btn.click();
    await vi.runAllTimersAsync();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.app-toast')).toBeNull();
  });

  it('一定時間経過で自動で閉じる', () => {
    Toast.show({ message: 'メッセージ', durationMs: 3000 });
    expect(document.querySelector('.app-toast')).not.toBeNull();

    vi.advanceTimersByTime(3000);

    expect(document.querySelector('.app-toast')).toBeNull();
  });

  it('再度 show() を呼ぶと前の Toast が置き換わる (置換戦略)', () => {
    Toast.show({ message: '最初' });
    Toast.show({ message: '次' });

    const toasts = document.querySelectorAll('.app-toast');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('次');
  });

  it('閉じるボタンで Toast が消える', () => {
    Toast.show({ message: 'メッセージ' });
    const closeBtn = document.querySelector(
      '.app-toast-close'
    ) as HTMLButtonElement;
    closeBtn.click();
    expect(document.querySelector('.app-toast')).toBeNull();
  });

  it('triggerCurrentAction() でアクションを発火できる', async () => {
    const handler = vi.fn();
    Toast.show({
      message: 'メッセージ',
      action: { label: '元に戻す', onActivate: handler },
    });

    const handled = await Toast.triggerCurrentAction();
    expect(handled).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('アクションがない場合 triggerCurrentAction() は false を返す', async () => {
    Toast.show({ message: 'メッセージ' });
    const handled = await Toast.triggerCurrentAction();
    expect(handled).toBe(false);
  });
});
