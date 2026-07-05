/**
 * ブックマークノードの同定ヘルパー (#97)。
 *
 * DOM が保持する Chrome ノード ID (`data-bookmark-id`) を優先して対象を
 * 一意に同定する。ID が無い・取得できない場合のみ URL 検索の先頭要素へ
 * フォールバックする（同一 URL が複数フォルダに存在すると誤対象になる旧挙動）。
 */
export async function resolveBookmarkNode(
  id: string | null | undefined,
  url: string
): Promise<chrome.bookmarks.BookmarkTreeNode | null> {
  if (id) {
    try {
      const [node] = await chrome.bookmarks.get(id);
      if (node) {
        return node;
      }
    } catch {
      // ID が古い等で get に失敗した場合は URL 検索へフォールバック
    }
  }

  const found = await chrome.bookmarks.search({ url });
  return found[0] ?? null;
}
