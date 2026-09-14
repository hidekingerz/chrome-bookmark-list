import { beforeEach, describe, expect, it, vi } from 'vitest';
import { moveBackForUndo } from '../src/components/UndoManager/moveBack';

describe('moveBackForUndo', () => {
  beforeEach(() => {
    vi.mocked(chrome.bookmarks.get).mockReset();
    vi.mocked(chrome.bookmarks.move).mockReset();
    vi.mocked(chrome.bookmarks.move).mockResolvedValue(
      {} as chrome.bookmarks.BookmarkTreeNode
    );
  });

  it('同一親内で現在位置が戻り先より前なら index を +1 して move する', async () => {
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([
      { id: 'b1', title: 't', parentId: 'p', index: 0 },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    await moveBackForUndo('b1', 'p', 2);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b1', {
      parentId: 'p',
      index: 3,
    });
  });

  it('現在位置が戻り先より後なら index をそのまま使う', async () => {
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([
      { id: 'b1', title: 't', parentId: 'p', index: 5 },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    await moveBackForUndo('b1', 'p', 2);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b1', {
      parentId: 'p',
      index: 2,
    });
  });

  it('別の親にいる場合は補正しない', async () => {
    vi.mocked(chrome.bookmarks.get).mockResolvedValue([
      { id: 'b1', title: 't', parentId: 'other', index: 0 },
    ] as chrome.bookmarks.BookmarkTreeNode[]);

    await moveBackForUndo('b1', 'p', 2);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b1', {
      parentId: 'p',
      index: 2,
    });
  });

  it('get が失敗しても index をそのまま使って move する', async () => {
    vi.mocked(chrome.bookmarks.get).mockRejectedValue(new Error('gone'));

    await moveBackForUndo('b1', 'p', 2);

    expect(chrome.bookmarks.move).toHaveBeenCalledWith('b1', {
      parentId: 'p',
      index: 2,
    });
  });
});
