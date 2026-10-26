<!-- i18n: language-switcher -->
[English](README.md) | [日本語](README.ja.md)

# Irodori Table

多くのエンジンにまたがるデータのクエリ、閲覧、編集、図示、検証を高速に行うデスクトップデータベースクライアント。

## プレビュー

![Irodori Table ワークベンチプレビュー](docs/assets/irodori-table-preview.png)

## インストール

[最新リリース](https://github.com/irodori-table/irodori-table/releases) からパッケージをダウンロードするか、パッケージマネージャーを利用できます。

**Debian / Ubuntu**（署名済み APT リポジトリ）:

```bash
curl -fsSL https://irodori-table.github.io/irodori-packages/apt/irodori-archive-keyring.gpg \
  | sudo tee /usr/share/keyrings/irodori-archive-keyring.gpg >/dev/null
echo "deb [signed-by=/usr/share/keyrings/irodori-archive-keyring.gpg] https://irodori-table.github.io/irodori-packages/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/irodori.list
sudo apt update && sudo apt install irodori-table
```

**Arch Linux**（AUR）:

```bash
yay -S irodori-table
```

**Linux（ポータブル）**: `.AppImage` をダウンロードし、実行権限を付けて起動します。

**macOS / Windows**: 最新リリースから universal `.dmg` または setup `.exe`/`.msi` をダウンロードします。

APT と AUR は安定版リリース時のみ更新されます。OS別の詳細手順・前提条件・トラブルシューティングは[インストールガイド](https://irodori-table.github.io/irodori-docs/install-guide.html)にあります。

## アップデート

**アプリ内**（安定版ビルド）: Irodori Table は起動時に署名付きの更新を確認します。**Tools** またはコマンドパレットの **Check for Updates** でも確認できます。**Install** を押し、アプリを再起動します。プレビュー版と軽量 pre-release 版には更新機能がないため、以下のコマンドで更新してください。詳細は [docs/updater.md](docs/updater.md) を参照してください。

**Windows**（PowerShell）: アプリを終了してから、最新の setup `.exe` をダウンロードして実行します。インストール済みのバージョンが置き換わります。

```powershell
$ProgressPreference = 'SilentlyContinue'
$release = Invoke-RestMethod https://api.github.com/repos/irodori-table/irodori-table/releases/latest
$asset = $release.assets | Where-Object name -like '*_x64-setup.exe'
$installer = Join-Path $env:TEMP $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $installer
Start-Process $installer -Wait
```

**macOS**: アプリを終了してから、最新の universal `.dmg` で置き換えます。

```bash
url=$(curl -fsSL https://api.github.com/repos/irodori-table/irodori-table/releases/latest \
  | grep -o '"browser_download_url": *"[^"]*_universal\.dmg"' | cut -d'"' -f4)
curl -fL "$url" -o /tmp/irodori-table.dmg
hdiutil attach /tmp/irodori-table.dmg -nobrowse -mountpoint /Volumes/irodori-table
rm -rf "/Applications/Irodori Table.app"
ditto "/Volumes/irodori-table/Irodori Table.app" "/Applications/Irodori Table.app"
hdiutil detach /Volumes/irodori-table
```

未署名ビルドが macOS にブロックされた場合は、**システム設定 ▸ プライバシーとセキュリティ** を開き、**このまま開く** を選びます。

**Linux**:

```bash
sudo apt update && sudo apt install --only-upgrade irodori-table   # Debian / Ubuntu
yay -Syu irodori-table                                              # Arch Linux (AUR)
```

AppImage の場合は、新しい `.AppImage` をダウンロードして古いファイルと置き換えます。

## プライバシー (Privacy)

Irodori Table はテレメトリーやクラッシュレポートをアップロードしません。
ユーザーが選択・設定した接続先、および拡張機能のダウンロードやリリース更新
確認など、要求された機能に必要な文書化済みのプロジェクト接続先にのみ接続
します。ローカルのクラッシュレポート処理とセキュリティ範囲については
[SECURITY.md](SECURITY.md) を参照してください。

## 開発

### 5分クイックスタート

1. ご利用のOSに応じたプラットフォームの前提条件をインストールしてください：
   [Windows](https://irodori-table.github.io/irodori-docs/windows-development.html)、
   [macOS](https://irodori-table.github.io/irodori-docs/macos-development.html)、または
   [Linux](https://irodori-table.github.io/irodori-docs/linux-development.html)。
   Linuxユーザーは、デスクトップアプリを実行する前にそのガイドにあるWebKitGTKおよびリンカーパッケージをインストールしてください。
2. リポジトリのルートから依存関係をインストールし、ローカルセットアップを確認します：

   ```sh
   task setup
   task doctor
   ```

3. デスクトップ開発用シェルを起動します：

   ```sh
   task desktop-dev
   ```

`task desktop-dev` はTauriシェルとVite開発サーバーを起動します。ルートコマンドの一覧は `make help` を実行してください。

コントリビューター向けセットアップ、トラブルシューティング、より詳細な開発ノートはプロジェクトドキュメントにあります：

- [コントリビューション](CONTRIBUTING.md)
- [Windows開発](https://irodori-table.github.io/irodori-docs/windows-development.html)
- [macOS開発](https://irodori-table.github.io/irodori-docs/macos-development.html)
- [Linux開発](https://irodori-table.github.io/irodori-docs/linux-development.html)
- [拡張機能開発](https://irodori-table.github.io/irodori-docs/extension-development.html)

## リリース

メンテナーは `main` からリリースします。Windows と macOS の実行ファイルは GitHub Actions がビルドするため、Windows や Mac のマシンは不要です。[GitHub CLI](https://cli.github.com/)（`gh auth login` 済み）が必要です。詳細は [RELEASING.md](RELEASING.md) にあります。

```sh
# 1. クリーンで最新の main から始め、ローカルのチェックを実行する。
git switch main && git pull --ff-only
task desktop-format-check
task desktop-lint
task desktop-typegen-check
task desktop-test

# 2. バージョンを上げて commit し、vX.Y.Z タグを付けて push する。
#    タグの push で Linux の pre-release（AppImage、deb、rpm）がビルドされる。
task release-patch     # または release-minor / release-major

# 3. Windows（.exe、.msi）と universal macOS（.dmg、.app）のパッケージをビルドする。
#    stable チャネルは同じリリースにそれらと更新用ファイルを追加し、Latest にする。
VERSION="v$(node -p "require('./apps/desktop/package.json').version")"
gh workflow run release.yml -f release_tag="$VERSION" -f channel=stable

# 4. 実行を見守り、アップロードされたファイルを確認する。
gh run list --workflow release.yml --limit 3     # 新しい run ID を探す
gh run watch <run-id> --exit-status
gh release view "$VERSION" --json assets -q '.assets[].name'
```

手順 3 が終わると、インストール済みの安定版ビルドは次回の更新確認で新しいバージョンを見つけます。Latest にせず、未署名の Windows / macOS テストビルドを pre-release に追加したい場合は、代わりに `-f channel=preview` を使います。

### ローカルで実行ファイルをビルドする

Tauri は実行中の OS 向けにビルドするため、各コマンドはその OS 上で実行します。先に `task setup` を実行してください。出力先は `.irodori-local/target/` です。ローカルビルドは未署名で、更新機能はありません。

```sh
# Windows: NSIS setup .exe と .msi
npm --prefix apps/desktop run tauri build -- --bundles "nsis,msi" --config src-tauri/tauri.bundle.conf.json
# -> .irodori-local/target/release/bundle/nsis/ と .irodori-local/target/release/bundle/msi/

# macOS: universal .app と .dmg（Apple silicon + Intel）
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm --prefix apps/desktop run tauri build -- --target universal-apple-darwin --bundles "app,dmg" --config src-tauri/tauri.bundle.conf.json
# -> .irodori-local/target/universal-apple-darwin/release/bundle/dmg/
```

## リポジトリ

- [`irodori-table`](https://github.com/irodori-table/irodori-table): デスクトップアプリ。
- [`irodori-kit`](https://github.com/irodori-table/irodori-kit): 共有アプリ基盤クレートおよび拡張SDK。
- [`irodori-sql`](https://github.com/irodori-table/irodori-sql): SQL方言、パラメータ、スキーマ、マイグレーション用SQLヘルパー。
- [`irodori-knowledge`](https://github.com/irodori-table/irodori-knowledge): 共有エラー、ジョブ、ナレッジストアのプリミティブ。
- [`irodori-migration`](https://github.com/irodori-table/irodori-migration): 実行不要のマイグレーション計画および差分クレート。
- [`irodori-samples`](https://github.com/irodori-table/irodori-samples): ローカルサンプルデータベースコンテナ。
- [`irodori-docs`](https://github.com/irodori-table/irodori-docs): 公開ドキュメントサイト。
- [`irodori-archive`](https://github.com/irodori-table/irodori-archive): 過去の内部ノート。

## リンク

- ユーザーガイド: [docs/README.ja.md](docs/README.ja.md)
- ドキュメント: <https://irodori-table.github.io/irodori-docs/>
- インストールガイド: <https://irodori-table.github.io/irodori-docs/install-guide.html>
- ロードマップ: [ROADMAP.md](ROADMAP.md)
- コントリビューション: [CONTRIBUTING.md](CONTRIBUTING.md)
- リリース手順: [RELEASING.md](RELEASING.md)
- セキュリティ: [SECURITY.md](SECURITY.md)
- 行動規範: [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)

ライセンス: `0BSD`。

## ライセンス

0BSD。ほぼあらゆる目的でこのプロジェクトを使用、コピー、修正、配布できます。
