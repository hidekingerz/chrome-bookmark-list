import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '../src/components/Toast/index';
import { UndoManager } from '../src/components/UndoManager/index';

describe('UndoManager', () => {
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

    // シングルトン状態をリセット
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
  });

  afterEach(() => {
    UndoManager.getInstance().clear();
    Toast.dismissCurrent();
    dom.window.close();
    vi.clearAllMocks();
  });

  it('register() で Toast に「元に戻す」が表示される', () => {
    UndoManager.getInstance().register({
      message: '「項目A」を削除しました',
      undo: vi.fn(),
    });

    const toast = document.querySelector('.app-toast');
    expect(toast).not.toBeNull();
    expect(toast?.textContent).toContain('「項目A」を削除しました');
    expect(toast?.querySelector('.app-toast-action')?.textContent?.trim()).toBe(
      '元に戻す'
    );
  });

  it('「元に戻す」ボタンクリックで undo が呼ばれる', async () => {
    const undoFn = vi.fn();
    UndoManager.getInstance().register({
      message: 'メッセージ',
      undo: undoFn,
    });

    const btn = document.querySelector(
      '.app-toast-action'
    ) as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 10));

    expect(undoFn).toHaveBeenCalledTimes(1);
  });

  it('新しい register で前の Undo が置き換わる', () => {
    const oldUndo = vi.fn();
    const newUndo = vi.fn();

    UndoManager.getInstance().register({ message: '古い', undo: oldUndo });
    UndoManager.getInstance().register({ message: '新しい', undo: newUndo });

    expect(UndoManager.getInstance().hasUndo()).toBe(true);
    const toasts = document.querySelectorAll('.app-toast');
    expect(toasts.length).toBe(1);
    expect(toasts[0].textContent).toContain('新しい');
  });

  it('triggerUndo() で undo が実行される', async () => {
    const undoFn = vi.fn();
    UndoManager.getInstance().register({ message: 'メッセージ', undo: undoFn });

    const handled = await UndoManager.getInstance().triggerUndo();
    expect(handled).toBe(true);
    expect(undoFn).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Z で undo が実行される', async () => {
    const undoFn = vi.fn();
    UndoManager.getInstance().initialize();
    UndoManager.getInstance().register({ message: 'メッセージ', undo: undoFn });

    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
    });
    document.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(undoFn).toHaveBeenCalledTimes(1);
  });

  it('入力欄にフォーカスがあるとき Cmd+Z は標準動作を優先する', async () => {
    const undoFn = vi.fn();
    UndoManager.getInstance().initialize();
    UndoManager.getInstance().register({ message: 'メッセージ', undo: undoFn });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();

    const event = new dom.window.KeyboardEvent('keydown', {
      key: 'z',
      metaKey: true,
    });
    document.dispatchEvent(event);
    await new Promise((r) => setTimeout(r, 10));

    expect(undoFn).not.toHaveBeenCalled();
  });

  it('triggerUndo() は Toast 解除後も currentUndo を直接実行する', async () => {
    const undoFn = vi.fn();
    const um = UndoManager.getInstance();
    um.register({ message: 'メッセージ', undo: undoFn });

    // Toast だけを解除する。UndoManager.currentUndo は保持されたまま。
    // この状態で triggerUndo を呼ぶと Toast.triggerCurrentAction() が false を返し、
    // UndoManager 側のフォールバック経路 (currentUndo を直接実行) が走る。
    Toast.dismissCurrent();
    expect(um.hasUndo()).toBe(true);

    const handled = await um.triggerUndo();

    expect(handled).toBe(true);
    expect(undoFn).toHaveBeenCalledTimes(1);
    // 実行後は currentUndo がクリアされ、再実行されない。
    expect(um.hasUndo()).toBe(false);
  });

  // UndoManager はシングルトンで initialize() は一度しかハンドラを束縛しないため、
  // ハンドラを「現在のテストの document」に確実に束縛するにはインスタンスをリセットする。
  // これにより editable 判定 (INPUT / contentEditable) を実際に通過させて検証できる。
  describe('Cmd+Z の editable 判定 (現在の document に束縛)', () => {
    beforeEach(() => {
      (UndoManager as unknown as { instance: UndoManager | null }).instance =
        null;
      UndoManager.getInstance().initialize();
    });

    function dispatchCmdZ(): Promise<void> {
      document.dispatchEvent(
        new dom.window.KeyboardEvent('keydown', { key: 'z', metaKey: true })
      );
      return new Promise((r) => setTimeout(r, 10));
    }

    it('editable でない要素にフォーカス時は undo が実行される (対照)', async () => {
      const undoFn = vi.fn();
      const um = UndoManager.getInstance();
      um.register({ message: 'メッセージ', undo: undoFn });

      const div = document.createElement('div');
      div.setAttribute('tabindex', '0');
      document.body.appendChild(div);
      div.focus();
      expect(document.activeElement).toBe(div);

      await dispatchCmdZ();

      // 通常要素なので editable 判定を抜けて undo が走る = ハンドラが現 document に生きている証拠。
      expect(undoFn).toHaveBeenCalledTimes(1);
    });

    it('INPUT にフォーカス時は editable 判定で undo を抑止する', async () => {
      const undoFn = vi.fn();
      const um = UndoManager.getInstance();
      um.register({ message: 'メッセージ', undo: undoFn });

      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      expect(document.activeElement).toBe(input);

      await dispatchCmdZ();

      expect(undoFn).not.toHaveBeenCalled();
      // editable なので undo は破棄されず保持される。
      expect(um.hasUndo()).toBe(true);
    });

    it('contentEditable 要素にフォーカス時は editable 判定で undo を抑止する', async () => {
      const undoFn = vi.fn();
      const um = UndoManager.getInstance();
      um.register({ message: 'メッセージ', undo: undoFn });

      const div = document.createElement('div');
      div.setAttribute('tabindex', '0');
      // jsdom はネイティブの isContentEditable を実装しないため値を明示する。
      Object.defineProperty(div, 'isContentEditable', {
        value: true,
        configurable: true,
      });
      document.body.appendChild(div);
      div.focus();
      expect(document.activeElement).toBe(div);

      await dispatchCmdZ();

      expect(undoFn).not.toHaveBeenCalled();
      expect(um.hasUndo()).toBe(true);
    });
  });
});
