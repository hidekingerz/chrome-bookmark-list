/**
 * エラーハンドリングとユーザー通知を統一管理するサービス
 */
// biome-ignore lint/complexity/noStaticOnlyClass: エラーハンドリング機能のグループ化とnamespace的役割のため
export class ErrorHandler {
  /**
   * ブックマーク操作のエラーを処理する
   */
  static handleBookmarkOperation(
    error: Error,
    operation: string,
    context?: unknown
  ): void {
    console.error(`ブックマーク${operation}エラー:`, error, context);

    const userMessage = ErrorHandler.getUserFriendlyMessage(error, operation);
    ErrorHandler.showNotification(userMessage, 'error');
  }

  /**
   * Favicon取得エラーを処理する（軽微なエラーとして扱う）
   */
  static handleFaviconError(error: Error, url: string): void {
    console.warn('Favicon取得エラー:', url, error);
    // Faviconエラーはユーザーに通知しない（デフォルトアイコンを使用）
  }

  /**
   * 一般的なエラーを処理する
   */
  static handleGenericError(error: Error, context?: string): void {
    console.error('予期しないエラー:', error, context);
    ErrorHandler.showNotification('予期しないエラーが発生しました。', 'error');
  }

  /**
   * エラーからユーザー向けメッセージを生成する
   */
  private static getUserFriendlyMessage(
    error: Error,
    operation: string
  ): string {
    if (error.message.includes('見つかりません')) {
      return `${operation}対象のブックマークが見つかりません。`;
    }

    if (
      error.message.includes('permissions') ||
      error.message.includes('権限')
    ) {
      return `${operation}に必要な権限がありません。`;
    }

    if (error.message.includes('network') || error.message.includes('fetch')) {
      return `ネットワークエラーのため${operation}に失敗しました。`;
    }

    return `ブックマークの${operation}に失敗しました。`;
  }

  /**
   * ユーザーに通知を表示する
   */
  private static showNotification(
    message: string,
    type: 'info' | 'warning' | 'error' = 'info'
  ): void {
    // 現在はalertを使用しているが、将来的にはよりユーザーフレンドリーな通知システムに置き換える
    if (type === 'error') {
      alert(`❌ ${message}`);
    } else if (type === 'warning') {
      alert(`⚠️ ${message}`);
    } else {
      alert(`ℹ️ ${message}`);
    }
  }

  /**
   * 開発用のデバッグ情報を表示する
   */
  static debug(message: string, data?: unknown): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`🐛 DEBUG: ${message}`, data);
    }
  }

  /**
   * パフォーマンス測定用のタイマーを開始する
   */
  static startTimer(label: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.time(label);
    }
  }

  /**
   * パフォーマンス測定用のタイマーを終了する
   */
  static endTimer(label: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.timeEnd(label);
    }
  }
}
