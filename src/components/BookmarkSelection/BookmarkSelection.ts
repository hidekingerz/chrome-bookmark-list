import { escapeHtml } from '../../scripts/utils.js';
import type { ChromeBookmarkNode } from '../../types/bookmark.js';
import { resolveBookmarkNode } from '../../utils/bookmarkResolver.js';
import { UndoManager } from '../UndoManager/index.js';

/**
 * 選択中のブックマークを表現する情報
 */
export interface SelectedBookmark {
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
 * 注意: 個々のブックマークは URL をキーとして管理する。
 *       同じ URL が複数登録されている場合は同一として扱う (Chrome 上は通常一意)。
 */
export class BookmarkSelection {
  private selected = new Map<string, SelectedBookmark>();
  private lastClickedUrl: string | null = null;
  private container: HTMLElement | null = null;
  private toolbarElement: HTMLElement | null = null;
  private orderedUrls: string[] = [];
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  /**
   * 選択モードを初期化する。
   * container にはブックマーク表示領域を渡す (DOM 走査・更新用)。
   */
  initialize(container: HTMLElement): void {
    this.container = container;
    this.refreshOrderedUrls();
    this.ensureKeydownHandler();
  }

  /**
   * コンテナを再設定し、表示順を更新する。
   * ブックマーク再描画後に呼ぶ。
   */
  refresh(container: HTMLElement): void {
    this.container = container;
    this.refreshOrderedUrls();
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
      this.lastClickedUrl = url;
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
      this.lastClickedUrl = null;
      // 選択解除のみを消費。リンク遷移は次のクリックで行わせる。
      return true;
    }
    this.lastClickedUrl = url;
    return false;
  }

