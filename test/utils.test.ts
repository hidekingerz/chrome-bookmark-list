import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BookmarkFolder, ChromeBookmarkNode } from '../src/types'
import {
  escapeHtml,
  FAVICON_CACHE_KEY,
  faviconCache,
  filterBookmarks,
  findFolderById,
  getDomain,
  getTotalBookmarks,
  processBookmarkTree,
  saveFaviconCache
} from '../src/utils'

describe('ユーティリティ関数', () => {
  beforeEach(() => {
    // 各テスト前にキャッシュをクリア
    faviconCache.clear()
    vi.clearAllMocks()
  })

  describe('processBookmarkTree', () => {
    it('ブックマークツリーが正しく処理されることを確認', () => {
      const mockTree: ChromeBookmarkNode[] = [
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
                    },
                    {
                      id: '4',
                      title: 'サブフォルダ',
                      children: [
                        {
                          id: '5',
                          title: 'GitHub',
                          url: 'https://github.com'
                        }
                      ]
                    }
                  ]
                },
                {
                  id: '6',
                  title: 'Yahoo',
                  url: 'https://yahoo.com'
                }
              ]
            }
          ]
        }
      ]

      const result = processBookmarkTree(mockTree)
      
      expect(result).toHaveLength(2) // フォルダ1 + ブックマークバー直下
      expect(result[0].title).toBe('フォルダ1')
      expect(result[0].bookmarks).toHaveLength(1)
      expect(result[0].bookmarks[0].title).toBe('Google')
      expect(result[0].subfolders).toHaveLength(1)
      expect(result[0].subfolders[0].title).toBe('サブフォルダ')
      expect(result[1].title).toBe('ブックマークバー直下')
      expect(result[1].bookmarks[0].title).toBe('Yahoo')
    })

    it('空のツリーを正しく処理することを確認', () => {
      const result = processBookmarkTree([])
      expect(result).toHaveLength(0)
    })
  })

  describe('findFolderById', () => {
    const mockFolders: BookmarkFolder[] = [
      {
        id: '1',
        title: 'Folder 1',
        bookmarks: [],
        subfolders: [
          {
            id: '2',
            title: 'Subfolder',
            bookmarks: [],
            subfolders: [],
            expanded: true
          }
        ],
        expanded: true
      }
    ]

    it('ルートレベルでフォルダをIDで検索できることを確認', () => {
      const result = findFolderById(mockFolders, '1')
      expect(result).toBeDefined()
      expect(result?.title).toBe('Folder 1')
    })

    it('サブフォルダ内でフォルダをIDで検索できることを確認', () => {
      const result = findFolderById(mockFolders, '2')
      expect(result).toBeDefined()
      expect(result?.title).toBe('Subfolder')
    })

    it('存在しないIDに対してnullを返すことを確認', () => {
      const result = findFolderById(mockFolders, '999')
      expect(result).toBeNull()
    })
  })

  describe('getTotalBookmarks', () => {
    it('ブックマークを再帰的に数えることを確認', () => {
      const folder: BookmarkFolder = {
        id: '1',
        title: 'Test Folder',
        bookmarks: [
          { title: 'Bookmark 1', url: 'https://example1.com', favicon: null },
          { title: 'Bookmark 2', url: 'https://example2.com', favicon: null }
        ],
        subfolders: [
          {
            id: '2',
            title: 'Subfolder',
            bookmarks: [
              { title: 'Bookmark 3', url: 'https://example3.com', favicon: null }
            ],
            subfolders: [],
            expanded: true
          }
        ],
        expanded: true
      }

      const result = getTotalBookmarks(folder)
      expect(result).toBe(3) // 2 + 1
    })

    it('空のフォルダに対して0を返すことを確認', () => {
      const folder: BookmarkFolder = {
        id: '1',
        title: 'Empty Folder',
        bookmarks: [],
        subfolders: [],
        expanded: true
      }

      const result = getTotalBookmarks(folder)
      expect(result).toBe(0)
    })
  })

  describe('filterBookmarks', () => {
    const mockFolders: BookmarkFolder[] = [
      {
        id: '1',
        title: 'Folder 1',
        bookmarks: [
          { title: 'Google Search', url: 'https://google.com', favicon: null },
          { title: 'Yahoo Japan', url: 'https://yahoo.co.jp', favicon: null }
        ],
        subfolders: [],
        expanded: false
      }
    ]

    it('タイトルでブックマークをフィルタリングできることを確認', () => {
      const result = filterBookmarks(mockFolders, 'google')
      expect(result).toHaveLength(1)
      expect(result[0].bookmarks).toHaveLength(1)
      expect(result[0].bookmarks[0].title).toBe('Google Search')
      expect(result[0].expanded).toBe(true) // 検索時は自動展開
    })

    it('URLでブックマークをフィルタリングできることを確認', () => {
      const result = filterBookmarks(mockFolders, 'yahoo.co.jp')
      expect(result).toHaveLength(1)
      expect(result[0].bookmarks).toHaveLength(1)
      expect(result[0].bookmarks[0].title).toBe('Yahoo Japan')
    })

    it('検索語が空の場合は全フォルダを返すことを確認', () => {
      const result = filterBookmarks(mockFolders, '')
      expect(result).toEqual(mockFolders)
    })

    it('マッチしない場合は空配列を返すことを確認', () => {
      const result = filterBookmarks(mockFolders, 'nonexistent')
      expect(result).toHaveLength(0)
    })
  })

  describe('escapeHtml', () => {
    it('HTML特殊文字がエスケープされることを確認', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;')
      expect(escapeHtml('A & B')).toBe('A &amp; B')
      expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;')
    })

    it('通常のテキストはエスケープせずに処理されることを確認', () => {
      expect(escapeHtml('Normal text')).toBe('Normal text')
    })
  })

  describe('getDomain', () => {
    it('URLからドメインを抽出できることを確認', () => {
      expect(getDomain('https://www.example.com/path')).toBe('www.example.com')
      expect(getDomain('http://google.com')).toBe('google.com')
      expect(getDomain('https://sub.domain.co.jp/page?param=value')).toBe('sub.domain.co.jp')
    })

    it('無効なURLに対して元の文字列を返すことを確認', () => {
      expect(getDomain('invalid-url')).toBe('invalid-url')
      expect(getDomain('')).toBe('')
    })
  })

  describe('saveFaviconCache', () => {
    it('ファビコンキャッシュがlocalStorageに保存されることを確認', () => {
      const mockSetItem = vi.fn()
      Object.defineProperty(globalThis, 'localStorage', {
        value: { setItem: mockSetItem },
        writable: true
      })

      faviconCache.set('https://example.com', 'favicon-url')
      
      saveFaviconCache()

      expect(mockSetItem).toHaveBeenCalledWith(
        FAVICON_CACHE_KEY,
        expect.stringContaining('https://example.com')
      )
    })

    it('localStorageエラーが適切に処理されることを確認', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      
      Object.defineProperty(globalThis, 'localStorage', {
        value: {
          setItem: vi.fn().mockImplementation(() => {
            throw new Error('Storage quota exceeded')
          })
        },
        writable: true
      })

      faviconCache.set('https://example.com', 'favicon-url')
      
      expect(() => saveFaviconCache()).not.toThrow()
      expect(consoleErrorSpy).toHaveBeenCalled()
      
      consoleErrorSpy.mockRestore()
    })
  })
})
