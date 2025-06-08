import { JSDOM } from 'jsdom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderFolder, setupFolderClickHandler } from '../src/scripts/newtab-core'
import type { BookmarkFolder } from '../src/scripts/types'
import { processBookmarkTree } from '../src/scripts/utils'

describe('3層構造フォルダの問題を検証', () => {
  let dom: JSDOM
  let container: HTMLElement
  let allBookmarks: BookmarkFolder[]

  beforeEach(() => {
    // モック3層構造データ
    const mock3LayerData = [
      {
        id: '0',
        title: 'root',
        children: [
          {
            id: '1', 
            title: 'Bookmarks Bar',
            children: [
              {
                id: 'level1-1',
                title: 'Level1 Parent Folder',
                children: [
                  {
                    id: 'level2-1',
                    title: 'Level2 Child Folder',
                    children: [
                      {
                        id: 'level3-1',
                        title: 'Level3 Grandchild Folder',
                        children: [
                          {
                            id: 'bookmark1',
                            title: 'Deep Bookmark',
                            url: 'https://example.com'
                          }
                        ]
                      },
                      {
                        id: 'bookmark2',
                        title: 'Level2 Bookmark',
                        url: 'https://level2.com'
                      }
                    ]
                  },
                  {
                    id: 'bookmark3',
                    title: 'Level1 Bookmark',
                    url: 'https://level1.com'
                  }
                ]
              }
            ]
          }
        ]
      }
    ]

    // processBookmarkTreeでデータを処理
    allBookmarks = processBookmarkTree(mock3LayerData)
    
    // DOM環境をセットアップ
    dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div></body></html>')
    global.window = dom.window as any
    global.document = dom.window.document
    
    container = document.getElementById('container') as HTMLElement
    
    // Chrome API モック
    global.chrome = {
      tabs: {
        create: vi.fn()
      }
    } as any
  })

  it('3層構造の初期展開状態が正しいことを確認', () => {
    expect(allBookmarks).toHaveLength(1)
    
    const level1Folder = allBookmarks[0]
    expect(level1Folder.title).toBe('Level1 Parent Folder')
    expect(level1Folder.expanded).toBe(true) // level 0 → expanded: true
    expect(level1Folder.subfolders).toHaveLength(1)
    
    const level2Folder = level1Folder.subfolders[0]
    expect(level2Folder.title).toBe('Level2 Child Folder')
    expect(level2Folder.expanded).toBe(true) // level 1 → expanded: true
    expect(level2Folder.subfolders).toHaveLength(1)
    
    const level3Folder = level2Folder.subfolders[0]
    expect(level3Folder.title).toBe('Level3 Grandchild Folder')
    expect(level3Folder.expanded).toBe(true) // すべての階層を初期展開に変更
    expect(level3Folder.bookmarks).toHaveLength(1)
  })

  it('3層構造のHTMLレンダリングが正しいことを確認', () => {
    const html = allBookmarks.map(folder => renderFolder(folder, 0)).join('')
    container.innerHTML = html
    
    // Level1フォルダの確認
    const level1Element = container.querySelector('[data-folder-id="level1-1"]') as HTMLElement
    expect(level1Element).toBeTruthy()
    expect(level1Element.getAttribute('data-level')).toBe('0')
    
    // Level1の subfolders-container が展開されていることを確認
    const level1Container = level1Element.querySelector('.subfolders-container') as HTMLElement
    expect(level1Container).toBeTruthy()
    expect(level1Container.classList.contains('expanded')).toBe(true)
    expect(level1Container.style.display).toBe('block')
    
    // Level2フォルダの確認
    const level2Element = container.querySelector('[data-folder-id="level2-1"]') as HTMLElement
    expect(level2Element).toBeTruthy()
    expect(level2Element.getAttribute('data-level')).toBe('1')
    
    // Level2の subfolders-container が展開されていることを確認
    const level2Container = level2Element.querySelector('.subfolders-container') as HTMLElement
    expect(level2Container).toBeTruthy()
    expect(level2Container.classList.contains('expanded')).toBe(true)
    expect(level2Container.style.display).toBe('block')
    
    // Level3フォルダの確認
    const level3Element = container.querySelector('[data-folder-id="level3-1"]') as HTMLElement
    expect(level3Element).toBeTruthy()
    expect(level3Element.getAttribute('data-level')).toBe('2')
    
    // Level3は展開されていることを確認（ブックマークリストが展開されている）
    const level3BookmarkList = level3Element.querySelector('.bookmark-list') as HTMLElement
    expect(level3BookmarkList).toBeTruthy()
    expect(level3BookmarkList.classList.contains('expanded')).toBe(true)
    expect(level3BookmarkList.style.display).toBe('block')
  })

  it('1層目フォルダクリックで2層目以降が消える問題を検証', () => {
    // HTMLをレンダリング
    const html = allBookmarks.map(folder => renderFolder(folder, 0)).join('')
    container.innerHTML = html
    
    // イベントハンドラーを設定
    setupFolderClickHandler(container, allBookmarks)
    
    // 初期状態の確認
    const level2Element = container.querySelector('[data-folder-id="level2-1"]') as HTMLElement
    const level3Element = container.querySelector('[data-folder-id="level3-1"]') as HTMLElement
    expect(level2Element).toBeTruthy()
    expect(level3Element).toBeTruthy()
    
    // 1層目フォルダヘッダーをクリック（折りたたみ）
    const level1Header = container.querySelector('[data-folder-id="level1-1"] .folder-header') as HTMLElement
    expect(level1Header).toBeTruthy()
    
    level1Header.click()
    
    // 問題: 2層目以降のフォルダが消えるはず（正常動作）
    // しかし、サブフォルダなしの場合はpreserve-visibleで保持される
    // Level2はサブフォルダありなので消えるはず
    expect(allBookmarks[0].expanded).toBe(false)
    expect(level2Element.style.display).toBe('none') // これが問題？
    
    // 再度クリックして展開
    level1Header.click()
    
    expect(allBookmarks[0].expanded).toBe(true)
    expect(level2Element.style.display).toBe('block')
  })

  it('2層目フォルダクリックで3層目が折りたたまれるが2層目は折りたたまれない問題を検証', () => {
    // HTMLをレンダリング
    const html = allBookmarks.map(folder => renderFolder(folder, 0)).join('')
    container.innerHTML = html
    
    // イベントハンドラーを設定
    setupFolderClickHandler(container, allBookmarks)
    
    // 2層目フォルダヘッダーをクリック
    const level2Header = container.querySelector('[data-folder-id="level2-1"] .folder-header') as HTMLElement
    expect(level2Header).toBeTruthy()
    
    const level2Folder = allBookmarks[0].subfolders[0]
    const level3Element = container.querySelector('[data-folder-id="level3-1"]') as HTMLElement
    
    level2Header.click()
    
    // 期待動作: Level2が折りたたまれ、Level3も非表示になる
    expect(level2Folder.expanded).toBe(false)
    expect(level3Element.style.display).toBe('none')
  })
})
