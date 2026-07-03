import { Window } from 'happy-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HtmlUtils } from '../src/utils/HtmlUtils';

// test/setup.ts はグローバル document を最小スタブで上書きしている
// (createElement('div') のみ対応で getAttribute/classList/style/querySelectorAll を持たない)。
// HtmlUtils は本物の DOM API に依存するため、このファイル内では happy-dom の実 DOM に差し替える。
const realWindow = new Window();
const realDocument = realWindow.document as unknown as Document;
let savedDocument: typeof globalThis.document;

beforeEach(() => {
  savedDocument = globalThis.document;
  globalThis.document = realDocument;
});

afterEach(() => {
  globalThis.document = savedDocument;
  realDocument.body.innerHTML = '';
});

const makeEvent = (type: string): Event =>
  new (realWindow.Event as unknown as typeof Event)(type);

describe('HtmlUtils', () => {
  describe('escapeHtml', () => {
    it('HTMLの特殊文字をエスケープする', () => {
      // #96: " も &quot; にエスケープされることを検証するよう assert を更新
      // (旧挙動は " を残していたが属性インジェクションの原因のため意図的に変更)。
      expect(HtmlUtils.escapeHtml('<script>alert("x")</script>')).toBe(
        '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;'
      );
    });

    it('アンパサンドをエスケープする', () => {
      expect(HtmlUtils.escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    // #96 再現テスト: 属性値に埋め込む文字 " ' がエスケープされないと
    // 属性インジェクション/属性値破壊が起きる。修正前はこれらが落ちる。
    it('ダブルクォートを &quot; にエスケープする (#96)', () => {
      expect(HtmlUtils.escapeHtml('Vue "Composition API" 入門')).toBe(
        'Vue &quot;Composition API&quot; 入門'
      );
    });

    it('シングルクォートを &#39; にエスケープする (#96)', () => {
      expect(HtmlUtils.escapeHtml("it's a test")).toBe('it&#39;s a test');
    });

    it('属性インジェクションを狙う URL をエスケープする (#96)', () => {
      expect(
        HtmlUtils.escapeHtml('https://a/"><img src="https://attacker/x')
      ).toBe('https://a/&quot;&gt;&lt;img src=&quot;https://attacker/x');
    });

    it('& を二重エスケープしない (順序保証)', () => {
      expect(HtmlUtils.escapeHtml('&quot;')).toBe('&amp;quot;');
    });

    it('特殊文字を含まない文字列はそのまま返す', () => {
      expect(HtmlUtils.escapeHtml('plain text')).toBe('plain text');
    });
  });

  describe('getDomain', () => {
    it('URLからホスト名を抽出する', () => {
      expect(HtmlUtils.getDomain('https://example.com/path?q=1')).toBe(
        'example.com'
      );
    });

    it('サブドメインを含むホスト名を抽出する', () => {
      expect(HtmlUtils.getDomain('https://www.sub.example.com/')).toBe(
        'www.sub.example.com'
      );
    });

    it('無効なURLの場合は localhost を返す', () => {
      expect(HtmlUtils.getDomain('not a url')).toBe('localhost');
    });
  });

  describe('createSafeHtml', () => {
    it('テンプレート関数の結果を返す', () => {
      expect(HtmlUtils.createSafeHtml(() => '<div>ok</div>')).toBe(
        '<div>ok</div>'
      );
    });

    it('テンプレート関数が例外を投げたらエラー用HTMLを返す', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = HtmlUtils.createSafeHtml(() => {
        throw new Error('boom');
      });
      expect(result).toBe(
        '<div class="error">コンテンツの生成に失敗しました</div>'
      );
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('toggleVisibility', () => {
    it('visible=true で表示し hidden クラスを外す', () => {
      const el = realDocument.createElement('div');
      el.classList.add('hidden');
      HtmlUtils.toggleVisibility(el, true);
      expect(el.style.display).toBe('block');
      expect(el.classList.contains('hidden')).toBe(false);
    });

    it('visible=false で非表示にし hidden クラスを付ける', () => {
      const el = realDocument.createElement('div');
      HtmlUtils.toggleVisibility(el, false);
      expect(el.style.display).toBe('none');
      expect(el.classList.contains('hidden')).toBe(true);
    });
  });

  describe('addEventListenerSafely', () => {
    it('要素が null の場合は false を返し警告する', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      expect(HtmlUtils.addEventListenerSafely(null, 'click', () => {})).toBe(
        false
      );
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('正常に追加できたら true を返しハンドラが呼ばれる', () => {
      const el = realDocument.createElement('button');
      const handler = vi.fn();
      expect(HtmlUtils.addEventListenerSafely(el, 'click', handler)).toBe(true);
      el.dispatchEvent(makeEvent('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('addEventListener が例外を投げたら false を返す', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const el = realDocument.createElement('div');
      vi.spyOn(el, 'addEventListener').mockImplementation(() => {
        throw new Error('fail');
      });
      expect(HtmlUtils.addEventListenerSafely(el, 'click', () => {})).toBe(
        false
      );
      expect(errorSpy).toHaveBeenCalled();
      errorSpy.mockRestore();
    });
  });

  describe('addEventListenerToAll', () => {
    it('セレクタに一致する全要素にリスナーを追加し成功数を返す', () => {
      realDocument.body.innerHTML =
        '<button class="t"></button><button class="t"></button>';
      const handler = vi.fn();
      const count = HtmlUtils.addEventListenerToAll('.t', 'click', handler);
      expect(count).toBe(2);
      for (const btn of realDocument.querySelectorAll('.t')) {
        btn.dispatchEvent(makeEvent('click'));
      }
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('一致する要素が無い場合は 0 を返す', () => {
      expect(HtmlUtils.addEventListenerToAll('.none', 'click', () => {})).toBe(
        0
      );
    });
  });

  describe('getDataAttribute', () => {
    it('要素が null の場合は null を返す', () => {
      expect(HtmlUtils.getDataAttribute(null, 'id')).toBeNull();
    });

    it('data 属性の値を返す', () => {
      const el = realDocument.createElement('div');
      el.setAttribute('data-id', '42');
      expect(HtmlUtils.getDataAttribute(el, 'id')).toBe('42');
    });

    it('属性が空文字の場合は null を返す', () => {
      const el = realDocument.createElement('div');
      el.setAttribute('data-id', '');
      expect(HtmlUtils.getDataAttribute(el, 'id')).toBeNull();
    });

    it('属性が存在しない場合は null を返す', () => {
      const el = realDocument.createElement('div');
      expect(HtmlUtils.getDataAttribute(el, 'missing')).toBeNull();
    });
  });

  describe('truncateText', () => {
    it('maxLength 以下の文字列はそのまま返す', () => {
      expect(HtmlUtils.truncateText('hello', 10)).toBe('hello');
    });

    it('maxLength を超える文字列は省略記号付きで切り詰める', () => {
      expect(HtmlUtils.truncateText('abcdefghij', 5)).toBe('ab...');
    });

    it('カスタム省略記号を使える', () => {
      expect(HtmlUtils.truncateText('abcdefghij', 6, '…')).toBe('abcde…');
    });
  });

  describe('isValidUrl', () => {
    it('有効なURLの場合は true を返す', () => {
      expect(HtmlUtils.isValidUrl('https://example.com')).toBe(true);
    });

    it('無効なURLの場合は false を返す', () => {
      expect(HtmlUtils.isValidUrl('not a url')).toBe(false);
    });
  });
});
