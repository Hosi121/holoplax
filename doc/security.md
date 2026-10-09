# 機密情報の扱い

旧手順書には、`NEXTAUTH_SECRET`、DB接続情報、`OPENAI_API_KEY`、
`DISCORD_INTEGRATION_TOKEN`、`ADMIN_PASSWORD` が漏洩した可能性の記録がある。
失効・交換や履歴清掃が完了したかは、このリポジトリの文書では確認できない。

## 漏洩時の対応順

1. 対象を特定し、利用先で認証情報を失効・交換する。廃止済み連携のtokenも利用先で失効する。
2. DB パスワードは DB 側で変更し、接続情報も更新する。secret管理の値を変更するだけでは DB パスワードは変わらない。
3. 認証 secret の交換による既存セッションへの影響を確認する。再利用された管理者パスワードも変更する。
4. 履歴を書き換える場合はバックアップと共同作業者の作業保全を済ませ、対象 branch・tag・remote と反映範囲を決める。
5. 承認された範囲で `git filter-repo` 等を使い、秘密を含むファイル・値を履歴から除去する。履歴削除は失効の代わりにならない。
6. 各 branch・tag・remote で除去を確認し、既存 clone の再同期を調整する。未保存の変更を捨てる reset は使わない。

ローカルの `.env` 履歴の確認例:

```bash
git log --all --full-history -- .env .env.local .env.development .env.production
```

これは列挙したファイルの確認だけで、別ファイルやログへコピーされた値は検出しない。
[.gitignore](../.gitignore) で `.env*` を除外し、[.dev.vars.example](../.dev.vars.example) には例示値だけを置く。
Workerの `.dev.vars*` も除外し、認証情報はWrangler secretsへ渡す。
本書の手順は履歴変更や認証情報交換が実施済みであることを示さない。
