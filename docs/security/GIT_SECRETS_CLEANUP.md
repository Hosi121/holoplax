# Git履歴からの機密情報削除手順

## 警告

この手順はGit履歴を書き換えます。**必ずバックアップを取ってから実行してください。**

チームで作業している場合、全員がforce pullを行う必要があります。

## 前提条件

1. 現在のブランチのバックアップを取る
2. 全てのローカル変更をcommitまたはstashする
3. チームメンバーに通知する

## 手順

### 方法1: BFG Repo-Cleaner（推奨）

```bash
# 1. BFGをダウンロード
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar -O bfg.jar

# 2. リポジトリのミラークローンを作成
git clone --mirror git@github.com:YOUR_ORG/holoplax.git holoplax-mirror

# 3. 削除対象ファイルのリストを作成
cat > files-to-remove.txt << EOF
.env
.env.local
.env.development
.env.production
EOF

# 4. BFGで履歴から削除
java -jar bfg.jar --delete-files .env holoplax-mirror
java -jar bfg.jar --delete-files .env.local holoplax-mirror
java -jar bfg.jar --delete-files .env.development holoplax-mirror
java -jar bfg.jar --delete-files .env.production holoplax-mirror

# 5. 履歴のクリーンアップ
cd holoplax-mirror
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 6. リモートにプッシュ
git push --force
```

### 方法2: git filter-repo（代替）

```bash
# 1. git-filter-repoをインストール
pip install git-filter-repo

# 2. リポジトリのクリーンな状態を確認
git status

# 3. 履歴から.envファイルを削除
git filter-repo --invert-paths --path .env --force
git filter-repo --invert-paths --path .env.local --force

# 4. リモートを再設定
git remote add origin git@github.com:YOUR_ORG/holoplax.git

# 5. force push
git push --force --all
git push --force --tags
```

## 削除後の作業

### 1. 新しいシークレットを生成

```bash
# 新しいNEXTAUTH_SECRETを生成
openssl rand -base64 32

# 新しいデータベースパスワードを生成
openssl rand -base64 24
```

### 2. AWS Secrets Managerを更新

```bash
# シークレットを更新
aws secretsmanager update-secret \
  --secret-id holoplax-prod-db-secret \
  --secret-string '{"password":"新しいパスワード"}'
```

### 3. .gitignoreの確認

`.gitignore`に以下が含まれていることを確認:

```gitignore
# Environment files
.env
.env.*
!.env.example
```

### 4. チームへの通知

```
全員以下のコマンドを実行してください:

git fetch --all
git reset --hard origin/main
```

## 漏洩したシークレットの無効化

以下のシークレットは漏洩した可能性があるため、新しい値に変更してください:

1. **NEXTAUTH_SECRET** - 新しい値を生成して設定
2. **DATABASE_URL** - データベースパスワードを変更
3. **OPENAI_API_KEY** - OpenAIダッシュボードでキーをローテート
4. **DISCORD_INTEGRATION_TOKEN** - Discordで新しいトークンを生成
5. **ADMIN_PASSWORD** - 管理者パスワードを変更

## 確認

```bash
# 履歴に.envが残っていないことを確認
git log --all --full-history -- .env
git log --all --full-history -- .env.local

# 空の結果が返ればOK
```
