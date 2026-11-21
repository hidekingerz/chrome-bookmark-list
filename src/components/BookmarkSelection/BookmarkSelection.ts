import { dispatchBookmarksChanged } from '../../scripts/bookmarkEvents.js';
import { isEditableElement, overlayHost } from '../../scripts/dom.js';
import { escapeHtml, getAllFolders } from '../../scripts/utils.js';
import type { ChromeBookmarkNode } from '../../types/bookmark.js';
import { resolveBookmarkNode } from '../../utils/bookmarkResolver.js';
import { confirmDialog, errorDialog, openDialog } from '../Dialog/index.js';
import { UndoManager } from '../UndoManager/index.js';
import {
  restoreChildOrder,
  snapshotChildOrder,
} from '../UndoManager/restoreOrder.js';

/**
 * 選択中のブックマークを表現する情報
 */
interface SelectedBookmark {
  /** 選択を区別するキー。ブックマークの ID があれば ID、無ければ URL */
  key: string;
  url: string;
  title: string;
  /** ブックマーク要素のDOM参照 (DOM更新用) */
  element: HTMLElement | null;
}

/**
 * 一括移動・削除用にスナップショットを取った復元情報
 */
interface BookmarkRestoreInfo {
  parentId: string | undefined;
  index: number | undefined;
  title: string;
  url: string;
}

/** ブックマーク項目の URL（リンクの data-url）。 */
function urlOfItem(item: HTMLElement): string {
  return item.querySelector('.bookmark-link')?.getAttribute('data-url') ?? '';
}

/**
 * 選択を区別するキー。項目が Chrome のノード ID (`data-bookmark-id`) を持てば ID、
 * 持たなければ URL を使う。ID と URL が取り違えられないよう接頭辞を付ける。
 */
function selectionKey(item: HTMLElement, url: string): string {
  const id = item.getAttribute('data-bookmark-id');
  return id ? `id:${id}` : `url:${url}`;
}

/**
 * ブックマークの複数選択状態を管理し、一括操作 (削除/移動) を提供するクラス。
 *
 * - クリックモデル:
 *   - 修飾キーなし: 単一選択へ切り替え (またはトグル)
 *   - Shift+クリック: 直前にクリックしたアイテムからの範囲選択
 *   - Cmd/Ctrl+クリック: 追加選択 (トグル)
 * - 1件以上選択されているとフローティングツールバーを表示
 * - ESC で選択解除
 *
 * 選択はブックマークごとに持つ。項目の `data-bookmark-id`（Chrome のノード ID）を
 * キーにするので、同じ URL のブックマークが複数あっても別々に選べ、一覧が描き直されても
 * 選んだブックマークが選ばれたままになる。ID を持たない項目だけ、URL をキーにする。
 */
export class BookmarkSelection {
  private selected = new Map<string, SelectedBookmark>();
  private lastClickedKey: string | null = null;
  private container: HTMLElement | null = null;
  private toolbarElement: HTMLElement | null = null;
  private orderedKeys: string[] = [];
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * コンテナを再設定し、選択のハイライトを付け直す。
   * ブックマーク再描画後に呼ぶ。
   */
  refresh(container: HTMLElement): void {
    this.container = container;
    this.ensureKeydownHandler();
    // 表示中の DOM 要素が変わるので、選択中アイテムにクラスを再適用する
    this.reapplySelectionToDom();
    this.updateToolbar();
  }

  /**
   * クリック時の選択処理。
   * @returns true ならクリック処理を消費した (通常のリンク遷移を抑制する)
   */
  handleClick(
    url: string,
    title: string,
    element: HTMLElement,
    e: MouseEvent
  ): boolean {
    if (e.shiftKey) {
      this.selectRange(url, title, element);
      this.lastClickedKey = selectionKey(element, url);
      return true;
    }

    // Cmd/Ctrl+クリックは新しいタブで開く動作 (#68) に譲るため、選択処理はしない。
    // 非連続な複数選択は、コンテキストメニューや別途のトグルで対応する想定。
    if (e.metaKey || e.ctrlKey) {
      return false;
    }

    // 修飾キーなし: 既に複数選択がある場合は選択をリセット
    // (単一選択中で同じアイテムなら解除、別アイテムなら通常のリンク遷移)
    if (this.selected.size > 0) {
      this.clear();
      this.lastClickedKey = null;
      // 選択解除のみを消費。リンク遷移は次のクリックで行わせる。
      return true;
    }
    this.lastClickedKey = selectionKey(element, url);
    return false;
  }

