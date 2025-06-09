// テスト環境のセットアップ
import { vi } from 'vitest';

// Chrome API のモック
const mockChrome = {
  bookmarks: {
    getTree: vi.fn(),
    get: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
  tabs: {
    create: vi.fn(),
    query: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
  },
};

// グローバルオブジェクトにChromeをモック
Object.defineProperty(globalThis, 'chrome', {
  value: mockChrome,
  writable: true,
});

// localStorage のモック
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// DOM のモック
Object.defineProperty(globalThis, 'Image', {
  value: class MockImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    src = '';

    constructor() {
      setTimeout(() => {
        if (this.onload) {
          this.onload();
        }
      }, 0);
    }
  },
  writable: true,
});

// document のモック
Object.defineProperty(globalThis, 'document', {
  value: {
    createElement: vi.fn().mockImplementation((tagName: string) => {
      if (tagName === 'div') {
        return {
          textContent: '',
          get innerHTML() {
            // HTMLエスケープのシンプルな実装
            return this.textContent
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
          },
        };
      }
      return {};
    }),
  },
  writable: true,
});

// URL のモック（Node.js環境で利用可能）
if (typeof URL === 'undefined') {
  Object.defineProperty(globalThis, 'URL', {
    value: class MockURL {
      hostname: string;

      constructor(url: string) {
        const match = url.match(/https?:\/\/([^\/]+)/);
        this.hostname = match ? match[1] : 'localhost';
      }
    },
    writable: true,
  });
}
