import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FaviconService } from '../src/services/FaviconService.js';

describe('FaviconService (_favicon API)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encodes pageUrl and requests size=32 via chrome.runtime.getURL', () => {
    const service = new FaviconService();
    const url = 'https://example.com/path?q=1&a=2';

    const result = service.getFavicon(url);

    const expectedPath = `/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;
    expect(chrome.runtime.getURL).toHaveBeenCalledWith(expectedPath);
    expect(result).toBe(`chrome-extension://test-id${expectedPath}`);
  });

  it('returns a distinct URL per page URL', () => {
    const service = new FaviconService();
    const a = service.getFavicon('https://a.example/');
    const b = service.getFavicon('https://b.example/');
    expect(a).not.toBe(b);
  });

  it('falls back to the default SVG when chrome.runtime is unavailable', () => {
    const service = new FaviconService();
    const original = globalThis.chrome.runtime;
    // @ts-expect-error 実行時に runtime 不在の環境を再現
    globalThis.chrome.runtime = undefined;

    const result = service.getFavicon('https://example.com');

    expect(result.startsWith('data:image/svg+xml')).toBe(true);
    globalThis.chrome.runtime = original;
  });

  it('falls back to the default SVG when getURL throws', () => {
    const service = new FaviconService();
    (chrome.runtime.getURL as ReturnType<typeof vi.fn>).mockImplementationOnce(
      () => {
        throw new Error('boom');
      }
    );

    const result = service.getFavicon('https://example.com');

    expect(result.startsWith('data:image/svg+xml')).toBe(true);
  });
});
