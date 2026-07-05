import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookmarkDeleter } from '../src/components/BookmarkActions/BookmarkDeleter';
import { BookmarkEditor } from '../src/components/BookmarkActions/BookmarkEditor';
import { FolderCreator } from '../src/components/BookmarkActions/FolderCreator';
import { FolderDeleter } from '../src/components/BookmarkActions/FolderDeleter';
import { FolderRenamer } from '../src/components/BookmarkActions/FolderRenamer';
import { TabGroupOpener } from '../src/components/BookmarkActions/TabGroupOpener';
import { BookmarkDragAndDrop } from '../src/components/BookmarkDragAndDrop/index';
import { BookmarkSelection } from '../src/components/BookmarkSelection/BookmarkSelection';
import type { ChromeBookmarkNode } from '../src/types/bookmark';

// #100 リスナーリーク再現テスト。
// - DnD destroy() が bind(this) 不一致で removeEventListener が no-op になる問題。
// - ダイアログ共通の ESC keydown ハンドラが「ボタンで閉じた」場合に document へ残留する問題。
//   修正前は removeEventListener が Escape 分岐でしか呼ばれず、キャンセル/×/確定で閉じると蓄積する。

describe('#100 イベントリスナーのリーク', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
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
  });

  /**
   * document へ登録中の keydown リスナー数を追跡する。
   * addEventListener/removeEventListener を包み、'keydown' の登録・解除を差し引きで数える。
   */
  function trackDocumentKeydown(): {
    activeCount: () => number;
    restore: () => void;
  } {
    const active = new Set<EventListenerOrEventListenerObject>();
    const doc = dom.window.document;
    const realAdd = doc.addEventListener.bind(doc);
    const realRemove = doc.removeEventListener.bind(doc);
    doc.addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions
    ) => {
      if (type === 'keydown' && listener) active.add(listener);
      return realAdd(type, listener, options);
    }) as typeof doc.addEventListener;
    doc.removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | EventListenerOptions
    ) => {
      if (type === 'keydown' && listener) active.delete(listener);
      return realRemove(type, listener, options);
    }) as typeof doc.removeEventListener;
    return {
      activeCount: () => active.size,
      restore: () => {
        doc.addEventListener = realAdd;
        doc.removeEventListener = realRemove;
      },
    };
  }

  function click(selector: string): void {
    const el = dom.window.document.querySelector(
      selector
    ) as HTMLElement | null;
    if (!el) throw new Error(`ボタンが見つかりません: ${selector}`);
    el.click();
  }

  function insertDialog(id: string, buttonsHtml: string): void {
    dom.window.document.body.insertAdjacentHTML(
      'beforeend',
      `<div id="${id}" class="edit-dialog-overlay"><div class="edit-dialog">${buttonsHtml}</div></div>`
    );
  }

  it('DnD: destroy() 後は document の dragstart リスナーが解除される', () => {
    dom.window.document.body.innerHTML = `
      <div class="bookmark-folder" data-folder-id="f1">
        <div class="bookmark-item" data-bookmark-url="https://ex.com" data-bookmark-id="b1">
          <a class="bookmark-link" data-url="https://ex.com">
            <span class="bookmark-title">Ex</span>
          </a>
        </div>
      </div>`;
    const dnd = new BookmarkDragAndDrop();
    dnd.initialize();

    const link = dom.window.document.querySelector(
      '.bookmark-link'
    ) as HTMLElement;

    // 正常系: initialize 済みなら dragstart で body に dragging-bookmark が付く
    link.dispatchEvent(new dom.window.Event('dragstart', { bubbles: true }));
    expect(
      dom.window.document.body.classList.contains('dragging-bookmark')
    ).toBe(true);
    dom.window.document.body.classList.remove('dragging-bookmark');

    // destroy 後は同じ dragstart を撃ってもハンドラが動かない (リスナー解除済み)
    dnd.destroy();
    link.dispatchEvent(new dom.window.Event('dragstart', { bubbles: true }));
    expect(
      dom.window.document.body.classList.contains('dragging-bookmark')
    ).toBe(false);
  });

  it('BookmarkDeleter: 削除確認をキャンセルで閉じても keydown が残らない', () => {
    insertDialog(
      'delete-dialog',
      `<button class="edit-dialog-close" type="button">×</button>
       <button class="edit-dialog-cancel" type="button">キャンセル</button>
       <button class="delete-dialog-confirm" type="button">削除</button>`
    );
    const deleter = new BookmarkDeleter();
    const tracker = trackDocumentKeydown();
    (
      deleter as unknown as {
        setupDeleteDialogEvents: (r: (v: boolean) => void) => void;
      }
    ).setupDeleteDialogEvents(() => {});
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('BookmarkDeleter: エラーダイアログを OK で閉じても keydown が残らない', () => {
    insertDialog(
      'error-dialog',
      `<button class="edit-dialog-close" type="button">×</button>
       <button class="edit-dialog-cancel" type="button">OK</button>`
    );
    const deleter = new BookmarkDeleter();
    const tracker = trackDocumentKeydown();
    (
      deleter as unknown as { setupErrorDialogEvents: (r: () => void) => void }
    ).setupErrorDialogEvents(() => {});
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('BookmarkEditor: 編集ダイアログをキャンセルで閉じても keydown が残らない', () => {
    insertDialog(
      'edit-dialog',
      `<button class="edit-dialog-close" type="button">×</button>
       <button class="edit-dialog-cancel" type="button">キャンセル</button>
       <button class="edit-dialog-save" type="button">保存</button>`
    );
    const editor = new BookmarkEditor();
    const bookmark: ChromeBookmarkNode = {
      id: 'b1',
      title: 't',
      url: 'https://ex.com',
    };
    const tracker = trackDocumentKeydown();
    (
      editor as unknown as {
        setupEditDialogEvents: (b: ChromeBookmarkNode) => void;
      }
    ).setupEditDialogEvents(bookmark);
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('FolderCreator: 作成ダイアログをキャンセルで閉じても keydown が残らない', () => {
    insertDialog(
      'folder-create-dialog',
      `<button class="edit-dialog-close" type="button">×</button>
       <button class="edit-dialog-cancel" type="button">キャンセル</button>
       <button class="folder-create-confirm" type="button">作成</button>
       <input id="folder-create-name" />`
    );
    const creator = new FolderCreator();
    const tracker = trackDocumentKeydown();
    (
      creator as unknown as { setupDialogEvents: () => void }
    ).setupDialogEvents();
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('FolderRenamer: 名前変更ダイアログをキャンセルで閉じても keydown が残らない', () => {
    insertDialog(
      'folder-rename-dialog',
      `<button class="edit-dialog-close" type="button">×</button>
       <button class="edit-dialog-cancel" type="button">キャンセル</button>
       <button class="folder-rename-confirm" type="button">変更</button>
       <input id="folder-rename-name" />`
    );
    const renamer = new FolderRenamer();
    const target: ChromeBookmarkNode = { id: 'f1', title: 'x' };
    const tracker = trackDocumentKeydown();
    (
      renamer as unknown as {
        setupDialogEvents: (
          t: ChromeBookmarkNode,
          s: ChromeBookmarkNode[]
        ) => void;
      }
    ).setupDialogEvents(target, []);
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('FolderDeleter: 削除確認をキャンセルで閉じても keydown が残らない', () => {
    insertDialog(
      'folder-delete-dialog',
      `<button class="edit-dialog-close" type="button">×</button>
       <button class="edit-dialog-cancel" type="button">キャンセル</button>
       <button class="folder-delete-confirm" type="button">削除</button>`
    );
    const deleter = new FolderDeleter();
    const tracker = trackDocumentKeydown();
    (
      deleter as unknown as {
        setupDialogEvents: (r: (v: boolean) => void) => void;
      }
    ).setupDialogEvents(() => {});
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('TabGroupOpener: 大量タブ確認をキャンセルで閉じても keydown が残らない', async () => {
    const opener = new TabGroupOpener();
    const tracker = trackDocumentKeydown();
    const p = (
      opener as unknown as {
        confirmManyTabs: (n: number, f: string) => Promise<boolean>;
      }
    ).confirmManyTabs(10, 'フォルダ');
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    await p;
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('BookmarkSelection: 一括削除確認をキャンセルで閉じても keydown が残らない', async () => {
    const selection = new BookmarkSelection();
    const tracker = trackDocumentKeydown();
    const p = (
      selection as unknown as {
        showConfirmDialog: (m: string, t: string) => Promise<boolean>;
      }
    ).showConfirmDialog('本当に削除しますか', '一括削除');
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    await p;
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });

  it('BookmarkSelection: 一括移動ダイアログをキャンセルで閉じても keydown が残らない', async () => {
    const selection = new BookmarkSelection();
    const tracker = trackDocumentKeydown();
    const p = (
      selection as unknown as {
        showMoveDialog: (
          folders: ChromeBookmarkNode[],
          count: number
        ) => Promise<string | null>;
      }
    ).showMoveDialog([], 2);
    expect(tracker.activeCount()).toBe(1);
    click('.edit-dialog-cancel');
    await p;
    expect(tracker.activeCount()).toBe(0);
    tracker.restore();
  });
});
