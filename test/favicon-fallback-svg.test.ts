// chrome.runtime が使えないときに返す data URI が、画像として読める（整形式の）SVG であることを確かめる。
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { FaviconService } from '../src/services/FaviconService';

describe('FaviconService のフォールバック SVG', () => {
  it('chrome.runtime が無いときに返る data URI は整形式の SVG である', () => {
    const saved = (globalThis as unknown as { chrome: unknown }).chrome;
    (globalThis as unknown as { chrome: unknown }).chrome = {};
    let uri: string;
    try {
      uri = new FaviconService().getFavicon('https://example.com/');
    } finally {
      (globalThis as unknown as { chrome: unknown }).chrome = saved;
    }
    expect(uri.startsWith('data:image/svg+xml;base64,')).toBe(true);

    const svg = Buffer.from(uri.split(',')[1], 'base64').toString('utf8');
    const dom = new JSDOM('');
    const parsed = new dom.window.DOMParser().parseFromString(
      svg,
      'image/svg+xml'
    );
    const error = parsed.querySelector('parsererror');

    expect({ parseError: error?.textContent ?? null, svg }).toEqual({
      parseError: null,
      svg,
    });
  });
});
