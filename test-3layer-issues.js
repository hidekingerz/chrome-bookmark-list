// 3層構造のフォルダ問題をデバッグするための手動テストファイル

const mockData = {
  "3layer": [
    {
      "id": "0",
      "title": "root",
      "children": [
        {
          "id": "1",
          "title": "Bookmarks Bar",
          "children": [
            {
              "id": "level1-1",
              "title": "Level1 Parent Folder",
              "children": [
                {
                  "id": "level2-1",
                  "title": "Level2 Child Folder",  
                  "children": [
                    {
                      "id": "level3-1",
                      "title": "Level3 Grandchild Folder",
                      "children": [
                        {
                          "id": "bookmark1",
                          "title": "Deep Bookmark",
                          "url": "https://example.com"
                        }
                      ]
                    },
                    {
                      "id": "bookmark2", 
                      "title": "Level2 Bookmark",
                      "url": "https://level2.com"
                    }
                  ]
                },
                {
                  "id": "bookmark3",
                  "title": "Level1 Bookmark", 
                  "url": "https://level1.com"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
};

// 期待される構造:
// Level1 Parent Folder (expanded: true - level 0)
//   ├── Level2 Child Folder (expanded: true - level 1) 
//   │   ├── Level3 Grandchild Folder (expanded: false - level 2) ← ここが問題
//   │   │   └── Deep Bookmark
//   │   └── Level2 Bookmark
//   └── Level1 Bookmark

console.log('3層構造テストデータ:', JSON.stringify(mockData, null, 2));

// 問題:
// 1. 3rd layer folders not initially expanded - level 2なので expanded: false になるはず
// 2. 1st layer folder click causes 2nd+ layer folders to disappear 
// 3. 3rd layer folder with 2nd layer parent: clicking 2nd layer collapses 3rd layer but doesn't collapse 2nd layer
// 4. Issues with 1st and 2nd layer interaction

// processBookmarkTree関数での展開状態:
// level < 2 なので:
// level 0 (Level1) → expanded: true ✓
// level 1 (Level2) → expanded: true ✓ 
// level 2 (Level3) → expanded: false ✓ これは正しい

// では問題は他の部分にありそう...
