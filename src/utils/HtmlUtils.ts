/**
 * HTML関連のユーティリティ関数
 */
// biome-ignore lint/complexity/noStaticOnlyClass: ユーティリティ関数のグループ化とnamespace的役割のため
export class HtmlUtils {
  /**
   * HTMLの特殊文字をエスケープする
   */
  static escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * URLからドメインを抽出する
   */
  static getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return 'localhost';
    }
  }

  /**
   * 安全なHTML文字列を作成する
   */
  static createSafeHtml(templateFn: () => string): string {
    try {
      return templateFn();
    } catch (error) {
      console.error('HTML生成エラー:', error);
      return '<div class="error">コンテンツの生成に失敗しました</div>';
    }
  }

  /**
   * 要素の表示/非表示を切り替える
   */
  static toggleVisibility(element: HTMLElement, visible: boolean): void {
    if (visible) {
      element.style.display = 'block';
      element.classList.remove('hidden');
    } else {
      element.style.display = 'none';
      element.classList.add('hidden');
    }
  }

  /**
   * 要素に安全にイベントリスナーを追加する
   */
  static addEventListenerSafely(
    element: Element | null,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): boolean {
    if (!element) {
      console.warn('イベントリスナーの追加に失敗: 要素が見つかりません');
      return false;
    }

    try {
      element.addEventListener(event, handler, options);
      return true;
    } catch (error) {
      console.error('イベントリスナーの追加に失敗:', error);
      return false;
    }
  }

  /**
   * 複数の要素に同じイベントリスナーを追加する
   */
  static addEventListenerToAll(
    selector: string,
    event: string,
    handler: EventListener,
    options?: boolean | AddEventListenerOptions
  ): number {
    const elements = document.querySelectorAll(selector);
    let successCount = 0;

    elements.forEach((element) => {
      if (HtmlUtils.addEventListenerSafely(element, event, handler, options)) {
        successCount++;
      }
    });

    return successCount;
  }

  /**
   * データ属性から値を安全に取得する
   */
  static getDataAttribute(
    element: Element | null,
    attributeName: string
  ): string | null {
    if (!element) {
      return null;
    }

    const value = element.getAttribute(`data-${attributeName}`);
    return value || null;
  }

  /**
   * テキストを省略形で表示する
   */
  static truncateText(
    text: string,
    maxLength: number,
    ellipsis = '...'
  ): string {
    if (text.length <= maxLength) {
      return text;
    }

    return text.slice(0, maxLength - ellipsis.length) + ellipsis;
  }

  /**
   * URLが有効かどうかをチェックする
   */
  static isValidUrl(urlString: string): boolean {
    try {
      new URL(urlString);
      return true;
    } catch {
      return false;
    }
  }
}