  /**
   * 1件選択を追加/解除する (Cmd/Ctrl+クリック)
   */
  toggle(url: string, title: string, element: HTMLElement): void {
    const key = selectionKey(element, url);
    if (this.selected.has(key)) {
      this.selected.delete(key);
      element.classList.remove('selected');
    } else {
      this.selected.set(key, { key, url, title, element });
      element.classList.add('selected');
    }
    this.updateToolbar();
  }

  /**
   * 範囲選択 (Shift+クリック)
   * 直前にクリックしたアイテムから現在のアイテムまでを選択状態にする。
   */
  selectRange(url: string, title: string, element: HTMLElement): void {
    if (!this.container) {
      this.toggle(url, title, element);
      return;
    }

    // 表示順序を最新化
    this.refreshOrderedKeys();

    const anchor = this.lastClickedKey;
    if (!anchor || !this.orderedKeys.includes(anchor)) {
      // アンカーがない場合は単一選択
      this.selectOnly(url, title, element);
      return;
    }

    const anchorIdx = this.orderedKeys.indexOf(anchor);
    const targetIdx = this.orderedKeys.indexOf(selectionKey(element, url));
    if (anchorIdx === -1 || targetIdx === -1) {
      this.selectOnly(url, title, element);
      return;
    }

    const [from, to] =
      anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];

    // 範囲外を解除
    this.clearInternal();

    for (let i = from; i <= to; i++) {
      const rangeKey = this.orderedKeys[i];
      const rangeEl = this.findItemByKey(rangeKey);
      if (!rangeEl) continue;
      const rangeTitle =
        rangeEl.querySelector('.bookmark-title')?.textContent?.trim() ?? '';
      this.selected.set(rangeKey, {
        key: rangeKey,
        url: urlOfItem(rangeEl),
        title: rangeTitle,
        element: rangeEl,
      });
      rangeEl.classList.add('selected');
    }

