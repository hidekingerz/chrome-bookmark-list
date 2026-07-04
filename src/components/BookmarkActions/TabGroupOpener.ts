import { escapeHtml } from '../../scripts/utils.js';

/** Chrome のタブグループ色 (固定リストから自動割り当て) */
type TabGroupColor =
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

const GROUP_COLORS: TabGroupColor[] = [
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
];

/** 大量のタブを開く前に警告するしきい値 */
const CONFIRM_THRESHOLD = 20;

/**
 * 複数の URL を新規タブで開き、Chrome のタブグループにまとめる。
 *
 * 設計判断:
 * - サブフォルダの中身も再帰的に含めるかは呼び出し側で決定 (この関数は URL リストを受け取るだけ)
 * - グループ色はフォルダ名のハッシュから決定し、同じフォルダなら毎回同じ色になる
 * - 大量に開く場合は確認ダイアログを挟む
 */
export class TabGroupOpener {
  /**
   * URL の配列をタブグループとして開く。
   *
   * @param urls 開く URL の配列 (空なら何もしない)
   * @param folderName グループ名 (フォルダ名)
   */
  async openAsGroup(urls: string[], folderName: string): Promise<void> {
    if (urls.length === 0) return;

    if (urls.length > CONFIRM_THRESHOLD) {
      const confirmed = await this.confirmManyTabs(urls.length, folderName);
      if (!confirmed) return;
    }

    // chrome.tabs.group / chrome.tabGroups は manifest permissions に tabGroups が
    // 含まれ、かつユーザーが新しい権限を承認した拡張機能でのみ使える。
    // 古い Chrome や権限未承認の場合は素のタブ作成にフォールバックする。
    const tabGroupApiAvailable =
      typeof chrome.tabs?.group === 'function' &&
      typeof chrome.tabGroups?.update === 'function';

    if (!tabGroupApiAvailable) {
      console.warn(
        '⚠️ chrome.tabGroups API が利用できません。' +
          'タブグループ化をスキップして個別タブとして開きます。' +
          ' permissions 変更後は拡張機能を再読み込みするか再インストールしてください。'
      );
      for (const url of urls) {
        await chrome.tabs.create({ url, active: false });
      }
      return;
    }

    try {
      const tabs = await Promise.all(
        urls.map((url) => chrome.tabs.create({ url, active: false }))
      );
      const tabIds = tabs
        .map((t) => t.id)
        .filter((id): id is number => typeof id === 'number');
      if (tabIds.length === 0) return;

      const groupId = await chrome.tabs.group({
        tabIds: tabIds as [number, ...number[]],
      });
      await chrome.tabGroups.update(groupId, {
        title: folderName,
        color: this.pickColor(folderName),
      });
    } catch (error) {
      console.error('❌ タブグループの作成に失敗しました:', error);
      alert(
        'タブグループの作成に失敗しました。\n拡張機能を再インストールして「タブグループ」権限を承認してください。'
      );
    }
  }

  /**
   * フォルダ名から決定的に色を選ぶ。同じ名前なら常に同じ色になる。
   */
  private pickColor(folderName: string): TabGroupColor {
    let hash = 0;
    for (let i = 0; i < folderName.length; i++) {
      hash = (hash * 31 + folderName.charCodeAt(i)) >>> 0;
    }
    return GROUP_COLORS[hash % GROUP_COLORS.length];
  }

  /**
   * 大量タブを開く前の確認ダイアログを表示する。
   */
  private async confirmManyTabs(
    count: number,
    folderName: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      document.getElementById('tab-group-confirm-dialog')?.remove();
      document.body.insertAdjacentHTML(
        'beforeend',
        this.createConfirmDialogHTML(count, folderName)
      );

      const dialog = document.getElementById('tab-group-confirm-dialog');
      const closeBtn = dialog?.querySelector('.edit-dialog-close');
      const cancelBtn = dialog?.querySelector('.edit-dialog-cancel');
      const confirmBtn = dialog?.querySelector('.tab-group-confirm');

      const close = (result: boolean) => {
        // どの経路で閉じても ESC 用リスナーを確実に解除する (#100 リーク防止)
        document.removeEventListener('keydown', keydown);
        dialog?.remove();
        resolve(result);
      };

      closeBtn?.addEventListener('click', () => close(false));
      cancelBtn?.addEventListener('click', () => close(false));
      confirmBtn?.addEventListener('click', () => close(true));

      const keydown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          close(false);
        }
      };
      document.addEventListener('keydown', keydown);

      (cancelBtn as HTMLElement | null)?.focus();
    });
  }

  private createConfirmDialogHTML(count: number, folderName: string): string {
    return `
      <div id="tab-group-confirm-dialog" class="edit-dialog-overlay">
        <div class="edit-dialog" role="dialog" aria-modal="true">
          <div class="edit-dialog-header">
            <h3>多数のタブを開きますか？</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">
            <p>「${escapeHtml(folderName)}」内の <strong>${count}件</strong> のブックマークを一度に開きます。</p>
            <p class="delete-warning">処理に時間がかかる場合があります。</p>
          </div>
          <div class="edit-dialog-actions">
            <button type="button" class="edit-dialog-cancel">キャンセル</button>
            <button type="button" class="edit-dialog-save tab-group-confirm">開く</button>
          </div>
        </div>
      </div>
    `;
  }
}
