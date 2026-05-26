import { Toast } from '../Toast/index.js';

export interface UndoableOperation {
  message: string;
  undo: () => void | Promise<void>;
}

/**
 * 直前の破壊的操作の取り消し (Undo) を管理する。
 *
 * 設計判断:
 * - 深さ 1 の置換方式。新しい操作が来ると古い Undo は破棄される
 * - 理由: 並べ替えや連続削除を考えると、複数履歴を扱うとIDずれや時系列の整合が複雑化
 *   して UX が壊れやすい。Chrome ブックマーク API では削除復元時に id が変わるため、
 *   後続操作が古い id を参照しても無効になる
 * - Cmd/Ctrl+Z は入力欄や contentEditable にフォーカスがあるときは標準動作を優先する
 */
export class UndoManager {
  private static instance: UndoManager | null = null;
  private currentUndo: (() => void | Promise<void>) | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  static getInstance(): UndoManager {
    if (!UndoManager.instance) {
      UndoManager.instance = new UndoManager();
    }
    return UndoManager.instance;
  }

  /**
   * グローバルなキーボードハンドラを登録する。アプリ起動時に一度だけ呼ぶ。
   */
  initialize(): void {
    if (this.keydownHandler) {
      return;
    }
    this.keydownHandler = (e: KeyboardEvent) => {
      const isUndo = (e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z';
      if (!isUndo) return;

      // 入力欄にフォーカスがある場合は標準動作を優先
      const active = document.activeElement as HTMLElement | null;
      if (this.isEditableElement(active)) return;

      if (!this.currentUndo) return;

      e.preventDefault();
      void this.triggerUndo();
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  /**
   * Undo 可能な操作を登録し、Toast に「元に戻す」ボタンを表示する。
   */
  register(operation: UndoableOperation): void {
    const undoFn = operation.undo;
    this.currentUndo = undoFn;
    Toast.show({
      message: operation.message,
      action: {
        label: '元に戻す',
        onActivate: async () => {
          // クリアしてから実行 (実行中に再登録されても上書きされる)
          if (this.currentUndo === undoFn) {
            this.currentUndo = null;
          }
          await undoFn();
        },
      },
    });
  }

  /**
   * 現在の Undo を実行する。Toast 経由・Cmd+Z 経由の両方から呼ばれる。
   */
  async triggerUndo(): Promise<boolean> {
    const handled = await Toast.triggerCurrentAction();
    if (!handled && this.currentUndo) {
      const fn = this.currentUndo;
      this.currentUndo = null;
      await fn();
      return true;
    }
    return handled;
  }

  /**
   * 現在の Undo をクリアする。
   */
  clear(): void {
    this.currentUndo = null;
  }

  /**
   * Undo が利用可能か。
   */
  hasUndo(): boolean {
    return this.currentUndo !== null;
  }

  private isEditableElement(el: HTMLElement | null): boolean {
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      return true;
    }
    if (el.isContentEditable) {
      return true;
    }
    return false;
  }
}
