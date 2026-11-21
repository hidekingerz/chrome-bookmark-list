import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Toast } from '../src/components/Toast/index';

/**
 * Toast の公開メソッド (getCurrentInstance / dismiss / hasAction) の振る舞い。
 * 表示は本物の DOM (happy-dom の Window) に対して行い、画面上の Toast と突き合わせる。
 */
describe('Toast の表示状態', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;

  beforeEach(() => {
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;
  });

  afterEach(() => {
    Toast.dismissCurrent();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function visibleToasts(): Element[] {
    return Array.from(document.querySelectorAll('[role="status"]'));
  }

  describe('getCurrentInstance', () => {
    it('何も表示していないときは null を返す', () => {
      expect(Toast.getCurrentInstance()).toBeNull();
    });

    it('表示中は、その Toast を返す', () => {
      const toast = Toast.show({ message: '保存しました', durationMs: 0 });

      expect(Toast.getCurrentInstance()).toBe(toast);
      expect(visibleToasts()).toHaveLength(1);
    });

    it('新しい Toast を表示すると、返す対象も新しい Toast に替わる', () => {
      const first = Toast.show({ message: '1 件目', durationMs: 0 });
      const second = Toast.show({ message: '2 件目', durationMs: 0 });

      expect(Toast.getCurrentInstance()).toBe(second);
      expect(Toast.getCurrentInstance()).not.toBe(first);
      expect(visibleToasts().map((el) => el.textContent?.trim())).toEqual([
        expect.stringContaining('2 件目'),
      ]);
    });

    it('閉じたあとは null を返す', () => {
      const toast = Toast.show({ message: '保存しました', durationMs: 0 });

      toast.dismiss();

      expect(Toast.getCurrentInstance()).toBeNull();
      expect(visibleToasts()).toHaveLength(0);
    });
  });

  describe('dismiss', () => {
    it('同じ Toast を 2 回閉じても、onDismiss は 1 回しか呼ばれない', () => {
      const onDismiss = vi.fn();
      const toast = Toast.show({
        message: '削除しました',
        durationMs: 0,
        onDismiss,
      });

      toast.dismiss();
      toast.dismiss();

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('閉じるボタンで閉じた Toast を、あとから dismiss しても onDismiss は増えない', () => {
      const onDismiss = vi.fn();
      const toast = Toast.show({
        message: '削除しました',
        durationMs: 0,
        onDismiss,
      });
      const closeButton = document.querySelector(
        '[role="status"] button[aria-label="閉じる"]'
      ) as HTMLButtonElement;

      closeButton.click();
      toast.dismiss();

      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(visibleToasts()).toHaveLength(0);
    });
  });

  describe('hasAction', () => {
    it('アクション付きで表示した Toast は true を返し、ボタンが描画されている', () => {
      const toast = Toast.show({
        message: '削除しました',
        durationMs: 0,
        action: { label: '元に戻す', onActivate: vi.fn() },
      });

      expect(toast.hasAction()).toBe(true);
      const buttonLabels = Array.from(
        document.querySelectorAll('[role="status"] button')
      ).map((button) => button.textContent?.trim());
      expect(buttonLabels).toContain('元に戻す');
    });

    it('アクションなしで表示した Toast は false を返し、閉じるボタンしかない', () => {
      const toast = Toast.show({ message: '保存しました', durationMs: 0 });

      expect(toast.hasAction()).toBe(false);
      const buttons = Array.from(
        document.querySelectorAll('[role="status"] button')
      );
      expect(
        buttons.map((button) => button.getAttribute('aria-label'))
      ).toEqual(['閉じる']);
    });
  });
});
