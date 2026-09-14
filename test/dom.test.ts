import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isEditableElement } from '../src/scripts/dom';

describe('isEditableElement', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(
      '<!DOCTYPE html><html><body><input id="i"><textarea id="t"></textarea><select id="s"></select><div id="d"></div><div id="ce" contenteditable="true"></div></body></html>'
    );
  });

  afterEach(() => {
    dom.window.close();
  });

  it('input / textarea / select は編集中要素', () => {
    const doc = dom.window.document;
    expect(isEditableElement(doc.getElementById('i'))).toBe(true);
    expect(isEditableElement(doc.getElementById('t'))).toBe(true);
    expect(isEditableElement(doc.getElementById('s'))).toBe(true);
  });

  it('contenteditable は編集中要素', () => {
    const el = dom.window.document.getElementById('ce') as HTMLElement;
    // JSDOM は isContentEditable を実装しないため明示的に付与する
    Object.defineProperty(el, 'isContentEditable', { value: true });
    expect(isEditableElement(el)).toBe(true);
  });

  it('通常の div と null は編集中要素ではない', () => {
    expect(isEditableElement(dom.window.document.getElementById('d'))).toBe(
      false
    );
    expect(isEditableElement(null)).toBe(false);
  });
});
