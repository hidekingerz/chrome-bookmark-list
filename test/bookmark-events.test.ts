import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { dispatchBookmarksChanged } from '../src/scripts/bookmarkEvents';

describe('dispatchBookmarksChanged', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
    Object.defineProperty(globalThis, 'document', {
      value: dom.window.document,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'CustomEvent', {
      value: dom.window.CustomEvent,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    dom.window.close();
  });

  it('document に bookmarks-changed を detail.action 付きで発火する', () => {
    const received: string[] = [];
    dom.window.document.addEventListener('bookmarks-changed', (e) => {
      received.push((e as CustomEvent<{ action: string }>).detail.action);
    });

    dispatchBookmarksChanged('edit');
    dispatchBookmarksChanged('undo-folder-reorder');

    expect(received).toEqual(['edit', 'undo-folder-reorder']);
  });
});
