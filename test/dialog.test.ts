import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  alertDialog,
  confirmDialog,
  openDialog,
  showDialogError,
} from '../src/components/Dialog/index';

describe('Dialog', () => {
  let dom: JSDOM;
  let doc: Document;

  function keydownCount(): { active: () => number; restore: () => void } {
    const active = new Set<EventListenerOrEventListenerObject>();
    const realAdd = doc.addEventListener.bind(doc);
    const realRemove = doc.removeEventListener.bind(doc);
    doc.addEventListener = ((
      type: string,
      l: EventListenerOrEventListenerObject,
      o?: unknown
    ) => {
      if (type === 'keydown') active.add(l);
      return realAdd(type, l, o as AddEventListenerOptions);
    }) as typeof doc.addEventListener;
    doc.removeEventListener = ((
      type: string,
      l: EventListenerOrEventListenerObject,
      o?: unknown
    ) => {
      if (type === 'keydown') active.delete(l);
      return realRemove(type, l, o as EventListenerOptions);
    }) as typeof doc.removeEventListener;
    return {
      active: () => active.size,
      restore: () => {
        doc.addEventListener = realAdd;
        doc.removeEventListener = realRemove;
      },
    };
  }

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
      url: 'chrome-extension://test/newtab.html',
    });
    doc = dom.window.document;
    Object.defineProperty(globalThis, 'document', {
      value: doc,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'KeyboardEvent', {
      value: dom.window.KeyboardEvent,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    dom.window.close();
  });

  it('overlay / role=dialog / タイトル / ボタンを描画する', () => {
    openDialog({
      id: 'x-dialog',
      title: 'タイトル <b>',
      bodyHtml: '<p class="body">本文</p>',
      buttons: [
        { label: 'OK', className: 'x-ok', onClick: (close) => close() },
      ],
    });

    const overlay = doc.getElementById('x-dialog') as HTMLElement;
    expect(overlay.classList.contains('edit-dialog-overlay')).toBe(true);
    expect(overlay.querySelector('.edit-dialog')?.getAttribute('role')).toBe(
      'dialog'
    );
    expect(overlay.querySelector('h3')?.textContent).toBe('タイトル <b>');
    expect(
      overlay.querySelector('.edit-dialog-content .body')?.textContent
    ).toBe('本文');
    expect(
      overlay.querySelector('.edit-dialog-actions .x-ok')?.textContent
    ).toBe('OK');
  });

  it('× / ESC / close() のどれで閉じても keydown が解除され onClose は 1 回だけ', () => {
    const onClose = vi.fn();
    const tracker = keydownCount();

    const h1 = openDialog({
      id: 'd1',
      title: 't',
      bodyHtml: '',
      buttons: [],
      onClose,
    });
    expect(tracker.active()).toBe(1);
    (doc.querySelector('#d1 .edit-dialog-close') as HTMLElement).click();
    expect(doc.getElementById('d1')).toBeNull();
    expect(tracker.active()).toBe(0);
    h1.close();
    expect(onClose).toHaveBeenCalledTimes(1);

    openDialog({ id: 'd2', title: 't', bodyHtml: '', buttons: [], onClose });
    doc.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape' })
    );
    expect(doc.getElementById('d2')).toBeNull();
    expect(tracker.active()).toBe(0);
    expect(onClose).toHaveBeenCalledTimes(2);

    tracker.restore();
  });

  it('開くときに既存の overlay をすべて除去する', () => {
    const tracker = keydownCount();
    const onCloseA = vi.fn();

    openDialog({
      id: 'a',
      title: 't',
      bodyHtml: '',
      buttons: [],
      onClose: onCloseA,
    });
    openDialog({ id: 'b', title: 't', bodyHtml: '', buttons: [] });

    expect(doc.querySelectorAll('.edit-dialog-overlay')).toHaveLength(1);
    expect(doc.getElementById('a')).toBeNull();
    expect(tracker.active()).toBe(1);
    expect(onCloseA).toHaveBeenCalledTimes(1);

    tracker.restore();
  });

  it('confirmDialog を開いたまま次のダイアログを開くと前の Promise は false で解決する', async () => {
    const p = confirmDialog({
      id: 'c1',
      title: 't',
      bodyHtml: '',
      confirmLabel: '削除',
      confirmClassName: 'go',
    });
    openDialog({ id: 'c2', title: 't', bodyHtml: '', buttons: [] });
    await expect(p).resolves.toBe(false);
  });

  it('ボタンの onClick は close を受け取り、呼ばなければ開いたまま', () => {
    let calls = 0;
    openDialog({
      id: 'k',
      title: 't',
      bodyHtml: '',
      buttons: [
        {
          label: 'stay',
          className: 'stay',
          onClick: () => {
            calls++;
          },
        },
      ],
    });
    (doc.querySelector('.stay') as HTMLElement).click();
    expect(calls).toBe(1);
    expect(doc.getElementById('k')).not.toBeNull();
  });

  it('autofocus のボタンにフォーカスする', () => {
    openDialog({
      id: 'f',
      title: 't',
      bodyHtml: '',
      buttons: [
        { label: 'a', className: 'a', onClick: (c) => c() },
        { label: 'b', className: 'b', autofocus: true, onClick: (c) => c() },
      ],
    });
    expect(doc.activeElement?.classList.contains('b')).toBe(true);
  });

  it('confirmDialog は確定で true、キャンセル / ESC で false', async () => {
    const p1 = confirmDialog({
      id: 'c',
      title: 't',
      bodyHtml: '',
      confirmLabel: '削除',
      confirmClassName: 'go',
    });
    (doc.querySelector('#c .go') as HTMLElement).click();
    await expect(p1).resolves.toBe(true);

    const p2 = confirmDialog({
      id: 'c',
      title: 't',
      bodyHtml: '',
      confirmLabel: '削除',
      confirmClassName: 'go',
    });
    expect(doc.activeElement?.classList.contains('edit-dialog-cancel')).toBe(
      true
    );
    (doc.querySelector('#c .edit-dialog-cancel') as HTMLElement).click();
    await expect(p2).resolves.toBe(false);

    const p3 = confirmDialog({
      id: 'c',
      title: 't',
      bodyHtml: '',
      confirmLabel: '削除',
      confirmClassName: 'go',
    });
    doc.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape' })
    );
    await expect(p3).resolves.toBe(false);
  });

  it('alertDialog は OK（.edit-dialog-cancel）で解決する', async () => {
    const p = alertDialog({ id: 'e', title: 'エラー', bodyHtml: '<p>x</p>' });
    (doc.querySelector('#e .edit-dialog-cancel') as HTMLElement).click();
    await expect(p).resolves.toBeUndefined();
    expect(doc.getElementById('e')).toBeNull();
  });

  it('showDialogError は .dialog-error にメッセージを表示する', () => {
    const h = openDialog({
      id: 'err',
      title: 't',
      bodyHtml: '<div class="dialog-error" style="display:none"></div>',
      buttons: [],
    });
    showDialogError(h, '失敗しました');
    const el = doc.querySelector('#err .dialog-error') as HTMLElement;
    expect(el.textContent).toBe('失敗しました');
    expect(el.style.display).toBe('block');
    // null ハンドルでも例外にしない
    showDialogError(null, 'x');
  });
});
