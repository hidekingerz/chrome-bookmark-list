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

/**
 * 画面に重ねて出す部品（複数選択のツールバー、コンテキストメニュー）の置き場所。
 * ページの内容はランドマークの中に置く。main が無いページでは body に置く。
 */
export function overlayHost(): HTMLElement {
  return document.querySelector('main') ?? document.body;
}
