#!/usr/bin/env bash
# Claude Code の Bash ツールから、保護ブランチ (main) への commit/push 等を防ぐ
# PreToolUse ガード。エージェントの事故防止用の補助レイヤーであり、
# 権威あるガードは GitHub のサーバーサイド ブランチ保護とする。
#
# 設計方針 (issue #89 の過剰ブロック対策):
#   - コマンド全体の素朴な部分文字列マッチをやめる。
#   - `&&` `||` `;` `|` でセグメントに分割し、各セグメントの「先頭が git か」を見る。
#     → `gh issue create --body "...git commit..."` や `echo "git push"` を誤爆しない。
#   - サブコマンドは語境界で判定する。
#     → 読み取り専用の `git merge-base` / `git merge-tree` を `git merge` と誤認しない。
#   - `git -c k=v commit` / `git --no-pager commit` のようなオプション挿入形にも対応。
set -u

cmd="$(jq -r '.tool_input.command // empty')"
[ -z "$cmd" ] && exit 0

PROTECTED="main"

current_branch() {
  git -C "${CLAUDE_PROJECT_DIR:-.}" symbolic-ref --short HEAD 2>/dev/null
}

block() {
  echo "BLOCKED: $1" >&2
  exit 2
}

# 現在ブランチが保護対象なら block。判定不能なら fail-closed で block。
guard_current_branch() {
  local b
  b="$(current_branch)"
  if [ -z "$b" ]; then
    block "cannot determine current branch; refusing git mutation (fail-closed). Server-side branch protection on '$PROTECTED' is the authoritative guard."
  fi
  if [ "$b" = "$PROTECTED" ]; then
    block "'$PROTECTED' is a protected branch. Create a feature branch (git switch -c feat/...) and open a PR instead."
  fi
}

set -f  # ワード分割時のグロブ展開 (*.ts 等) を無効化
IFS_DEFAULT=$IFS

# 区切り文字を改行へ正規化してセグメント分割
segments="$(printf '%s' "$cmd" | sed -E 's/(\|\||&&|;|\|)/\n/g')"

while IFS= read -r seg; do
  # 先頭空白を除去
  seg="${seg#"${seg%%[![:space:]]*}"}"
  [ -z "$seg" ] && continue

  # 先頭の環境変数代入 (VAR=val ) を読み飛ばす
  while [ "${seg%%=*}" != "$seg" ] \
    && printf '%s' "${seg%%=*}" | grep -qE '^[A-Za-z_][A-Za-z0-9_]*$'; do
    seg="${seg#* }"
    seg="${seg#"${seg%%[![:space:]]*}"}"
  done

  # セグメント先頭が git でなければ対象外
  case "$seg" in
    git | git\ *) ;;
    *) continue ;;
  esac

  # トークン分割し、git を除去後にグローバルオプションをスキップしてサブコマンドを得る
  IFS=' '
  # shellcheck disable=SC2086
  set -- $seg
  IFS=$IFS_DEFAULT
  shift # 'git' を除去
  while [ $# -gt 0 ]; do
    case "$1" in
      -c | -C | --git-dir | --work-tree | --namespace | --exec-path)
        shift 2 ;;            # 値を取るグローバルオプション
      --*=* | -*)
        shift ;;              # その他のフラグ
      *)
        break ;;              # 最初の非オプション = サブコマンド
    esac
  done

  sub="${1:-}"
  [ -n "$sub" ] && shift

  case "$sub" in
    push)
      # refspec が保護ブランチを指す push は、現在ブランチに関わらず block
      for a in "$@"; do
        case "$a" in
          "$PROTECTED" | *:"$PROTECTED" | *:refs/heads/"$PROTECTED" | refs/heads/"$PROTECTED")
            block "pushing to '$PROTECTED' is not allowed. Open a PR instead." ;;
        esac
      done
      guard_current_branch
      ;;
    commit | merge | rebase | cherry-pick | revert | am)
      guard_current_branch
      ;;
  esac
done <<EOF
$segments
EOF

exit 0
