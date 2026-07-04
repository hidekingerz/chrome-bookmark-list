import { SEARCH_DEBOUNCE_MS } from '../constants/index.js';
import type { BookmarkFolder } from '../types/bookmark.js';
import { filterBookmarks } from './utils.js';

/**
 * 指定した待機時間だけ呼び出しをまとめるデバウンス関数を返す。
 * 待機中に再度呼ばれるとタイマーをリセットし、最後の呼び出しの引数で
 * 一度だけ `fn` を実行する（trailing edge）。
 */
export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  waitMs: number
): (...args: A) => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return (...args: A): void => {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = undefined;
      fn(...args);
    }, waitMs);
  };
}

/**
 * 検索入力にデバウンス付きのフィルタ処理を配線する。
 * 1キーストロークごとに全DOM再構築＋favicon再ロードが走るのを避けるため、
 * `SEARCH_DEBOUNCE_MS` 内の連続入力は最後の一回にまとめる (#104)。
 *
 * @param searchInput 監視する検索入力要素
 * @param getBookmarks 現在の全ブックマークを返すゲッタ（再読込で差し替わるため関数で受ける）
 * @param render フィルタ結果を描画するコールバック
 * @param waitMs デバウンス待機時間（既定は SEARCH_DEBOUNCE_MS）
 */
export function setupBookmarkSearch(
  searchInput: HTMLInputElement,
  getBookmarks: () => BookmarkFolder[],
  render: (folders: BookmarkFolder[]) => void | Promise<void>,
  waitMs: number = SEARCH_DEBOUNCE_MS
): void {
  const runSearch = debounce((searchTerm: string) => {
    const filteredBookmarks = filterBookmarks(getBookmarks(), searchTerm);
    void render(filteredBookmarks);
  }, waitMs);

  searchInput.addEventListener('input', (e: Event): void => {
    const target = e.target as HTMLInputElement;
    runSearch(target.value.toLowerCase());
  });
}
