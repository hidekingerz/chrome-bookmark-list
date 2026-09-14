import { escapeHtml } from '../../scripts/utils.js';
import { confirmDialog } from '../Dialog/index.js';

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
  private confirmManyTabs(count: number, folderName: string): Promise<boolean> {
    return confirmDialog({
      id: 'tab-group-confirm-dialog',
      title: '多数のタブを開きますか？',
      bodyHtml: `
            <p>「${escapeHtml(folderName)}」内の <strong>${count}件</strong> のブックマークを一度に開きます。</p>
            <p class="delete-warning">処理に時間がかかる場合があります。</p>
      `,
      confirmLabel: '開く',
      confirmClassName: 'edit-dialog-save tab-group-confirm',
    });
  }
}
