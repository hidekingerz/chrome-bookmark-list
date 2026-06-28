import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FaviconService } from '../src/services/FaviconService';

// FaviconService は chrome.storage.local / chrome.permissions / fetch / Image に
// 依存する。setup.ts の Image モックは常に onload を発火させてしまうため、戦略の
// 分岐（標準パス失敗 → HTML 解析 → Google）や validateFaviconUrl のタイムアウトを
// 検証するには Image を src の値に応じて load/error を切り替えられるスタブに差し替える。

let imageLoadPredicate: (src: string) => boolean = () => true;
let imageNeverResolves = false;

class StubImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  #src = '';

  get src(): string {
    return this.#src;
  }

  set src(value: string) {
    this.#src = value;
    if (imageNeverResolves) {
      return;
    }
    setTimeout(() => {
      if (imageLoadPredicate(value)) {
        this.onload?.();
      } else {
        this.onerror?.();
      }
    }, 0);
  }
}

const DEFAULT_FAVICON_PREFIX = 'data:image/svg+xml;base64,';

// chrome は setup.ts でグローバルモック済み。permissions は未定義なので
// 必要なテストで一時的に付与し、afterEach で取り除く。
const chromeRef = chrome as unknown as {
  storage: { local: unknown };
  permissions?: { contains: ReturnType<typeof vi.fn> };
};

let originalStorageLocal: unknown;

beforeEach(() => {
  imageLoadPredicate = () => true;
  imageNeverResolves = false;
  vi.stubGlobal('Image', StubImage);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});

  originalStorageLocal = chromeRef.storage.local;
  // storage.local のモック関数を既定の解決値に整える
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockReset();
  (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockReset();
  (chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockReset();
  (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
  (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined
  );
  (chrome.storage.local.remove as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  chromeRef.storage.local = originalStorageLocal;
  chromeRef.permissions = undefined;
});

describe('FaviconService.initCache', () => {
  it('chrome.storage.local が無い場合は警告して何もしない', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    chromeRef.storage.local = undefined;
    const service = new FaviconService();

    await service.initCache();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('chrome.storage.localが利用できません')
    );
    expect(chrome.storage.local).toBeUndefined();
  });

  it('有効なキャッシュを読み込み、getFavicon がキャッシュ値を返す', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      bookmark_favicon_cache: {
        data: { 'example.com': 'https://example.com/cached.ico' },
        timestamp: Date.now(),
      },
    });
    const service = new FaviconService();

    await service.initCache();
    const favicon = await service.getFavicon('https://example.com/page');

    expect(favicon).toBe('https://example.com/cached.ico');
    // キャッシュヒットなので新規保存は走らない
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('期限切れキャッシュの場合は空キャッシュを保存し直す', async () => {
    const eightDaysMs = 8 * 24 * 60 * 60 * 1000;
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      bookmark_favicon_cache: {
        data: { 'old.com': 'https://old.com/favicon.ico' },
        timestamp: Date.now() - eightDaysMs,
      },
    });
    const service = new FaviconService();

    await service.initCache();

    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        bookmark_favicon_cache: expect.objectContaining({
          data: expect.any(Object),
          timestamp: expect.any(Number),
        }),
      })
    );
  });

  it('storage.get が例外を投げても握りつぶして警告する', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('boom')
    );
    const service = new FaviconService();

    await expect(service.initCache()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Faviconキャッシュの初期化に失敗'),
      expect.any(Error)
    );
  });
});

describe('FaviconService.getFavicon', () => {
  it('標準パス（/favicon.ico）の取得に成功するとその URL を返しキャッシュ保存する', async () => {
    const service = new FaviconService();

    const favicon = await service.getFavicon('https://example.com/page');

    expect(favicon).toBe('https://example.com/favicon.ico');
    expect(chrome.storage.local.set).toHaveBeenCalled();
  });

  it('不正な URL の場合 getDomain が localhost にフォールバックする', async () => {
    const service = new FaviconService();

    const favicon = await service.getFavicon('not-a-valid-url');

    expect(favicon).toBe('https://localhost/favicon.ico');
  });

  it('2 回目の呼び出しはキャッシュから返り fetch を行わない', async () => {
    const service = new FaviconService();

    const first = await service.getFavicon('https://cache-me.com/p');
    (chrome.storage.local.set as ReturnType<typeof vi.fn>).mockClear();
    const second = await service.getFavicon('https://cache-me.com/other');

    expect(second).toBe(first);
    // 2 回目はキャッシュヒットなので保存しない
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
  });

  it('getFavicon 内部で例外が起きたらデフォルトファビコンを返す', async () => {
    const service = new FaviconService();
    // saveCacheToStorage より前、cache.get でスローさせるため Map を壊す
    const brokenCache = {
      get() {
        throw new Error('cache exploded');
      },
    };
    (service as unknown as { cache: unknown }).cache = brokenCache;

    const favicon = await service.getFavicon('https://example.com');

    expect(favicon.startsWith(DEFAULT_FAVICON_PREFIX)).toBe(true);
  });
});

