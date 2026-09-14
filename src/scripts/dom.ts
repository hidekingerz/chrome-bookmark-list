/**
 * DOM に関する小さなヘルパー
 */

/**
 * フォーカス中の要素がテキスト入力を受け付けるか。
 * キーボードショートカット・ESC・Undo が、入力欄でのタイピングを横取りしないために使う。
 */
export function isEditableElement(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  return (el as HTMLElement).isContentEditable === true;
}
