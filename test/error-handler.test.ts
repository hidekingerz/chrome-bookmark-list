import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorHandler } from '../src/services/ErrorHandler';

// ErrorHandler は alert / console / process.env.NODE_ENV に依存する。
// DOM には依存しないため setup.ts の document スタブのままで問題ない。
let alertMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  alertMock = vi.fn();
  vi.stubGlobal('alert', alertMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'time').mockImplementation(() => {});
  vi.spyOn(console, 'timeEnd').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ErrorHandler', () => {
  describe('handleBookmarkOperation', () => {
    it('エラーをconsole.errorに出力し、ユーザーへerror通知を表示する', () => {
      const error = new Error('何らかのエラー');
      ErrorHandler.handleBookmarkOperation(error, '削除', { id: '1' });

      expect(console.error).toHaveBeenCalledWith(
        'ブックマーク削除エラー:',
        error,
        { id: '1' }
      );
      expect(alertMock).toHaveBeenCalledWith(
        '❌ ブックマークの削除に失敗しました。'
      );
    });

    it('「見つかりません」を含むエラーは専用メッセージになる', () => {
      ErrorHandler.handleBookmarkOperation(
        new Error('対象が見つかりません'),
        '更新'
      );

      expect(alertMock).toHaveBeenCalledWith(
        '❌ 更新対象のブックマークが見つかりません。'
      );
    });

    it('「permissions」を含むエラーは権限メッセージになる', () => {
      ErrorHandler.handleBookmarkOperation(
        new Error('missing permissions'),
        '作成'
      );

      expect(alertMock).toHaveBeenCalledWith(
        '❌ 作成に必要な権限がありません。'
      );
    });

    it('「権限」を含むエラーも権限メッセージになる', () => {
      ErrorHandler.handleBookmarkOperation(
        new Error('権限がありません'),
        '作成'
      );

      expect(alertMock).toHaveBeenCalledWith(
        '❌ 作成に必要な権限がありません。'
      );
    });

    it('「network」を含むエラーはネットワークメッセージになる', () => {
      ErrorHandler.handleBookmarkOperation(new Error('network down'), '取得');

      expect(alertMock).toHaveBeenCalledWith(
        '❌ ネットワークエラーのため取得に失敗しました。'
      );
    });

    it('「fetch」を含むエラーもネットワークメッセージになる', () => {
      ErrorHandler.handleBookmarkOperation(new Error('fetch failed'), '取得');

      expect(alertMock).toHaveBeenCalledWith(
        '❌ ネットワークエラーのため取得に失敗しました。'
      );
    });
  });

  describe('handleFaviconError', () => {
    it('console.warnに出力し、ユーザーへは通知しない', () => {
      const error = new Error('favicon失敗');
      ErrorHandler.handleFaviconError(error, 'https://example.com');

      expect(console.warn).toHaveBeenCalledWith(
        'Favicon取得エラー:',
        'https://example.com',
        error
      );
      expect(alertMock).not.toHaveBeenCalled();
    });
  });

  describe('handleGenericError', () => {
    it('console.errorに出力し、error通知を表示する', () => {
      const error = new Error('予期しない');
      ErrorHandler.handleGenericError(error, 'コンテキスト');

      expect(console.error).toHaveBeenCalledWith(
        '予期しないエラー:',
        error,
        'コンテキスト'
      );
      expect(alertMock).toHaveBeenCalledWith(
        '❌ 予期しないエラーが発生しました。'
      );
    });

    it('contextなしでも動作する', () => {
      const error = new Error('予期しない');
      ErrorHandler.handleGenericError(error);

      expect(console.error).toHaveBeenCalledWith(
        '予期しないエラー:',
        error,
        undefined
      );
      expect(alertMock).toHaveBeenCalledWith(
        '❌ 予期しないエラーが発生しました。'
      );
    });
  });

  describe('debug / startTimer / endTimer (NODE_ENV依存)', () => {
    const savedEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = savedEnv;
    });

    it('development環境ではdebugログを出力する', () => {
      process.env.NODE_ENV = 'development';
      ErrorHandler.debug('テストメッセージ', { foo: 1 });

      expect(console.log).toHaveBeenCalledWith('🐛 DEBUG: テストメッセージ', {
        foo: 1,
      });
    });

    it('development以外ではdebugログを出力しない', () => {
      process.env.NODE_ENV = 'test';
      ErrorHandler.debug('テストメッセージ');

      expect(console.log).not.toHaveBeenCalled();
    });

    it('development環境ではタイマーを開始/終了する', () => {
      process.env.NODE_ENV = 'development';
      ErrorHandler.startTimer('label');
      ErrorHandler.endTimer('label');

      expect(console.time).toHaveBeenCalledWith('label');
      expect(console.timeEnd).toHaveBeenCalledWith('label');
    });

    it('development以外ではタイマーを呼ばない', () => {
      process.env.NODE_ENV = 'test';
      ErrorHandler.startTimer('label');
      ErrorHandler.endTimer('label');

      expect(console.time).not.toHaveBeenCalled();
      expect(console.timeEnd).not.toHaveBeenCalled();
    });
  });

  // #105-2: ErrorHandler は process.env.NODE_ENV を参照するが、この拡張は
  // バンドラ（define）を通さず tsc のみでビルドされるため、ブラウザ実行時に
  // グローバル `process` が存在せず debug/startTimer/endTimer が ReferenceError を
  // 投げる潜在バグがある。process 未定義でも例外を投げないことを検証する。
  describe('ブラウザ環境（process 未定義）でも例外を投げない (#105)', () => {
    it('process が未定義でも debug は例外を投げずログも出さない', () => {
      vi.stubGlobal('process', undefined);

      expect(() => ErrorHandler.debug('メッセージ', { foo: 1 })).not.toThrow();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('process が未定義でも startTimer/endTimer は例外を投げない', () => {
      vi.stubGlobal('process', undefined);

      expect(() => {
        ErrorHandler.startTimer('label');
        ErrorHandler.endTimer('label');
      }).not.toThrow();
      expect(console.time).not.toHaveBeenCalled();
      expect(console.timeEnd).not.toHaveBeenCalled();
    });
  });
});
