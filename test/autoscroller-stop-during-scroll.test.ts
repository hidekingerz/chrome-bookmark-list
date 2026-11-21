import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autoscroller } from '../src/components/BookmarkDragAndDrop/Autoscroller';

/**
 * オートスクロールのループが、スクロールの最中に stop() された場合でも止まること。
 *
 * stop() は予約済みのフレームを取り消すが、実行中のフレームは取り消せない。
 * そのフレームが次のフレームを予約し直しても、次のフレームで何もせず終わることを確かめる。
 * requestAnimationFrame と scrollBy は window に差し込み、フレームを手で 1 つずつ進める。
 */
describe('Autoscroller: スクロールの最中に止められた場合', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;
  let frames: Map<number, () => void>;
  let scrollBy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;

    frames = new Map();
    let nextId = 1;
    scrollBy = vi.fn();
    Object.assign(win, {
      requestAnimationFrame: (callback: () => void) => {
        const id = nextId++;
        frames.set(id, callback);
        return id;
      },
      cancelAnimationFrame: (id: number) => {
        frames.delete(id);
      },
      scrollBy,
    });
  });

  afterEach(() => {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  /** 予約されているフレームを 1 つ実行する。予約が無ければ false を返す。 */
  function runNextFrame(): boolean {
    const next = frames.entries().next();
    if (next.done) return false;
    const [id, callback] = next.value;
    frames.delete(id);
    callback();
    return true;
  }

  it('スクロール中に stop() されると、次のフレームでループが終わり、それ以上スクロールしない', () => {
    const scroller = new Autoscroller();
    // スクロールが引き起こした処理（例: ドラッグの終了）が stop() を呼ぶ
    scrollBy.mockImplementationOnce(() => {
      scroller.stop();
    });

    scroller.update(796, 800);
    expect(runNextFrame()).toBe(true);
    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(scrollBy).toHaveBeenCalledWith(0, 18);

    // 実行中だったフレームが予約し直した分を進める
    runNextFrame();

    expect(scrollBy).toHaveBeenCalledTimes(1);
    expect(frames.size).toBe(0);
    expect(scroller.getSpeed()).toBe(0);
  });

  it('止まったあとに端へ戻ると、ループがもう一度始まる', () => {
    const scroller = new Autoscroller();
    scrollBy.mockImplementationOnce(() => {
      scroller.stop();
    });
    scroller.update(796, 800);
    runNextFrame();
    runNextFrame();
    expect(frames.size).toBe(0);

    scroller.update(4, 800);
    expect(frames.size).toBe(1);
    runNextFrame();

    expect(scrollBy).toHaveBeenCalledTimes(2);
    expect(scrollBy).toHaveBeenLastCalledWith(0, -18);
    expect(frames.size).toBe(1);

    scroller.stop();
    expect(frames.size).toBe(0);
  });
});
