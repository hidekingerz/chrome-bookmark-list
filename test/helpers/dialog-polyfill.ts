/**
 * JSDOM の HTMLDialogElement には showModal() / show() / close() がない。
 * テストの中で <dialog> を開け閉めできるよう、開いている印（open 属性）と
 * close イベントだけを真似る。モーダル（背後を操作できなくする・最前面に出す）や
 * Esc・外側のクリックで閉じる動作は真似ないので、それらは実ブラウザで確かめる。
 */
export function installDialogPolyfill(win: {
  HTMLDialogElement: typeof HTMLDialogElement;
  Event: typeof Event;
}): void {
  const proto = win.HTMLDialogElement.prototype as HTMLDialogElement;
  if (typeof proto.showModal === 'function') return;

  const open = function (this: HTMLDialogElement): void {
    this.setAttribute('open', '');
  };
  Object.assign(proto, {
    showModal: open,
    show: open,
    close(this: HTMLDialogElement, returnValue?: string): void {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      if (returnValue !== undefined) this.returnValue = returnValue;
      this.dispatchEvent(new win.Event('close'));
    },
  });
}
