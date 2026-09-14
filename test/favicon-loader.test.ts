import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadFavicons } from '../src/scripts/favicon';
import { getFavicon } from '../src/scripts/utils';

vi.mock('../src/scripts/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/scripts/utils')>();
  return { ...actual, getFavicon: vi.fn() };
});
const mockGetFavicon = vi.mocked(getFavicon);

describe('loadFavicons', () => {
  let dom: JSDOM;
  let container: HTMLElement;

  beforeEach(() => {
    mockGetFavicon.mockReset();
    dom = new JSDOM(
      '<!DOCTYPE html><html><body><div id="c"></div></body></html>'
    );
    container = dom.window.document.getElementById('c') as HTMLElement;
    container.innerHTML = `
      <div class="icon">
        <span class="favicon-placeholder">🔗</span>
        <img class="fav hidden" data-favicon-url="https://a.example" alt="">
      </div>
      <div class="icon">
        <img class="fav hidden" data-favicon-url="" alt="">
        <span class="favicon-placeholder">🔗</span>
      </div>`;
  });

  afterEach(() => {
    dom.window.close();
  });

  it('URL のある img だけ getFavicon を呼び、onload で表示を切り替える', async () => {
    mockGetFavicon.mockResolvedValue('data:image/png;base64,ok');

    await loadFavicons(container, '.fav');

    expect(mockGetFavicon).toHaveBeenCalledTimes(1);
    expect(mockGetFavicon).toHaveBeenCalledWith('https://a.example');

    const [img] = Array.from(
      container.querySelectorAll<HTMLImageElement>('.fav')
    );
    const placeholder = img.parentElement?.querySelector(
      '.favicon-placeholder'
    ) as HTMLElement;
    expect(img.src).toBe('data:image/png;base64,ok');

    img.onload?.({} as Event);
    expect(img.classList.contains('hidden')).toBe(false);
    expect(placeholder.style.display).toBe('none');

    img.onerror?.({} as Event);
    expect(placeholder.textContent).toBe('🌐');
    expect(placeholder.style.display).toBe('');
  });

  it('getFavicon が失敗したら placeholder を 🌐 にして表示する', async () => {
    mockGetFavicon.mockRejectedValue(new Error('no favicon'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await loadFavicons(container, '.fav');

    const placeholder = container.querySelector(
      '.favicon-placeholder'
    ) as HTMLElement;
    expect(placeholder.textContent).toBe('🌐');
    expect(placeholder.style.display).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('urlAttr を指定すると別の属性から URL を読む', async () => {
    mockGetFavicon.mockResolvedValue('data:image/png;base64,ok');
    container.innerHTML = `<div><img class="fav hidden" data-domain-url="https://d.example"><span class="favicon-placeholder">🌐</span></div>`;

    await loadFavicons(container, '.fav', 'data-domain-url');

    expect(mockGetFavicon).toHaveBeenCalledWith('https://d.example');
  });
});
