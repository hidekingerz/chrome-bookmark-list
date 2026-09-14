import { getFavicon } from './utils.js';

/**
 * container 内の favicon 画像を非同期に読み込む。
 *
 * - `imgSelector` にマッチする img の `urlAttr` 属性からページ URL を取る（空なら何もしない）
 * - プレースホルダは img と同じ親要素の直下にある `.favicon-placeholder`
 *   （img 一覧と placeholder 一覧を index で突き合わせる方式はマークアップ変更で
 *   静かにズレるため採らない）
 * - 読み込み成功で img を表示し placeholder を隠す。失敗時は placeholder に 🌐 を出す
 *   （表示スタイルは CSS に任せ、inline の display 値を空に戻すだけ）
 */
export async function loadFavicons(
  container: ParentNode,
  imgSelector: string,
  urlAttr = 'data-favicon-url'
): Promise<void> {
  const images = Array.from(
    container.querySelectorAll<HTMLImageElement>(imgSelector)
  );

  await Promise.allSettled(
    images.map(async (img) => {
      const url = img.getAttribute(urlAttr);
      if (!url) return;

      const placeholder =
        img.parentElement?.querySelector<HTMLElement>('.favicon-placeholder') ??
        null;
      const showPlaceholder = () => {
        if (!placeholder) return;
        placeholder.textContent = '🌐';
        placeholder.style.display = '';
      };

      try {
        const faviconUrl = await getFavicon(url);
        img.onload = () => {
          img.classList.remove('hidden');
          if (placeholder) placeholder.style.display = 'none';
        };
        img.onerror = showPlaceholder;
        img.src = faviconUrl;
      } catch (error) {
        console.warn('Favicon 読み込みエラー:', url, error);
        showPlaceholder();
      }
    })
  );
}
