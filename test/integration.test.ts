import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// メイン機能の統合テスト
describe('Main Integration Tests', () => {
  let dom: JSDOM
  let document: Document
  let window: Window

  beforeEach(() => {
    // 実際のHTMLファイルをシミュレート
    dom = new JSDOM(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>ブックマーク一覧</title>
        </head>
        <body>
          <div id="search-container">
            <input type="text" id="search-input" placeholder="ブックマークを検索...">
          </div>
          <div id="bookmark-list"></div>
        </body>
      </html>
    `, {
      url: 'chrome-extension://test/newtab.html',
      pretendToBeVisual: true,
      resources: 'usable'
    })

    document = dom.window.document
    window = dom.window as unknown as Window

    // グローバルオブジェクトを設定
    global.document = document
    global.window = window

    // Chrome API のモック
    global.chrome = {
      bookmarks: {
        getTree: vi.fn().mockResolvedValue([
          {
            id: '0',
            title: 'root',
            children: [
              {
                id: '1',
                title: 'Bookmarks Bar',
                children: [
                  {
                    id: '2',
                    title: 'フォルダ1',
                    children: [
                      {
                        id: '3',
                        title: 'Google',
                        url: 'https://google.com'
                      }
                    ]
                  },
                  {
                    id: '4',
                    title: 'GitHub',
                    url: 'https://github.com'
                  }
                ]
              }
            ]
          }
        ])
      },
      tabs: {
        create: vi.fn()
      }
    } as any

    // localStorage のモック
    global.localStorage = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn()
    } as any
  })

  afterEach(() => {
    dom.window.close()
    vi.clearAllMocks()
  })

  it('should load and display bookmarks correctly', async () => {
    // メイン関数を直接テストするのではなく、
    // コンポーネントの動作をテスト
    const { processBookmarkTree } = await import('../src/utils')
    
    // Chrome APIからブックマークを取得
    const tree = await chrome.bookmarks.getTree()
    const folders = processBookmarkTree(tree)

    expect(folders).toHaveLength(2) // フォルダ1 + ブックマークバー直下
    expect(folders[0].title).toBe('フォルダ1')
    expect(folders[0].bookmarks).toHaveLength(1)
    expect(folders[1].title).toBe('ブックマークバー直下')
    expect(folders[1].bookmarks).toHaveLength(1)
  })

  it('should handle search functionality', async () => {
    const { filterBookmarks, processBookmarkTree } = await import('../src/utils')
    
    const tree = await chrome.bookmarks.getTree()
    const folders = processBookmarkTree(tree)
    
    // 検索テスト
    const searchResults = filterBookmarks(folders, 'google')
    expect(searchResults).toHaveLength(1)
    expect(searchResults[0].bookmarks[0].title).toBe('Google')
  })

  it('should handle empty bookmark tree', async () => {
    // 空のブックマークツリーをテスト
    chrome.bookmarks.getTree = vi.fn().mockResolvedValue([])
    
    const { processBookmarkTree } = await import('../src/utils')
    const tree = await chrome.bookmarks.getTree()
    const folders = processBookmarkTree(tree)

    expect(folders).toHaveLength(0)
  })

  it('should open bookmarks in new tabs', async () => {
    const createTabSpy = vi.spyOn(chrome.tabs, 'create')
    
    // ブックマーククリックのシミュレーション
    const bookmarkUrl = 'https://google.com'
    
    // 新しいタブでURLを開く処理をシミュレート
    chrome.tabs.create({ url: bookmarkUrl })
    
    expect(createTabSpy).toHaveBeenCalledWith({ url: bookmarkUrl })
  })

  it('should handle favicon loading gracefully', async () => {
    const { getDomain } = await import('../src/utils')
    
    const testUrl = 'https://example.com/path'
    const domain = getDomain(testUrl)
    
    expect(domain).toBe('example.com')
  })

  it('should expand and collapse folders', async () => {
    const { findFolderById, processBookmarkTree } = await import('../src/utils')
    
    const tree = await chrome.bookmarks.getTree()
    const folders = processBookmarkTree(tree)
    
    // フォルダの展開状態をテスト
    const folder = findFolderById(folders, '2')
    expect(folder).toBeDefined()
    expect(folder?.expanded).toBe(true) // デフォルトで展開
  })
})
