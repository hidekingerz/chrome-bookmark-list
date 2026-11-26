# Claude Codeの使用に関する指示

作者は日本人です。

変更を加える場合は、docsディレクトリにあるドキュメントの内容が満たされることを確認してください。

変更を加えた場合は必ずテストを実行して テストが全て通ることを確認してください。
変更を加えた場合は必ずlintを実行して、Biomeによるコードリントが通ることを確認してください。
変更を加えた場合は必ずformatを実行して Biomeによるコードフォーマットが適用してください。

作業完了の条件に、npm run build:extension が成功することを含めてください。

## 対応ブラウザ

対象は Chrome の最新の安定版から 3 つ前の版まで（`src/manifest.json` の `minimum_chrome_version`）。この範囲で使える Web の機能は、代わりの実装（フォールバック）なしで使ってよい。
版を上げるときは、`minimum_chrome_version` を「その時点の安定版 − 3」に更新する。安定版の番号は `curl -s 'https://versionhistory.googleapis.com/v1/chrome/platforms/win/channels/stable/versions?pageSize=1'` で調べる。