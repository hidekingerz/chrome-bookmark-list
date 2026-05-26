import { escapeHtml } from '../../scripts/utils.js';

export interface ToastAction {
  label: string;
  onActivate: () => void | Promise<void>;
}

export interface ToastOptions {
  message: string;
  durationMs?: number;
  action?: ToastAction;
}

const TOAST_CONTAINER_ID = 'app-toast-container';
const DEFAULT_DURATION_MS = 5000;

/**
 * 画面下部に表示する Toast (スナックバー) コンポーネント。
 * 同時に表示できるのは 1 件で、新しい Toast は既存の Toast を置き換える。
 */
export class Toast {
  private static currentInstance: Toast | null = null;

  private element: HTMLElement;
  private timerId: number | null = null;
  private action: ToastAction | null;

  private constructor(options: ToastOptions) {
    this.action = options.action ?? null;
    this.element = this.render(options);
    this.attachHandlers();
    this.scheduleAutoClose(options.durationMs ?? DEFAULT_DURATION_MS);
  }

  /**
   * Toast を表示する。既存の Toast があれば置き換える。
   */
  static show(options: ToastOptions): Toast {
    Toast.dismissCurrent();
    const instance = new Toast(options);
    Toast.currentInstance = instance;
    return instance;
  }

  /**
   * 現在表示中の Toast を閉じる。
   */
  static dismissCurrent(): void {
    Toast.currentInstance?.dismiss();
  }

  /**
   * 現在表示中の Toast のアクションを発火させる。Cmd/Ctrl+Z などからの呼び出し用。
   * アクションを実行できた場合は true を返す。
   */
  static async triggerCurrentAction(): Promise<boolean> {
    const instance = Toast.currentInstance;
    if (!instance?.action) {
      return false;
    }
    await instance.activateAction();
    return true;
  }

  /**
   * テスト用: 現在のインスタンスを取得する。
   */
  static getCurrentInstance(): Toast | null {
    return Toast.currentInstance;
  }

  /**
   * Toast を閉じる。
   */
  dismiss(): void {
    if (this.timerId !== null) {
      window.clearTimeout(this.timerId);
      this.timerId = null;
    }
    this.element.remove();
    if (Toast.currentInstance === this) {
      Toast.currentInstance = null;
    }
  }

  /**
   * アクションが設定されているかどうか。
   */
  hasAction(): boolean {
    return this.action !== null;
  }

  private async activateAction(): Promise<void> {
    const action = this.action;
    if (!action) {
      return;
    }
    // アクション実行中に Toast がクリアされても問題ないように先に dismiss する
    this.dismiss();
    try {
      await action.onActivate();
    } catch (error) {
      console.error('❌ Toast アクションの実行に失敗:', error);
    }
  }

  private render(options: ToastOptions): HTMLElement {
    const container = this.ensureContainer();

    const toast = document.createElement('div');
    toast.className = 'app-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const actionHtml = options.action
      ? `<button type="button" class="app-toast-action">${escapeHtml(
          options.action.label
        )}</button>`
      : '';

    toast.innerHTML = `
      <span class="app-toast-message">${escapeHtml(options.message)}</span>
      ${actionHtml}
      <button type="button" class="app-toast-close" aria-label="閉じる">×</button>
    `;

    container.appendChild(toast);
    return toast;
  }

  private ensureContainer(): HTMLElement {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      container = document.createElement('div');
      container.id = TOAST_CONTAINER_ID;
      container.className = 'app-toast-container';
      document.body.appendChild(container);
    }
    return container;
  }

  private attachHandlers(): void {
    const actionBtn =
      this.element.querySelector<HTMLButtonElement>('.app-toast-action');
    actionBtn?.addEventListener('click', () => {
      void this.activateAction();
    });

    const closeBtn =
      this.element.querySelector<HTMLButtonElement>('.app-toast-close');
    closeBtn?.addEventListener('click', () => {
      this.dismiss();
    });
  }

  private scheduleAutoClose(durationMs: number): void {
    if (durationMs <= 0) return;
    this.timerId = window.setTimeout(() => {
      this.dismiss();
    }, durationMs);
  }
}
