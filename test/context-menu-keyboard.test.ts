// newtab.ts と同じ順序（KeyboardShortcuts.initialize() → 描画 → setupFolderClickHandler）で初期化し、
// Shift+F10 で開いたメニューの中を ↓ キーで移動できることを確かめる。
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkFolder } from '../src/types/bookmark';

function installDom(): JSDOM {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><body>
      <section class="tab-panel active" id="tab-panel-bookmarks">
        <div class="panel-search"><input type="text" id="searchInput"></div>
        <div id="bookmarkContainer"></div>
      </section>
    </body></html>`,
    { url: 'http://localhost', pretendToBeVisual: true }
  );
  for (const key of [
    'document',
    'window',
    'HTMLElement',
    'Event',
    'MouseEvent',
    'KeyboardEvent',
    'Node',
    'navigator',
    'requestAnimationFrame',
  ] as const) {
    Object.defineProperty(globalThis, key, {
      value: (dom.window as unknown as Record<string, unknown>)[key],
      writable: true,
      configurable: true,
    });
  }
  return dom;
}

const bm = (id: string, title: string) => ({
  id,
  title,
  url: `https://${title.toLowerCase()}.example.com/`,
  favicon: null,
});

describe('Shift+F10 で開いたコンテキストメニューのキーボード操作', () => {
  let dom: JSDOM;
  let container: HTMLElement;
  let doc: Document;

  const key = (target: Element, init: KeyboardEventInit) =>
    target.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        ...init,
      })
    );

  beforeEach(async () => {
    vi.resetModules();
    dom = installDom();
    doc = dom.window.document;
    container = doc.getElementById('bookmarkContainer') as HTMLElement;
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { create: vi.fn(), update: vi.fn() },
      bookmarks: {},
      runtime: { id: 'x', getURL: (p: string) => p },
    };

    // newtab.ts と同じ順序で初期化する
    const { KeyboardShortcuts } = await import(
      '../src/components/KeyboardShortcuts/index'
    );
    KeyboardShortcuts.resetInstance();
    KeyboardShortcuts.getInstance().initialize();

    const { renderFolder, setupFolderClickHandler } = await import(
      '../src/scripts/newtab-core'
    );
    const all: BookmarkFolder[] = [
      {
        id: '200',
        title: 'Dev',
        bookmarks: [bm('1', 'Alpha'), bm('2', 'Beta')],
        subfolders: [],
        expanded: true,
      },
    ];
    container.innerHTML = all.map((f) => renderFolder(f)).join('');
    setupFolderClickHandler(container, all);
  });

  it('メニュー内で ↓ を 2 回押すと 2 番目・3 番目の項目へ順にフォーカスが移る', () => {
    const item = container.querySelector('.bookmark-item') as HTMLElement;
    item.focus();
    key(item, { key: 'F10', shiftKey: true });

    const menu = doc.getElementById('bookmark-context-menu') as HTMLElement;
    expect(menu).not.toBeNull();
    const labels = Array.from(
      menu.querySelectorAll('.context-menu-item:not(.disabled)')
    ).map((el) => el.textContent?.trim().replace(/\s+/g, ' '));

    const focusedLabel = () =>
      (doc.activeElement as HTMLElement | null)?.textContent
        ?.trim()
        .replace(/\s+/g, ' ');

    const trail: Array<string | undefined> = [focusedLabel()];
    key(doc.activeElement as Element, { key: 'ArrowDown' });
    trail.push(focusedLabel());
    key(doc.activeElement as Element, { key: 'ArrowDown' });
    trail.push(focusedLabel());

    expect(trail).toEqual([labels[0], labels[1], labels[2]]);
  });
});
