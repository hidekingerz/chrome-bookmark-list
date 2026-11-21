import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BookmarkFolderRenderer } from '../src/components/BookmarkFolder/BookmarkFolderRenderer';
import { applyExpandedState, processBookmarkTree } from '../src/scripts/utils';
import type { ChromeBookmarkNode } from '../src/types/bookmark';

/**
 * 再読み込みのとき、ユーザーが折りたたんだフォルダの状態を引き継ぐ関数 API
 * (src/scripts/utils.ts の applyExpandedState)。
 *
 * newtab.ts の再読み込みと同じ手順 (processBookmarkTree → applyExpandedState → 描画) を踏み、
 * 引き継いだ状態と、それを描画した結果を確かめる。
 */
describe('再読み込みでの展開状態の引き継ぎ (applyExpandedState)', () => {
  let win: Window;
  let savedDocument: typeof globalThis.document;
  let savedWindow: typeof globalThis.window;

  /** 「その他のブックマーク」の下に「仕事」と「趣味」がある。withNewFolder で「新規」を足す。 */
  function makeTree(withNewFolder: boolean): ChromeBookmarkNode[] {
    const children: ChromeBookmarkNode[] = [
      {
        id: '20',
        title: '仕事',
        children: [
          { id: '201', title: 'A', url: 'https://a.example.com/' },
          { id: '202', title: 'B', url: 'https://b.example.com/' },
        ],
      },
      {
        id: '21',
        title: '趣味',
        children: [{ id: '211', title: 'C', url: 'https://c.example.com/' }],
      },
    ] as ChromeBookmarkNode[];
    if (withNewFolder) {
      children.push({
        id: '22',
        title: '新規',
        children: [{ id: '221', title: 'D', url: 'https://d.example.com/' }],
      } as ChromeBookmarkNode);
    }
    return [
      {
        id: '0',
        title: '',
        children: [{ id: '2', title: 'その他のブックマーク', children }],
      },
    ] as ChromeBookmarkNode[];
  }

  beforeEach(() => {
    win = new Window({ url: 'chrome-extension://test-id/newtab.html' });
    savedDocument = globalThis.document;
    savedWindow = globalThis.window;
    globalThis.document = win.document as unknown as Document;
    globalThis.window = win as unknown as typeof globalThis.window;
  });

  afterEach(() => {
    globalThis.document = savedDocument;
    globalThis.window = savedWindow;
  });

  it('折りたたんでいたフォルダは再読み込み後も折りたたまれ、新しいフォルダは展開されている', () => {
    const before = processBookmarkTree(makeTree(false));
    const work = before[0].subfolders.find((folder) => folder.id === '20');
    expect(work?.expanded).toBe(true);
    // ユーザーが「仕事」を折りたたむ
    if (work) work.expanded = false;

    const reloaded = processBookmarkTree(makeTree(true));
    applyExpandedState(reloaded, before);

    const expandedById = Object.fromEntries(
      reloaded[0].subfolders.map((folder) => [folder.id, folder.expanded])
    );
    expect(expandedById).toEqual({ '20': false, '21': true, '22': true });
    expect(reloaded[0].expanded).toBe(true);
  });

  it('引き継いだ状態で描画すると、折りたたんでいたフォルダのブックマーク一覧だけが非表示になる', () => {
    const before = processBookmarkTree(makeTree(false));
    const work = before[0].subfolders.find((folder) => folder.id === '20');
    if (work) work.expanded = false;
    const reloaded = processBookmarkTree(makeTree(true));

    applyExpandedState(reloaded, before);
    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = new BookmarkFolderRenderer().renderFolders(reloaded);

    const listDisplay = (folderId: string) =>
      (
        container.querySelector(
          `[data-folder-id="${folderId}"] > .bookmark-list`
        ) as HTMLElement
      ).style.display;
    expect(listDisplay('20')).toBe('none');
    expect(listDisplay('21')).toBe('block');
    expect(listDisplay('22')).toBe('block');
    expect(
      container
        .querySelector('[data-folder-id="20"] > .folder-header')
        ?.getAttribute('aria-expanded')
    ).toBe('false');
  });

  it('以前のツリーが空なら、すべてのフォルダは展開されたまま', () => {
    const reloaded = processBookmarkTree(makeTree(true));

    applyExpandedState(reloaded, []);

    expect(reloaded[0].subfolders.map((folder) => folder.expanded)).toEqual([
      true,
      true,
      true,
    ]);
  });
});