    this.updateToolbar();
  }

  /**
   * 単一選択に切り替える
   */
  selectOnly(url: string, title: string, element: HTMLElement): void {
    this.clearInternal();
    const key = selectionKey(element, url);
    this.selected.set(key, { key, url, title, element });
    element.classList.add('selected');
    this.updateToolbar();
  }

  /**
   * すべての選択を解除する (ESC など)
   * 範囲選択のアンカー (lastClickedKey) もリセットして、状態を完全に初期化する。
   */
  clear(): void {
    this.clearInternal();
    this.lastClickedKey = null;
    this.updateToolbar();
    // ESC を押した瞬間に :focus-visible が活性化し、選択時と似た outline
    // だけが残って崩れて見える問題を防ぐため、ブックマーク項目のフォーカスを外す
    this.blurFocusedBookmarkItem();
  }

  private blurFocusedBookmarkItem(): void {
    const active = document.activeElement as HTMLElement | null;
    if (active?.closest('.bookmark-item, .bookmark-link')) {
      active.blur();
    }
  }

  private clearInternal(): void {
    for (const item of this.selected.values()) {
      item.element?.classList.remove('selected');
    }
    // 描画から外れた要素もクラス除去
    if (this.container) {
      const stale = this.container.querySelectorAll('.bookmark-item.selected');
      for (const el of Array.from(stale)) {
        el.classList.remove('selected');
      }
    }
    this.selected.clear();
  }

  /**
   * 選択件数
   */
  get count(): number {
    return this.selected.size;
  }

  /**
   * 選択中の URL 一覧
   */
  getSelectedUrls(): string[] {
    return Array.from(this.selected.values(), (item) => item.url);
  }

  /**
   * 選択中アイテムを一括削除する。
   */
  async bulkDelete(): Promise<void> {
    if (this.selected.size === 0) return;
    const items = Array.from(this.selected.values());

    const confirmed = await this.showConfirmDialog(
      `選択中の ${items.length} 件のブックマークを削除します。よろしいですか？`,
      '一括削除'
    );
    if (!confirmed) return;

    const restoreInfos: BookmarkRestoreInfo[] = [];
    let failureCount = 0;
    // 削除する前に、対象をすべて同定して元の位置を控える。1 件ずつ削除しながら
    // index を読むと、先に削除した分だけ後ろの項目の index がずれ、Undo で元の
    // 並びに戻せない。
    const targets: { id: string; info: BookmarkRestoreInfo }[] = [];
    for (const item of items) {
      try {
        // 選択要素が保持する data-bookmark-id で一意に同定する (#97)
        const target = await resolveBookmarkNode(
          item.element?.getAttribute('data-bookmark-id') ?? null,
          item.url
        );
        // 既に無くなっていた項目は、失敗として数える
        if (!target) {
          failureCount++;
          continue;
        }
        targets.push({
          id: target.id,
          info: {
            parentId: target.parentId,
            index: target.index,
            title: target.title,
            url: target.url ?? item.url,
          },
        });
      } catch (error) {
        failureCount++;
        console.error(
          '❌ 一括削除中にブックマークの削除に失敗しました:',
          error
        );
      }
    }
    // 途中で1件失敗しても残りを処理し、成功分だけを記録する (#101)。
    // ループ全体を try/catch で囲うと最初の失敗で中断し、成功済みの削除が
    // UI/Undo に反映されず実状態と乖離するため、各件ごとに捕捉する。
    for (const target of targets) {
      try {
        await chrome.bookmarks.remove(target.id);
        // 実際に削除できたものだけ Undo 対象にする
        restoreInfos.push(target.info);
      } catch (error) {
        failureCount++;
        console.error(
          '❌ 一括削除中にブックマークの削除に失敗しました:',
          error
        );
      }
    }
    // Undo では元の index の小さい順に作り直す（前から順に戻せば index がずれない）
    restoreInfos.sort((x, y) => (x.index ?? 0) - (y.index ?? 0));

    // 成否にかかわらず選択を解除し、UI を実状態に同期する
    this.clear();

    const count = restoreInfos.length;
    if (count > 0) {
      dispatchBookmarksChanged('bulk-delete');
      const message =
        failureCount > 0
          ? `${count} 件を削除しました（${failureCount} 件は失敗）`
          : `${count} 件のブックマークを削除しました`;
      UndoManager.getInstance().register({
        message,
        undo: async () => {
          for (const info of restoreInfos) {
            await chrome.bookmarks.create({
              parentId: info.parentId,
              index: info.index,
              title: info.title,
              url: info.url,
            });
          }
          dispatchBookmarksChanged('undo-bulk-delete');
        },
      });
    } else if (failureCount > 0) {
      // 全件失敗時は Undo 対象が無いので、失敗を「エラー」ダイアログで知らせる
      void errorDialog(
        `${failureCount} 件のブックマークを削除できませんでした。`
      );
    }
  }

  /**
   * 選択中アイテムを一括移動する。
   */
  async bulkMove(): Promise<void> {
    if (this.selected.size === 0) return;
    const items = Array.from(this.selected.values());

    let folders: ChromeBookmarkNode[];
    try {
      folders = await getAllFolders();
    } catch (error) {
      console.error('❌ 移動先フォルダの一覧を取得できませんでした:', error);
      void errorDialog('ブックマークの移動を開始できませんでした。');
      return;
    }
    const parentId = await this.showMoveDialog(folders, items.length);
    if (!parentId) return;

    let failureCount = 0;
    let count = 0;
    // 動かす前に、対象をすべて同定して元の並びを控える（Undo で元の並びへ戻すため）
    const targets: chrome.bookmarks.BookmarkTreeNode[] = [];
    for (const item of items) {
      try {
        // 選択要素が保持する data-bookmark-id で一意に同定する (#97)
        const target = await resolveBookmarkNode(
          item.element?.getAttribute('data-bookmark-id') ?? null,
          item.url
        );
        // 既に無くなっていた項目は、失敗として数える
        if (target) targets.push(target);
        else failureCount++;
      } catch (error) {
        failureCount++;
        console.error(
          '❌ 一括移動中にブックマークの移動に失敗しました:',
          error
        );
      }
    }
    const snapshot = await snapshotChildOrder(
      targets.map((target) => target.parentId)
    );
    // 途中で1件失敗しても残りを処理し、成功分だけを数える (#101)。
    for (const target of targets) {
      try {
        await chrome.bookmarks.move(target.id, { parentId });
        count++;
      } catch (error) {
        failureCount++;
        console.error(
          '❌ 一括移動中にブックマークの移動に失敗しました:',
          error
        );
      }
    }

    // 成否にかかわらず選択を解除し、UI を実状態に同期する
    this.clear();

    if (count > 0) {
      dispatchBookmarksChanged('bulk-move');
      const message =
        failureCount > 0
          ? `${count} 件を移動しました（${failureCount} 件は失敗）`
          : `${count} 件のブックマークを移動しました`;
      UndoManager.getInstance().register({
        message,
        undo: async () => {
          await restoreChildOrder(snapshot);
          dispatchBookmarksChanged('undo-bulk-move');
        },
      });
    } else if (failureCount > 0) {
      // 全件失敗時は Undo 対象が無いので、失敗をそのまま通知する
      void errorDialog(
        `${failureCount} 件のブックマークを移動できませんでした。`
      );
    }
  }

  // ---------------------------------------------------------------------
  // 内部ヘルパー
  // ---------------------------------------------------------------------

  private refreshOrderedKeys(): void {
    this.orderedKeys = this.items()
      .filter((el) => urlOfItem(el).length > 0)
      .map((el) => selectionKey(el, urlOfItem(el)));
  }

  /** 一覧に表示されているブックマーク項目（表示順）。 */
  private items(): HTMLElement[] {
    if (!this.container) return [];
    return Array.from(
      this.container.querySelectorAll<HTMLElement>('.bookmark-item')
    );
  }

  private findItemByKey(key: string): HTMLElement | null {
    return (
      this.items().find((el) => selectionKey(el, urlOfItem(el)) === key) ?? null
    );
  }

  private reapplySelectionToDom(): void {
    // 古いハイライトを除去
    for (const el of this.items()) {
      el.classList.remove('selected');
    }
    // 選択中のものに改めて付与
    for (const item of this.selected.values()) {
      const el = this.findItemByKey(item.key);
      if (el) {
        el.classList.add('selected');
        item.element = el;
      }
    }
  }

  private ensureKeydownHandler(): void {
    if (this.keydownHandler) return;
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (this.selected.size === 0) return;
      // 入力欄にフォーカスがあるときはスキップ
      if (isEditableElement(document.activeElement)) return;
      // モーダル表示中は ESC をモーダル側に任せる
      if (document.querySelector('.edit-dialog-overlay')) return;
      e.preventDefault();
      this.clear();
    };
    document.addEventListener('keydown', this.keydownHandler);
  }

  private updateToolbar(): void {
    if (this.selected.size === 0) {
      this.toolbarElement?.remove();
      this.toolbarElement = null;
      return;
    }

    if (!this.toolbarElement) {
      this.toolbarElement = this.createToolbar();
      overlayHost().appendChild(this.toolbarElement);
    }

    const countEl = this.toolbarElement.querySelector(
      '.selection-toolbar-count'
    );
    if (countEl) {
      countEl.textContent = `${this.selected.size} 件選択中`;
    }
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'selection-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', '選択中のブックマーク操作');
    toolbar.innerHTML = `
      <span class="selection-toolbar-count">0 件選択中</span>
      <div class="selection-toolbar-actions">
        <button type="button" class="selection-toolbar-btn selection-toolbar-move">移動</button>
        <button type="button" class="selection-toolbar-btn selection-toolbar-delete">削除</button>
        <button type="button" class="selection-toolbar-btn selection-toolbar-clear" aria-label="選択解除">×</button>
      </div>
    `;

    toolbar
      .querySelector('.selection-toolbar-move')
      ?.addEventListener('click', () => {
        void this.bulkMove();
      });
    toolbar
      .querySelector('.selection-toolbar-delete')
      ?.addEventListener('click', () => {
        void this.bulkDelete();
      });
    toolbar
      .querySelector('.selection-toolbar-clear')
      ?.addEventListener('click', () => {
        this.clear();
      });

    return toolbar;
  }

  // ---------------------------------------------------------------------
  // ダイアログ表示 (一括削除確認 / 移動先フォルダ選択)
  // ---------------------------------------------------------------------

  private showConfirmDialog(message: string, title: string): Promise<boolean> {
    return confirmDialog({
      id: 'bulk-confirm-dialog',
      title,
      bodyHtml: `
              <div class="delete-confirmation-message">
                <p>${escapeHtml(message)}</p>
                <p class="delete-warning">削除後 5 秒以内であれば「元に戻す」で復元できます。</p>
              </div>
      `,
      confirmLabel: '削除',
      confirmClassName: 'delete-dialog-confirm',
    });
  }

  private showMoveDialog(
    folders: ChromeBookmarkNode[],
    count: number
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const folderOptions = folders
        .map((folder) => {
          const label = folder.title || `(ルート: ${folder.id})`;
          return `<option value="${escapeHtml(folder.id)}">${escapeHtml(label)}</option>`;
        })
        .join('');

      let result: string | null = null;
      openDialog({
        id: 'bulk-move-dialog',
        title: `${count} 件のブックマークを移動`,
        bodyHtml: `
              <div class="edit-form-group">
                <label for="bulk-move-parent">移動先フォルダ:</label>
                <select id="bulk-move-parent">
                  ${folderOptions}
                </select>
              </div>
        `,
        buttons: [
          {
            label: 'キャンセル',
            className: 'edit-dialog-cancel',
            onClick: (close) => close(),
          },
          {
            label: '移動',
            className: 'edit-dialog-save bulk-move-confirm',
            onClick: (close) => {
              const select = document.getElementById(
                'bulk-move-parent'
              ) as HTMLSelectElement | null;
              result = select?.value ?? null;
              close();
            },
          },
        ],
        onClose: () => resolve(result),
      });
    });
  }
}