  /**
   * 1件選択を追加/解除する (Cmd/Ctrl+クリック)
   */
  toggle(url: string, title: string, element: HTMLElement): void {
    if (this.selected.has(url)) {
      this.selected.delete(url);
      element.classList.remove('selected');
    } else {
      this.selected.set(url, { url, title, element });
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
    this.refreshOrderedUrls();

    const anchor = this.lastClickedUrl;
    if (!anchor || !this.orderedUrls.includes(anchor)) {
      // アンカーがない場合は単一選択
      this.selectOnly(url, title, element);
      return;
    }

    const anchorIdx = this.orderedUrls.indexOf(anchor);
    const targetIdx = this.orderedUrls.indexOf(url);
    if (anchorIdx === -1 || targetIdx === -1) {
      this.selectOnly(url, title, element);
      return;
    }

    const [from, to] =
      anchorIdx <= targetIdx ? [anchorIdx, targetIdx] : [targetIdx, anchorIdx];

    // 範囲外を解除
    this.clearInternal();

    for (let i = from; i <= to; i++) {
      const rangeUrl = this.orderedUrls[i];
      const rangeEl = this.findItemByUrl(rangeUrl);
      if (!rangeEl) continue;
      const rangeTitle =
        rangeEl.querySelector('.bookmark-title')?.textContent?.trim() ?? '';
      this.selected.set(rangeUrl, {
        url: rangeUrl,
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
    this.selected.set(url, { url, title, element });
    element.classList.add('selected');
    this.updateToolbar();
  }

  /**
   * すべての選択を解除する (ESC など)
   * 範囲選択のアンカー (lastClickedUrl) もリセットして、状態を完全に初期化する。
   */
  clear(): void {
    this.clearInternal();
    this.lastClickedUrl = null;
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
   * 選択中の URL 一覧 (テスト用)
   */
  getSelectedUrls(): string[] {
    return Array.from(this.selected.keys());
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
    try {
      for (const item of items) {
        // 選択要素が保持する data-bookmark-id で一意に同定する (#97)
        const target = await resolveBookmarkNode(
          item.element?.getAttribute('data-bookmark-id') ?? null,
          item.url
        );
        if (!target) continue;
        restoreInfos.push({
          parentId: target.parentId,
          index: target.index,
          title: target.title,
          url: target.url ?? item.url,
        });
        await chrome.bookmarks.remove(target.id);
      }

      this.clear();
      this.dispatchBookmarksChanged('bulk-delete');

      const count = restoreInfos.length;
      UndoManager.getInstance().register({
        message: `${count} 件のブックマークを削除しました`,
        undo: async () => {
          for (const info of restoreInfos) {
            await chrome.bookmarks.create({
              parentId: info.parentId,
              index: info.index,
              title: info.title,
              url: info.url,
            });
          }
          this.dispatchBookmarksChanged('undo-bulk-delete');
        },
      });
    } catch (error) {
      console.error('❌ 一括削除に失敗しました:', error);
    }
  }

  /**
   * 選択中アイテムを一括移動する。
   */
  async bulkMove(): Promise<void> {
    if (this.selected.size === 0) return;
    const items = Array.from(this.selected.values());

    const folders = await this.getAllFolders();
    const parentId = await this.showMoveDialog(folders, items.length);
    if (!parentId) return;

    const moveInfos: {
      id: string;
      previousParentId: string | undefined;
      previousIndex: number | undefined;
    }[] = [];
    try {
      for (const item of items) {
        // 選択要素が保持する data-bookmark-id で一意に同定する (#97)
        const target = await resolveBookmarkNode(
          item.element?.getAttribute('data-bookmark-id') ?? null,
          item.url
        );
        if (!target) continue;
        moveInfos.push({
          id: target.id,
          previousParentId: target.parentId,
          previousIndex: target.index,
        });
        await chrome.bookmarks.move(target.id, { parentId });
      }

      this.clear();
      this.dispatchBookmarksChanged('bulk-move');

      const count = moveInfos.length;
      UndoManager.getInstance().register({
        message: `${count} 件のブックマークを移動しました`,
        undo: async () => {
          for (const info of moveInfos) {
            if (info.previousParentId === undefined) continue;
            await chrome.bookmarks.move(info.id, {
              parentId: info.previousParentId,
              index: info.previousIndex,
            });
          }
          this.dispatchBookmarksChanged('undo-bulk-move');
        },
      });
    } catch (error) {
      console.error('❌ 一括移動に失敗しました:', error);
    }
  }

  // ---------------------------------------------------------------------
  // 内部ヘルパー
  // ---------------------------------------------------------------------

  private refreshOrderedUrls(): void {
    if (!this.container) {
      this.orderedUrls = [];
      return;
    }
    const links = this.container.querySelectorAll('.bookmark-link');
    this.orderedUrls = Array.from(links)
      .map((el) => el.getAttribute('data-url') ?? '')
      .filter((url) => url.length > 0);
  }

  private findItemByUrl(url: string): HTMLElement | null {
    if (!this.container) return null;
    // CSS.escape が無い環境 (一部のテスト) でも動くようにフォールバック
    const links = this.container.querySelectorAll('.bookmark-link');
    for (const link of Array.from(links)) {
      if (link.getAttribute('data-url') === url) {
        return (link.closest('.bookmark-item') as HTMLElement | null) ?? null;
      }
    }
    return null;
  }

  private reapplySelectionToDom(): void {
    if (!this.container) return;
    // 古いハイライトを除去
    const stale = this.container.querySelectorAll('.bookmark-item.selected');
    for (const el of Array.from(stale)) {
      el.classList.remove('selected');
    }
    // 選択中のものに改めて付与
    for (const item of this.selected.values()) {
      const el = this.findItemByUrl(item.url);
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
      const active = document.activeElement as HTMLElement | null;
      if (active) {
        const tag = active.tagName;
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          active.isContentEditable
        ) {
          return;
        }
      }
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
      document.body.appendChild(this.toolbarElement);
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

  private dispatchBookmarksChanged(action: string): void {
    const event = new CustomEvent('bookmarks-changed', { detail: { action } });
    document.dispatchEvent(event);
  }

  // ---------------------------------------------------------------------
  // ダイアログ表示 (一括削除確認 / 移動先フォルダ選択)
  // ---------------------------------------------------------------------

  private async showConfirmDialog(
    message: string,
    title: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const existing = document.getElementById('bulk-confirm-dialog');
      existing?.remove();

      const html = `
        <div id="bulk-confirm-dialog" class="edit-dialog-overlay">
          <div class="edit-dialog">
            <div class="edit-dialog-header">
              <h3>${escapeHtml(title)}</h3>
              <button class="edit-dialog-close" type="button">×</button>
            </div>
            <div class="edit-dialog-content">
              <div class="delete-confirmation-message">
                <p>${escapeHtml(message)}</p>
                <p class="delete-warning">削除後 5 秒以内であれば「元に戻す」で復元できます。</p>
              </div>
            </div>
            <div class="edit-dialog-actions">
              <button type="button" class="edit-dialog-cancel">キャンセル</button>
              <button type="button" class="delete-dialog-confirm">削除</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);

      const dialog = document.getElementById('bulk-confirm-dialog');
      const close = (result: boolean) => {
        // どの経路で閉じても ESC 用リスナーを確実に解除する (#100 リーク防止)
        document.removeEventListener('keydown', handleKey);
        dialog?.remove();
        resolve(result);
      };
      dialog
        ?.querySelector('.edit-dialog-close')
        ?.addEventListener('click', () => close(false));
      dialog
        ?.querySelector('.edit-dialog-cancel')
        ?.addEventListener('click', () => close(false));
      dialog
        ?.querySelector('.delete-dialog-confirm')
        ?.addEventListener('click', () => close(true));

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          close(false);
        }
      };
      document.addEventListener('keydown', handleKey);
    });
  }

  private async showMoveDialog(
    folders: ChromeBookmarkNode[],
    count: number
  ): Promise<string | null> {
    return new Promise((resolve) => {
      const existing = document.getElementById('bulk-move-dialog');
      existing?.remove();

      const folderOptions = folders
        .map((folder) => {
          const label = folder.title || `(ルート: ${folder.id})`;
          return `<option value="${escapeHtml(folder.id)}">${escapeHtml(label)}</option>`;
        })
        .join('');

      const html = `
        <div id="bulk-move-dialog" class="edit-dialog-overlay">
          <div class="edit-dialog">
            <div class="edit-dialog-header">
              <h3>${count} 件のブックマークを移動</h3>
              <button class="edit-dialog-close" type="button">×</button>
            </div>
            <div class="edit-dialog-content">
              <div class="edit-form-group">
                <label for="bulk-move-parent">移動先フォルダ:</label>
                <select id="bulk-move-parent">
                  ${folderOptions}
                </select>
              </div>
            </div>
            <div class="edit-dialog-actions">
              <button type="button" class="edit-dialog-cancel">キャンセル</button>
              <button type="button" class="edit-dialog-save bulk-move-confirm">移動</button>
            </div>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML('beforeend', html);

      const dialog = document.getElementById('bulk-move-dialog');
      const close = (result: string | null) => {
        // どの経路で閉じても ESC 用リスナーを確実に解除する (#100 リーク防止)
        document.removeEventListener('keydown', handleKey);
        dialog?.remove();
        resolve(result);
      };
      dialog
        ?.querySelector('.edit-dialog-close')
        ?.addEventListener('click', () => close(null));
      dialog
        ?.querySelector('.edit-dialog-cancel')
        ?.addEventListener('click', () => close(null));
      dialog
        ?.querySelector('.bulk-move-confirm')
        ?.addEventListener('click', () => {
          const select = document.getElementById(
            'bulk-move-parent'
          ) as HTMLSelectElement | null;
          close(select?.value ?? null);
        });

      const handleKey = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          close(null);
        }
      };
      document.addEventListener('keydown', handleKey);
    });
  }

  private async getAllFolders(): Promise<ChromeBookmarkNode[]> {
    const tree = await chrome.bookmarks.getTree();
    const folders: ChromeBookmarkNode[] = [];
    const collect = (nodes: ChromeBookmarkNode[]) => {
      for (const node of nodes) {
        if (node.children && !node.url) {
          // id='0' はツリーの仮想ルートで、ここへの move は Chrome API で
          // 必ず失敗するため移動先候補から除外する
          if (node.id !== '0') {
            folders.push(node);
          }
          collect(node.children);
        }
      }
    };
    collect(tree as ChromeBookmarkNode[]);
    return folders;
  }
}
