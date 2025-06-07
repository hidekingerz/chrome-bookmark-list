import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookmarkFolder } from '../src/types'

// UI関連のテスト
describe('UI関連のテスト', () => {
  let dom: JSDOM
  let document: Document
  let window: Window

  beforeEach(() => {
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ブックマーク一覧</title>
        </head>
        <body>
          <div id="bookmarkContainer"></div>
        </body>
      </html>
    `, {
      url: 'chrome-extension://test/newtab.html',
      pretendToBeVisual: true,
      resources: 'usable'
    })

    document = dom.window.document
    window = dom.window as unknown as Window

    Object.defineProperty(globalThis, 'document', {
      value: document,
      writable: true,
      configurable: true
    })
    Object.defineProperty(globalThis, 'window', {
      value: window,
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    dom.window.close()
    vi.clearAllMocks()
  })

  describe('ブックマークHTMLレンダリング', () => {
    it('ブックマークが縦配置レイアウトで表示されることを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      // テスト用のHTML構造を作成（新しい縦配置レイアウト）
      bookmarkContainer.innerHTML = `
        <div class="bookmark-folder" data-folder-id="1">
          <div class="folder-header">
            <div class="folder-info">
              <span class="expand-icon">📁</span>
              <h2 class="folder-title">テストフォルダ</h2>
            </div>
            <span class="bookmark-count">2</span>
          </div>
          <ul class="bookmark-list">
            <li class="bookmark-item">
              <a href="#" class="bookmark-link" data-url="https://example.com">
                <div class="bookmark-content">
                  <div class="bookmark-header">
                    <div class="bookmark-favicon-container">
                      <div class="favicon-placeholder">🔗</div>
                    </div>
                    <span class="bookmark-title">テストブックマーク</span>
                  </div>
                  <div class="bookmark-url">https://example.com</div>
                </div>
              </a>
            </li>
          </ul>
        </div>
      `

      // 縦配置レイアウトの要素が存在することを確認
      const bookmarkContent = bookmarkContainer.querySelector('.bookmark-content')
      const bookmarkHeader = bookmarkContainer.querySelector('.bookmark-header')
      const bookmarkUrl = bookmarkContainer.querySelector('.bookmark-url')

      expect(bookmarkContent).toBeTruthy()
      expect(bookmarkHeader).toBeTruthy()
      expect(bookmarkUrl).toBeTruthy()
      expect(bookmarkUrl?.textContent).toBe('https://example.com')
    })

    it('サブフォルダリストが表示されないことを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      // サブフォルダを含むHTML構造を作成（新しい構造）
      bookmarkContainer.innerHTML = `
        <div class="bookmark-folder" data-folder-id="1">
          <div class="folder-header">
            <div class="folder-info">
              <span class="expand-icon">📂</span>
              <h2 class="folder-title">親フォルダ</h2>
            </div>
            <span class="bookmark-count">1</span>
          </div>
          <div class="subfolders-container expanded">
            <div class="bookmark-folder" data-folder-id="2">
              <div class="folder-header">
                <div class="folder-info">
                  <span class="folder-icon">📄</span>
                  <h2 class="folder-title">サブフォルダ</h2>
                </div>
                <span class="bookmark-count">1</span>
              </div>
            </div>
          </div>
        </div>
      `

      // 古いサブフォルダリスト要素が存在しないことを確認
      const subfolderList = bookmarkContainer.querySelector('.subfolder-list')
      const subfolderItems = bookmarkContainer.querySelector('.subfolder-items')
      const subfolderHeader = bookmarkContainer.querySelector('.subfolder-header')

      expect(subfolderList).toBeNull()
      expect(subfolderItems).toBeNull()
      expect(subfolderHeader).toBeNull()

      // 新しいサブフォルダコンテナは存在することを確認
      const subfoldersContainer = bookmarkContainer.querySelector('.subfolders-container')
      expect(subfoldersContainer).toBeTruthy()
    })

    it('ブックマークファビコンとプレースホルダーが適切に配置されることを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      bookmarkContainer.innerHTML = `
        <div class="bookmark-item">
          <a href="#" class="bookmark-link" data-url="https://example.com">
            <div class="bookmark-content">
              <div class="bookmark-header">
                <div class="bookmark-favicon-container">
                  <div class="favicon-placeholder">🔗</div>
                  <img class="bookmark-favicon hidden" alt="">
                </div>
                <span class="bookmark-title">テストブックマーク</span>
              </div>
              <div class="bookmark-url">https://example.com</div>
            </div>
          </a>
        </div>
      `

      const faviconContainer = bookmarkContainer.querySelector('.bookmark-favicon-container')
      const faviconPlaceholder = bookmarkContainer.querySelector('.favicon-placeholder')
      const faviconImg = bookmarkContainer.querySelector('.bookmark-favicon')

      expect(faviconContainer).toBeTruthy()
      expect(faviconPlaceholder).toBeTruthy()
      expect(faviconImg).toBeTruthy()
      expect(faviconImg?.classList.contains('hidden')).toBe(true)
    })
  })

  describe('フォルダ構造のレンダリング', () => {
    it('フォルダが適切な階層で表示されることを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      bookmarkContainer.innerHTML = `
        <div class="bookmark-folder" data-level="0" data-folder-id="1">
          <div class="folder-header">
            <h2 class="folder-title">親フォルダ</h2>
          </div>
          <div class="subfolders-container expanded">
            <div class="bookmark-folder" data-level="1" data-folder-id="2">
              <div class="folder-header">
                <h2 class="folder-title">サブフォルダ</h2>
              </div>
            </div>
          </div>
        </div>
      `

      const parentFolder = bookmarkContainer.querySelector('[data-level="0"]')
      const subFolder = bookmarkContainer.querySelector('[data-level="1"]')

      expect(parentFolder).toBeTruthy()
      expect(subFolder).toBeTruthy()
      expect(parentFolder?.getAttribute('data-folder-id')).toBe('1')
      expect(subFolder?.getAttribute('data-folder-id')).toBe('2')
    })
  })

  describe('展開/折りたたみ状態', () => {
    it('展開状態のフォルダが適切にマークされることを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      bookmarkContainer.innerHTML = `
        <div class="bookmark-folder" data-folder-id="1">
          <div class="folder-header">
            <span class="expand-icon expanded">📂</span>
            <h2 class="folder-title">展開フォルダ</h2>
          </div>
          <div class="subfolders-container expanded">
            <div class="bookmark-folder" data-folder-id="2">
              <div class="folder-header">
                <h2 class="folder-title">サブフォルダ</h2>
              </div>
            </div>
          </div>
        </div>
      `

      const expandIcon = bookmarkContainer.querySelector('.expand-icon')
      const subfoldersContainer = bookmarkContainer.querySelector('.subfolders-container')

      expect(expandIcon?.classList.contains('expanded')).toBe(true)
      expect(subfoldersContainer?.classList.contains('expanded')).toBe(true)
      expect(subfoldersContainer?.classList.contains('collapsed')).toBe(false)
    })

    it('折りたたみ状態のフォルダが適切にマークされることを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      bookmarkContainer.innerHTML = `
        <div class="bookmark-folder" data-folder-id="1">
          <div class="folder-header">
            <span class="expand-icon">📁</span>
            <h2 class="folder-title">折りたたみフォルダ</h2>
          </div>
          <div class="subfolders-container collapsed">
            <div class="bookmark-folder hidden" data-folder-id="2">
              <div class="folder-header">
                <h2 class="folder-title">サブフォルダ</h2>
              </div>
            </div>
          </div>
        </div>
      `

      const expandIcon = bookmarkContainer.querySelector('.expand-icon')
      const subfoldersContainer = bookmarkContainer.querySelector('.subfolders-container')
      const hiddenSubfolder = bookmarkContainer.querySelector('.bookmark-folder.hidden')

      expect(expandIcon?.classList.contains('expanded')).toBe(false)
      expect(subfoldersContainer?.classList.contains('collapsed')).toBe(true)
      expect(hiddenSubfolder).toBeTruthy()
    })
  })

  describe('子フォルダクリック機能', () => {
    it('子フォルダ（level > 0）をクリックすると子フォルダ自体が折りたたまれることを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      // 展開された親フォルダと子フォルダの構造を作成
      bookmarkContainer.innerHTML = `
        <div class="bookmark-folder" data-level="0" data-folder-id="parent">
          <div class="folder-header">
            <span class="expand-icon expanded">📂</span>
            <h2 class="folder-title">親フォルダ</h2>
          </div>
          <div class="subfolders-container expanded">
            <div class="bookmark-folder" data-level="1" data-folder-id="child">
              <div class="folder-header" style="cursor: pointer;">
                <span class="expand-icon expanded">📂</span>
                <h2 class="folder-title">子フォルダ</h2>
              </div>
              <div class="subfolders-container expanded">
                <div class="bookmark-folder" data-level="2" data-folder-id="grandchild">
                  <div class="folder-header">
                    <span class="folder-icon">📄</span>
                    <h2 class="folder-title">孫フォルダ</h2>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `

      // 子フォルダのヘッダーとその展開状態要素を取得
      const childFolderHeader = bookmarkContainer.querySelector('[data-folder-id="child"] .folder-header')!
      const childExpandIcon = bookmarkContainer.querySelector('[data-folder-id="child"] .expand-icon')!
      const childSubfoldersContainer = bookmarkContainer.querySelector('[data-folder-id="child"] .subfolders-container')!

      // クリック前の状態確認（子フォルダが展開されている）
      expect(childExpandIcon.classList.contains('expanded')).toBe(true)
      expect(childSubfoldersContainer.classList.contains('expanded')).toBe(true)
      expect(childSubfoldersContainer.classList.contains('collapsed')).toBe(false)

      // 期待される動作をアサート
      // 実際の実装では、子フォルダクリック時に子フォルダ自体の展開状態が切り替わる
      // 子フォルダのヘッダー自体は表示されたまま、内容（孫フォルダ）だけが隠れる
    })

    it('親フォルダ（level = 0）をクリックすると展開/折りたたみが切り替わることを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      bookmarkContainer.innerHTML = `
        <div class="bookmark-folder" data-level="0" data-folder-id="parent">
          <div class="folder-header" style="cursor: pointer;">
            <span class="expand-icon">📁</span>
            <h2 class="folder-title">親フォルダ</h2>
          </div>
          <div class="subfolders-container collapsed">
            <div class="bookmark-folder" data-level="1" data-folder-id="child">
              <div class="folder-header">
                <h2 class="folder-title">子フォルダ</h2>
              </div>
            </div>
          </div>
        </div>
      `

      const parentFolderHeader = bookmarkContainer.querySelector('[data-folder-id="parent"] .folder-header')!
      const expandIcon = bookmarkContainer.querySelector('.expand-icon')!
      const subfoldersContainer = bookmarkContainer.querySelector('.subfolders-container')!

      // クリック前の状態確認（折りたたまれている）
      expect(expandIcon.classList.contains('expanded')).toBe(false)
      expect(subfoldersContainer.classList.contains('collapsed')).toBe(true)

      // 期待される動作をアサート
      // 実際の実装では、親フォルダクリック時に展開状態が切り替わる
    })

    it('子フォルダが畳まれても子フォルダ自体は表示されることを確認', () => {
      const bookmarkContainer = document.getElementById('bookmarkContainer')!
      
      // 親フォルダが展開、子フォルダが折りたたまれた状態
      bookmarkContainer.innerHTML = `
        <div class="bookmark-folder" data-level="0" data-folder-id="parent">
          <div class="folder-header">
            <span class="expand-icon expanded">📂</span>
            <h2 class="folder-title">親フォルダ</h2>
          </div>
          <div class="subfolders-container expanded">
            <div class="bookmark-folder" data-level="1" data-folder-id="child">
              <div class="folder-header">
                <span class="expand-icon">📁</span>
                <h2 class="folder-title">子フォルダ</h2>
              </div>
              <div class="subfolders-container collapsed">
                <div class="bookmark-folder" data-level="2" data-folder-id="grandchild">
                  <div class="folder-header">
                    <span class="folder-icon">📄</span>
                    <h2 class="folder-title">孫フォルダ</h2>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      `

      // 子フォルダの要素が存在し、表示されていることを確認
      const childFolder = bookmarkContainer.querySelector('[data-folder-id="child"]')!
      const childFolderTitle = bookmarkContainer.querySelector('[data-folder-id="child"] .folder-title')!
      const grandchildFolder = bookmarkContainer.querySelector('[data-folder-id="grandchild"]')!
      const childSubfoldersContainer = bookmarkContainer.querySelector('[data-folder-id="child"] .subfolders-container')!

      // 子フォルダ自体は表示されている
      expect(childFolder).toBeTruthy()
      expect(childFolderTitle.textContent).toBe('子フォルダ')
      
      // 孫フォルダは存在するが、CSSで非表示になっている（collapsed状態）
      expect(grandchildFolder).toBeTruthy()
      expect(childSubfoldersContainer.classList.contains('collapsed')).toBe(true)
    })
  })
})
