// 実際のレンダラ（renderFolder）とクリックハンドラ（setupFolderClickHandler）を使い、
// 子フォルダを閉じてから親を閉じて開いても、子の表示とアイコンが一致したままであることを確かめる。
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookmarkFolder } from '../src/types/bookmark';

function installDom(): JSDOM {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="bookmarkContainer"></div></body></html>',
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
  ] as const) {
    Object.defineProperty(globalThis, key, {
      value: (dom.window as unknown as Record<string, unknown>)[key],
      writable: true,
      configurable: true,
    });
  }
  return dom;
}

function click(el: Element, dom: JSDOM): void {
  el.dispatchEvent(
    new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })
  );
}

const bm = (id: string, title: string) => ({
  id,
  title,
  url: `https://${title.toLowerCase()}.example.com/`,
  favicon: null,
});

describe('入れ子フォルダの展開・折りたたみ', () => {
  let dom: JSDOM;
  let container: HTMLElement;

  beforeEach(() => {
    vi.resetModules();
    dom = installDom();
    container = dom.window.document.getElementById(
      'bookmarkContainer'
    ) as HTMLElement;
    (globalThis as unknown as { chrome: unknown }).chrome = {
      tabs: { create: vi.fn() },
      bookmarks: {},
      runtime: { id: 'x', getURL: (p: string) => p },
    };
  });

  it('子フォルダを折りたたんだ後、親（直下にブックマークを持たない）を閉じて開くと、子の表示とアイコンが一致したままである', async () => {
    const { renderFolder, setupFolderClickHandler } = await import(
      '../src/scripts/newtab-core'
    );
    const all: BookmarkFolder[] = [
      {
        id: '100',
        title: 'Parent',
        bookmarks: [],
        expanded: true,
        subfolders: [
          {
            id: '101',
            title: 'ChildA',
            bookmarks: [bm('1', 'Alpha'), bm('2', 'Beta')],
            subfolders: [],
            expanded: true,
          },
        ],
      },
    ];
    container.innerHTML = all.map((f) => renderFolder(f)).join('');
    setupFolderClickHandler(container, all);

    const parentHeader = container.querySelector(
      '[data-folder-id="100"] > .folder-header'
    ) as HTMLElement;
    const childHeader = container.querySelector(
      '[data-folder-id="101"] > .folder-header'
    ) as HTMLElement;
    const childList = container.querySelector(
      '[data-folder-id="101"] > .bookmark-list'
    ) as HTMLElement;
    const childIcon = childHeader.querySelector('.expand-icon') as HTMLElement;

    // 1. 子フォルダを折りたたむ
    click(childHeader, dom);
    expect(childList.style.display).toBe('none');
    expect(childIcon.textContent).toBe('📁');

    // 2. 親を折りたたんで、もう一度開く
    click(parentHeader, dom);
    click(parentHeader, dom);

    // 子は折りたたんだまま（アイコン 📁・aria-expanded=false）なので、リストも非表示のはず
    const state = {
      icon: childIcon.textContent,
      ariaExpanded: childHeader.getAttribute('aria-expanded'),
      modelExpanded: all[0].subfolders[0].expanded,
      listDisplay: childList.style.display,
      listCollapsed: childList.classList.contains('collapsed'),
      listExpanded: childList.classList.contains('expanded'),
    };
    expect(state).toEqual({
      icon: '📁',
      ariaExpanded: 'false',
      modelExpanded: false,
      listDisplay: 'none',
      listCollapsed: true,
      listExpanded: false,
    });
  });
});
