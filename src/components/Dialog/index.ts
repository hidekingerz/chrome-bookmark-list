import { escapeHtml } from '../../scripts/utils.js';

/**
 * モーダルダイアログの共通基盤。
 *
 * - overlay の生成、×・ESC・ボタンの配線、document の keydown リスナー解除を一手に担う
 *   (#100: どの経路で閉じてもリスナーを残さない)
 * - 同時に開くのは 1 つ。開く前に既存の overlay をすべて除去する
 * - Enter で確定する挙動は持たない。入力欄を持つ呼び出し側が input に keydown を付ける
 */

export interface DialogButton {
  label: string;
  /** ボタンに付与するクラス（既存テストが参照するクラス名をここで維持する） */
  className: string;
  /** クリック時。close を呼ばなければダイアログは開いたまま（バリデーション失敗時など） */
  onClick: (close: () => void) => void;
  /** 開いた直後にフォーカスするか */
  autofocus?: boolean;
}

export interface DialogOptions {
  /** overlay の id（既存テストが参照する id を維持する） */
  id: string;
  title: string;
  bodyHtml: string;
  buttons: DialogButton[];
  /** 閉じられたとき（×・ESC・ボタン・close() のどの経路でも 1 回だけ）呼ばれる */
  onClose?: () => void;
}

export interface DialogHandle {
  element: HTMLElement;
  close: () => void;
}

export function openDialog(options: DialogOptions): DialogHandle {
  for (const existing of document.querySelectorAll('.edit-dialog-overlay')) {
    existing.remove();
  }

  const buttonsHtml = options.buttons
    .map(
      (button, index) =>
        `<button type="button" class="${button.className}" data-dialog-button="${index}">${escapeHtml(button.label)}</button>`
    )
    .join('');

  document.body.insertAdjacentHTML(
    'beforeend',
    `
      <div id="${options.id}" class="edit-dialog-overlay">
        <div class="edit-dialog" role="dialog" aria-modal="true">
          <div class="edit-dialog-header">
            <h3>${escapeHtml(options.title)}</h3>
            <button class="edit-dialog-close" type="button">×</button>
          </div>
          <div class="edit-dialog-content">${options.bodyHtml}</div>
          <div class="edit-dialog-actions">${buttonsHtml}</div>
        </div>
      </div>
    `
  );

  const element = document.getElementById(options.id) as HTMLElement;
  let closed = false;

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKeydown);
    element.remove();
    options.onClose?.();
  };

  document.addEventListener('keydown', onKeydown);
  element
    .querySelector('.edit-dialog-close')
    ?.addEventListener('click', () => close());

  options.buttons.forEach((button, index) => {
    const el = element.querySelector<HTMLElement>(
      `[data-dialog-button="${index}"]`
    );
    el?.addEventListener('click', () => button.onClick(close));
    if (button.autofocus) el?.focus();
  });

  return { element, close };
}

/**
 * キャンセル / 確定の 2 ボタン確認ダイアログ。確定で true、それ以外で false。
 * 開いた直後はキャンセルにフォーカスする（誤操作防止 + a11y）。
 */
export function confirmDialog(options: {
  id: string;
  title: string;
  bodyHtml: string;
  confirmLabel: string;
  confirmClassName: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    let confirmed = false;
    openDialog({
      id: options.id,
      title: options.title,
      bodyHtml: options.bodyHtml,
      buttons: [
        {
          label: 'キャンセル',
          className: 'edit-dialog-cancel',
          autofocus: true,
          onClick: (close) => close(),
        },
        {
          label: options.confirmLabel,
          className: options.confirmClassName,
          onClick: (close) => {
            confirmed = true;
            close();
          },
        },
      ],
      onClose: () => resolve(confirmed),
    });
  });
}

/**
 * OK ボタンだけの通知ダイアログ。閉じられたら解決する。
 * OK ボタンのクラスは既存テストとの互換のため edit-dialog-cancel。
 */
export function alertDialog(options: {
  id: string;
  title: string;
  bodyHtml: string;
}): Promise<void> {
  return new Promise((resolve) => {
    openDialog({
      id: options.id,
      title: options.title,
      bodyHtml: options.bodyHtml,
      buttons: [
        {
          label: 'OK',
          className: 'edit-dialog-cancel',
          onClick: (close) => close(),
        },
      ],
      onClose: () => resolve(),
    });
  });
}

/**
 * bodyHtml 内の .dialog-error にエラーメッセージを表示する（ダイアログは開いたまま）。
 */
export function showDialogError(
  handle: DialogHandle | null,
  message: string
): void {
  const el = handle?.element.querySelector<HTMLElement>('.dialog-error');
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
}
