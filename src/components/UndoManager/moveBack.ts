/**
 * 並び替えの Undo でノードを元の位置に戻す。
 *
 * chrome.bookmarks.move は同じ親内の移動で index を「元の配列での目標位置」と
 * 解釈し、現在位置 < index のとき最終位置を index - 1 に補正する。
 * 戻り先 = index を保証するため、現在位置が戻り先より前なら index + 1 を渡す。
 */
export async function moveBackForUndo(
  id: string,
  parentId: string,
  index: number
): Promise<void> {
  let undoIndex = index;
  try {
    const [now] = await chrome.bookmarks.get(id);
    if (
      now?.parentId === parentId &&
      now.index !== undefined &&
      now.index < undoIndex
    ) {
      undoIndex = undoIndex + 1;
    }
  } catch {
    // 取得失敗時は index のまま (フォールバック)
  }
  await chrome.bookmarks.move(id, { parentId, index: undoIndex });
}
