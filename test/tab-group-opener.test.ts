import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TabGroupOpener } from '../src/components/BookmarkActions/TabGroupOpener';

describe('TabGroupOpener', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = new JSDOM(`<!DOCTYPE html><html><body></body></html>`, {
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

    const mockChrome = globalThis.chrome as unknown as {
      tabs: {
        create: ReturnType<typeof vi.fn>;
        group: ReturnType<typeof vi.fn>;
      };
      tabGroups: { update: ReturnType<typeof vi.fn> };
    };
    mockChrome.tabs.create = vi
      .fn()
      .mockImplementation((opts: { url: string }) =>
        Promise.resolve({
          id: Math.floor(Math.random() * 10000),
          url: opts.url,
        })
      );
    mockChrome.tabs.group = vi.fn().mockResolvedValue(123);
    mockChrome.tabGroups.update = vi.fn().mockResolvedValue(undefined);
  });

  afterEach(() => {
    dom.window.close();
    vi.clearAllMocks();
  });

  it('URLs を新規タブで開いてグループ化する', async () => {
    const opener = new TabGroupOpener();
    await opener.openAsGroup(
      ['https://a.example.com', 'https://b.example.com'],
      'Work'
    );

    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: false,
    });
    expect(chrome.tabs.group).toHaveBeenCalledWith(
      expect.objectContaining({ tabIds: expect.any(Array) })
    );
    expect(chrome.tabGroups.update).toHaveBeenCalledWith(
      123,
      expect.objectContaining({ title: 'Work' })
    );
  });

  it('URL が空のとき何もしない', async () => {
    const opener = new TabGroupOpener();
    await opener.openAsGroup([], 'Empty');
    expect(chrome.tabs.create).not.toHaveBeenCalled();
    expect(chrome.tabs.group).not.toHaveBeenCalled();
  });

  it('同じフォルダ名なら同じ色になる (決定的)', async () => {
    const opener = new TabGroupOpener();
    await opener.openAsGroup(['https://a.example.com'], 'Work');
    const firstCall = (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mock
      .calls[0][1] as { color: string };

    (chrome.tabGroups.update as ReturnType<typeof vi.fn>).mockClear();
    await opener.openAsGroup(['https://b.example.com'], 'Work');
    const secondCall = (chrome.tabGroups.update as ReturnType<typeof vi.fn>)
      .mock.calls[0][1] as { color: string };

    expect(firstCall.color).toBe(secondCall.color);
  });

  it('しきい値 (20件) を超える場合は確認ダイアログを表示', async () => {
    const opener = new TabGroupOpener();
    const urls = Array.from(
      { length: 25 },
      (_, i) => `https://x${i}.example.com`
    );
    const promise = opener.openAsGroup(urls, 'Big');

    // 確認ダイアログが出るまで待機
    await new Promise((r) => setTimeout(r, 10));
    const dialog = document.getElementById('tab-group-confirm-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('25件');

    // キャンセル
    (dialog?.querySelector('.edit-dialog-cancel') as HTMLElement).click();
    await promise;

    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('しきい値超のダイアログで「開く」を押すとグループが作成される', async () => {
    const opener = new TabGroupOpener();
    const urls = Array.from(
      { length: 22 },
      (_, i) => `https://x${i}.example.com`
    );
    const promise = opener.openAsGroup(urls, 'Big');

    await new Promise((r) => setTimeout(r, 10));
    const dialog = document.getElementById('tab-group-confirm-dialog');
    (dialog?.querySelector('.tab-group-confirm') as HTMLElement).click();
    await promise;

    expect(chrome.tabs.create).toHaveBeenCalledTimes(22);
    expect(chrome.tabs.group).toHaveBeenCalled();
  });

  it('tabGroups API が利用できない場合は個別タブとして開きフォールバックする', async () => {
    const mockChrome = globalThis.chrome as unknown as {
      tabs: { group?: unknown };
      tabGroups: { update?: unknown };
    };
    // group / update を未定義にして API 非対応をシミュレート
    mockChrome.tabs.group = undefined;
    mockChrome.tabGroups.update = undefined;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const opener = new TabGroupOpener();
    await opener.openAsGroup(
      ['https://a.example.com', 'https://b.example.com'],
      'Work'
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('chrome.tabGroups API が利用できません')
    );
    // グループ化はスキップし、個別タブ作成のみ行われる
    expect(chrome.tabs.create).toHaveBeenCalledTimes(2);
    expect(chrome.tabs.create).toHaveBeenCalledWith({
      url: 'https://a.example.com',
      active: false,
    });

    warnSpy.mockRestore();
  });

  it('グループ作成に失敗した場合は console.error と alert を出す', async () => {
    const mockChrome = globalThis.chrome as unknown as {
      tabs: { group: ReturnType<typeof vi.fn> };
    };
    mockChrome.tabs.group = vi
      .fn()
      .mockRejectedValue(new Error('group failed'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const alertSpy = vi.fn();
    Object.defineProperty(globalThis, 'alert', {
      value: alertSpy,
      writable: true,
      configurable: true,
    });

    const opener = new TabGroupOpener();
    await opener.openAsGroup(['https://a.example.com'], 'Work');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('タブグループの作成に失敗しました'),
      expect.any(Error)
    );
    expect(alertSpy).toHaveBeenCalledWith(
      expect.stringContaining('タブグループの作成に失敗しました')
    );

    errorSpy.mockRestore();
  });

  it('確認ダイアログで Escape キーを押すとキャンセル扱いになる', async () => {
    const opener = new TabGroupOpener();
    const urls = Array.from(
      { length: 21 },
      (_, i) => `https://x${i}.example.com`
    );
    const promise = opener.openAsGroup(urls, 'Big');

    await new Promise((r) => setTimeout(r, 10));
    expect(document.getElementById('tab-group-confirm-dialog')).not.toBeNull();

    document.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: 'Escape' })
    );
    await promise;

    // キャンセルされ、ダイアログは閉じられタブは作成されない
    expect(document.getElementById('tab-group-confirm-dialog')).toBeNull();
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });
});
