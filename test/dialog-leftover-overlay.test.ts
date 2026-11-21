import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDialog } from '../src/components/Dialog/index';

/**
 * 「同時に開くダイアログは 1 つ」という約束のうち、close() を経ずに
 * 画面へ残ってしまった overlay の掃除を確かめる。
 *
 * 残った overlay は手書きの HTML ではなく、openDialog が描いた本物の出力から作る
 * (body の innerHTML が作り直され、開いていたダイアログがハンドルから切り離された状況)。
 */
describe('ダイアログを開くときの、残った overlay の掃除', () => {
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
    pressEscape();
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  function pressEscape(): void {
    document.dispatchEvent(
      new win.KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
      }) as unknown as Event
    );
  }

  function dialogTitles(): string[] {
    return Array.from(document.querySelectorAll('[role="dialog"] h3')).map(
      (heading) => heading.textContent ?? ''
    );
  }

  function open(id: string, title: string, onClose?: () => void) {
    return openDialog({
      id,
      title,
      bodyHtml: '<p>本文</p>',
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
      ],
      onClose,
    });
  }

  it('ハンドルから切り離されて画面に残ったダイアログも、次のダイアログを開くと消える', () => {
    const onFirstClose = vi.fn();
    open('first-dialog', '1 つ目', onFirstClose);
    // body の中身が作り直され、表示中のダイアログが close() の届かない別の要素になる
    const markup = document.body.innerHTML;
    document.body.innerHTML = markup;
    expect(dialogTitles()).toEqual(['1 つ目']);

    open('second-dialog', '2 つ目');

    expect(dialogTitles()).toEqual(['2 つ目']);
    expect(document.getElementById('first-dialog')).toBeNull();
    // 1 つ目は close() 経由でも閉じられ、onClose が 1 回だけ呼ばれている
    expect(onFirstClose).toHaveBeenCalledTimes(1);
  });

  it('残った overlay を掃除したあとも、新しいダイアログは Escape で閉じられる', () => {
    open('first-dialog', '1 つ目');
    const markup = document.body.innerHTML;
    document.body.innerHTML = markup;
    const onSecondClose = vi.fn();
    open('second-dialog', '2 つ目', onSecondClose);

    pressEscape();

    expect(dialogTitles()).toEqual([]);
    expect(onSecondClose).toHaveBeenCalledTimes(1);
  });
});
