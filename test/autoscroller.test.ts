import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Autoscroller } from '../src/components/BookmarkDragAndDrop/Autoscroller';

describe('Autoscroller', () => {
  let dom: JSDOM;
  let scrollBySpy: ReturnType<typeof vi.fn>;
  let rafCallbacks: Array<() => void>;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`);

    Object.defineProperty(globalThis, 'document', {
      value: dom.window.document,
      writable: true,
      configurable: true,
    });

    scrollBySpy = vi.fn();
    rafCallbacks = [];
    Object.defineProperty(globalThis, 'window', {
      value: {
        scrollBy: scrollBySpy,
        requestAnimationFrame: (cb: () => void) => {
          rafCallbacks.push(cb);
          return rafCallbacks.length;
        },
        cancelAnimationFrame: vi.fn(),
        innerHeight: 800,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  function tick(times: number): void {
    for (let i = 0; i < times; i++) {
      const cb = rafCallbacks.shift();
      if (cb) cb();
    }
  }

  it('画面中央付近では速度が 0 でスクロールしない', () => {
    const scroller = new Autoscroller();
    scroller.update(400, 800);
    expect(scroller.getSpeed()).toBe(0);
    tick(1);
    expect(scrollBySpy).not.toHaveBeenCalled();
  });

  it('上端付近では負の速度 (上方向) でスクロールする', () => {
    const scroller = new Autoscroller();
    scroller.update(20, 800);
    expect(scroller.getSpeed()).toBeLessThan(0);
    tick(1);
    expect(scrollBySpy).toHaveBeenCalledWith(0, expect.any(Number));
    const [, dy] = scrollBySpy.mock.calls[0];
    expect(dy).toBeLessThan(0);
  });

  it('下端付近では正の速度 (下方向) でスクロールする', () => {
    const scroller = new Autoscroller();
    scroller.update(790, 800);
    expect(scroller.getSpeed()).toBeGreaterThan(0);
    tick(1);
    expect(scrollBySpy).toHaveBeenCalledWith(0, expect.any(Number));
    const [, dy] = scrollBySpy.mock.calls[0];
    expect(dy).toBeGreaterThan(0);
  });

  it('エッジに近いほど速度が速くなる (リニア)', () => {
    const scroller = new Autoscroller();
    scroller.update(70, 800);
    const slowSpeed = Math.abs(scroller.getSpeed());

    scroller.update(20, 800);
    const fastSpeed = Math.abs(scroller.getSpeed());

    expect(fastSpeed).toBeGreaterThan(slowSpeed);
  });

  it('stop() で速度が 0 になりスクロールが止まる', () => {
    const scroller = new Autoscroller();
    scroller.update(20, 800);
    expect(scroller.getSpeed()).toBeLessThan(0);

    scroller.stop();
    expect(scroller.getSpeed()).toBe(0);
    rafCallbacks.length = 0;
    tick(1);
    expect(scrollBySpy).not.toHaveBeenCalled();
  });

  it('エッジから離れる位置に update すると速度が 0 に戻る', () => {
    const scroller = new Autoscroller();
    scroller.update(20, 800);
    expect(scroller.getSpeed()).not.toBe(0);

    scroller.update(400, 800);
    expect(scroller.getSpeed()).toBe(0);
  });
});