describe('FaviconService フォールバック戦略', () => {
  it('標準パスが失敗し HTML 解析でファビコンを発見できればそれを返す', async () => {
    // /favicon.ico は失敗、HTML から抽出した icon.png は成功させる
    imageLoadPredicate = (src) => src.includes('icon.png');
    chromeRef.permissions = {
      contains: vi.fn().mockResolvedValue(true),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            '<html><head><link rel="icon" href="https://example.com/icon.png"></head></html>'
          ),
      })
    );
    const service = new FaviconService();

    const favicon = await service.getFavicon('https://example.com/page');

    expect(favicon).toBe('https://example.com/icon.png');
  });

  it('HTML の相対パス href を絶対 URL に解決する', async () => {
    imageLoadPredicate = (src) => src.includes('/assets/fav.png');
    chromeRef.permissions = {
      contains: vi.fn().mockResolvedValue(true),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            '<html><head><link rel="icon" href="/assets/fav.png"></head></html>'
          ),
      })
    );
    const service = new FaviconService();

    const favicon = await service.getFavicon('https://relative.test/page');

    expect(favicon).toBe('https://relative.test/assets/fav.png');
  });

  it('スラッシュ始まりでない相対 href も解決する', async () => {
    imageLoadPredicate = (src) => src.includes('rel.png');
    chromeRef.permissions = {
      contains: vi.fn().mockResolvedValue(true),
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: vi
          .fn()
          .mockResolvedValue(
            '<html><head><link rel="icon" href="rel.png"></head></html>'
          ),
      })
    );
    const service = new FaviconService();

    const favicon = await service.getFavicon('https://noslash.test/page');

    expect(favicon).toBe('https://noslash.test/rel.png');
  });

  it('権限が無い場合 HTML 解析はスキップされ Google ファビコンにフォールバックする', async () => {
    // 標準パスは失敗、Google のみ成功
    imageLoadPredicate = (src) => src.includes('google.com/s2/favicons');
    chromeRef.permissions = {
      contains: vi.fn().mockResolvedValue(false),
    };
    const service = new FaviconService();

    const favicon = await service.getFavicon('https://no-perm.test/page');

    expect(favicon).toContain('https://www.google.com/s2/favicons');
    expect(favicon).toContain('domain=no-perm.test');
  });

  it('全戦略がタイムアウトするとデフォルトファビコンを返す', async () => {
    vi.useFakeTimers();
    imageNeverResolves = true; // validateFaviconUrl は 1000ms タイムアウトのみで解決
    chromeRef.permissions = {
      contains: vi.fn().mockResolvedValue(false),
    };
    const service = new FaviconService();

    const promise = service.getFavicon('https://timeout.test/page');
    // 標準パスと Google の 2 回分のタイムアウトを進める
    await vi.advanceTimersByTimeAsync(2500);
    const favicon = await promise;

    expect(favicon.startsWith(DEFAULT_FAVICON_PREFIX)).toBe(true);
  });
});

describe('FaviconService.clearCache', () => {
  it('キャッシュをクリアし storage からも削除する', async () => {
    const service = new FaviconService();

    await service.clearCache();

    expect(chrome.storage.local.remove).toHaveBeenCalledWith(
      'bookmark_favicon_cache'
    );
  });

  it('chrome.storage.local が無くてもエラーにならない', async () => {
    const logSpy = vi.spyOn(console, 'log');
    chromeRef.storage.local = undefined;
    const service = new FaviconService();

    await expect(service.clearCache()).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('Faviconキャッシュをクリアしました')
    );
  });
});

describe('FaviconService.saveCacheToStorage（storage 欠如時）', () => {
  it('getFavicon 経由で storage が無くても警告し処理継続する', async () => {
    const warnSpy = vi.spyOn(console, 'warn');
    chromeRef.storage.local = undefined;
    const service = new FaviconService();

    const favicon = await service.getFavicon('https://example.com/page');

    // 標準パスは成功するので favicon は取得できる
    expect(favicon).toBe('https://example.com/favicon.ico');
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('キャッシュ保存をスキップします')
    );
  });
});
