# Grok Build Control Center

[![CI](https://github.com/j0988114582-ui/grok-build-control-center/actions/workflows/ci.yml/badge.svg)](https://github.com/j0988114582-ui/grok-build-control-center/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Windows](https://img.shields.io/badge/Windows-10%2F11-blue.svg)]()

> 非官方的 Windows 桌面控制中心，操作你電腦上已安裝的 Grok Build CLI。

Grok Build Control Center 把 Grok Build 的結構化 ACP 介面變成一般人看得懂的 Windows 視窗程式。它是為不想碰終端機的人設計的：選一個專案資料夾、用白話交代任務、在畫面上逐項確認權限，其餘交給 Grok。

本專案與 xAI 無關，也未獲其背書。Grok 與 Grok Build 為其權利人之商標。

## 在 Windows 上安裝

需求：

- Windows 10 或 11（x64）
- 第一次安裝 Grok CLI 與登入時需要網路連線

步驟：

1. 打開[最新的 GitHub Release](https://github.com/j0988114582-ui/grok-build-control-center/releases/latest)。
2. 下載 `Grok-Build-Control-Center-Setup-<版本>.exe` 與 `SHA256SUMS.txt`（檔名以 Release 頁為準）。
3. 安裝前先核對雜湊：
   ```powershell
   Get-FileHash .\Grok-Build-Control-Center-Setup-<版本>.exe -Algorithm SHA256
   ```
4. 結果需與 `SHA256SUMS.txt` 完全一致，再執行安裝程式。
5. 打開程式。若尚未安裝 Grok CLI，按 **安裝 Grok CLI**，確認官方來源後再同意。
6. 在瀏覽器完成 Grok 官方登入，回到程式按 **選擇專案開始**。

目前所有版本皆為社群測試版，尚未程式碼簽章，Windows SmartScreen 可能顯示警告。程式碼簽章列為公開 Roadmap 項目，不會謊稱已完成。

## 第一個任務

1. 按 **選擇專案開始**。
2. 選擇要讓 Grok 處理的資料夾。
3. 在下方輸入框用白話輸入任務，按 Enter 送出。
4. Grok 請求權限時，先讀清楚要做什麼，再從提供的選項中選擇。

實用按鍵：`Ctrl+Shift+P` 開啟命令搜尋、`?` 顯示所有快捷鍵。未送出的文字會在 500 毫秒後自動保留在本機。

貼上剪貼簿圖片時：若本機 Grok ACP 未宣告內嵌圖片支援，程式會把圖存到 Windows 暫存目錄並把**絕對路徑**插入草稿（不會自動加提示句）。

## 目前版本內容（v0.9.0）

- ACP 原生 session：串流訊息、工具卡片、權限確認、模式與模型切換
- 回合中插話（不中斷）、立刻改做、排隊下一輪；回合完成系統通知
- **手機 QR 遙控（實驗性）**：Quick Tunnel＋PIN 配對、72 小時絕對期限、模型／模式選單、可與 YOLO 並用（手機開 YOLO 需 PIN）
- YOLO（一律核准）權限模式——每次啟動重置為「每次詢問」
- 預覽台：本機圖片／影片／程式碼／HTML 的安全預覽
- 上下文壓縮卡片（官方事件＋推斷備援）、context 用量與週訂閱額度列；服務未提供的項目顯示 `—`
- 經確認後從 xAI 官方文件記載的 Windows 來源安裝 Grok CLI；官方瀏覽器 OAuth 登入與帳號切換
- 依專案分組的對話、釘選、批次刪除、本機改名、搜尋、Markdown 匯出與草稿保存
- 無障礙模型選單、命令面板、語法上色、閱讀優先／深度沉浸、減少動態偏好、Canvas2D 降級

它不是完整 IDE、不是多模型聊天平台、不是多帳號憑證保管庫，也不取代 Grok Build 的官方認證。程式不儲存帳號 token。不支援的操作會引導到真正的 Grok TUI。

## 畫面與 Demo

真實產品截圖與 Demo GIF 會放在 `docs/assets/`。尚未驗證或可能暴露帳號、提示詞、專案內容的素材不會加入公開 README。

## Roadmap 與支援

- [公開 Roadmap](ROADMAP.md)
- [Windows Beta 測試指南](BETA_TESTING.md)
- [支援與回報方式](SUPPORT.md)
- [版本變更紀錄](CHANGELOG.md)
- [安全政策](SECURITY.md)
- [隱私政策](PRIVACY.md)
- [建置與重現](BUILDING.md)

請使用 GitHub 的 Bug、Feature 或 Beta feedback 表單。安全漏洞請透過 GitHub Security Advisories 私下通報。

## 信任與隱私

- Renderer 沙箱啟用；Node integration 停用
- 型別化、白名單制的 preload bridge
- 無遙測
- 不直接讀取 `auth.json`
- 認證與模型網路流量仍由 Grok CLI 負責
- 本機設定只包含偏好、標題覆寫與未完成草稿
- 第三方相依套件授權全文收錄於發行產物

## 開發

```powershell
npm ci
npm run verify
npm run smoke:ui
npm run package
```

GitHub Actions 會在 Pull Request 自動執行測試、lint、typecheck、build 與 Windows UI smoke test。下載數可用 `node scripts/release-metrics.mjs` 查詢；下載不等同安裝或活躍使用者。

## 架構

- `src/main`：Electron 生命週期、安全 IPC、本機 session 索引、Grok 程序與 ACP client
- `src/preload`：型別化、白名單制的 renderer bridge
- `src/shared`：事件、設定、附件、額度與快捷鍵契約
- `src/renderer`：React 工作台、虛擬化對話、Markdown、搜尋、設定與視覺特效
- `tests`：單元與 renderer 行為測試
- `work`：live CLI 與 Electron smoke 檢查

## 授權

[MIT](LICENSE)

---

# English

> Unofficial Windows desktop control center for the locally installed Grok Build CLI.

Grok Build Control Center turns Grok Build's structured ACP interface into a readable Windows app. Choose a project folder, describe a task in plain language, and review permissions inside the app.

This project is not affiliated with or endorsed by xAI. Grok and Grok Build are trademarks of their respective owner.

## Install

1. Open the [latest GitHub Release](https://github.com/j0988114582-ui/grok-build-control-center/releases/latest).
2. Download the installer and `SHA256SUMS.txt`.
3. Verify the installer with `Get-FileHash` before opening it.
4. Install without administrator privileges.
5. Complete Grok's official browser sign-in and choose a project.

The current community build is unsigned. Windows SmartScreen may warn. Code signing is tracked publicly rather than represented as complete.

## Community and maintenance

- [Roadmap](ROADMAP.md)
- [Windows beta testing](BETA_TESTING.md)
- [Support](SUPPORT.md)
- [Changelog](CHANGELOG.md)
- [Security](SECURITY.md)
- [Privacy](PRIVACY.md)
- [Reproducible building](BUILDING.md)

Use the structured GitHub forms for bugs, features, and beta results. Report vulnerabilities privately through GitHub Security Advisories.

## Development

```powershell
npm ci
npm run verify
npm run smoke:ui
npm run package
```

CI runs tests, lint, type checks, builds, and a Windows Electron UI smoke test. Run `node scripts/release-metrics.mjs` for release asset download counts; downloads are not installations or active users.

## License

[MIT](LICENSE)
