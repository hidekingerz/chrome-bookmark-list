/**
 * タブ切り替えを管理するコントローラー
 *
 * ヘッダー下のタブナビゲーション（.tab-button[data-tab]）と
 * 各タブパネル（#tab-panel-<id>）の表示状態を制御する。
 * タブがアクティブになったときに実行するハンドラーを登録でき、
 * 履歴やカレンダーのデータ読み込みを遅延実行できる。
 */
export type TabId = string;

export class TabController {
  private buttons: Map<TabId, HTMLElement> = new Map();
  private panels: Map<TabId, HTMLElement> = new Map();
  private activationHandlers: Map<TabId, () => void | Promise<void>> =
    new Map();
  private activeTab: TabId | null = null;

  constructor(private root: ParentNode = document) {
    this.init();
  }

  private init(): void {
    const buttons = this.root.querySelectorAll('.tab-button');
    for (const button of Array.from(buttons)) {
      const tab = button.getAttribute('data-tab');
      if (!tab) continue;

      this.buttons.set(tab, button as HTMLElement);

      const panel = this.root.querySelector(`#tab-panel-${tab}`);
      if (panel) {
        this.panels.set(tab, panel as HTMLElement);
      }

      button.addEventListener('click', () => {
        void this.activate(tab);
      });
    }

    // 初期表示状態（active クラスを持つタブ）を記録
    for (const [tab, button] of this.buttons) {
      if (button.classList.contains('active')) {
        this.activeTab = tab;
        break;
      }
    }
  }

  /**
   * 指定したタブがアクティブになったときに実行するハンドラーを登録する
   */
  public onActivate(tab: TabId, handler: () => void | Promise<void>): void {
    this.activationHandlers.set(tab, handler);
  }

  /**
   * 指定したタブをアクティブにする
   */
  public async activate(tab: TabId): Promise<void> {
    if (!this.buttons.has(tab)) return;

    this.activeTab = tab;

    for (const [id, button] of this.buttons) {
      const isActive = id === tab;
      button.classList.toggle('active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    }

    for (const [id, panel] of this.panels) {
      const isActive = id === tab;
      panel.classList.toggle('active', isActive);
      if (isActive) {
        panel.removeAttribute('hidden');
      } else {
        panel.setAttribute('hidden', '');
      }
    }

    const handler = this.activationHandlers.get(tab);
    if (handler) {
      await handler();
    }
  }

  /**
   * 現在アクティブなタブのIDを返す
   */
  public getActiveTab(): TabId | null {
    return this.activeTab;
  }
}
