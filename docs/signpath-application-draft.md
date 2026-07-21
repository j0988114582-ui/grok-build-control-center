# SignPath Foundation 申請草稿（給維護者填表用）

申請網址：<https://signpath.org/apply>（Foundation OSS 免費方案）

> 這是**給你複製貼上**的草稿，不是自動送出的東西。送出前請自行確認每一句都屬實。

## 專案基本資料

| 欄位 | 內容 |
|---|---|
| Project name | Grok Build Control Center |
| Repository | https://github.com/j0988114582-ui/grok-build-control-center |
| License | MIT（無商業雙授權） |
| Platform | Windows 10/11 x64 |
| Artifact to sign | NSIS installer：`Grok-Build-Control-Center-Setup-<version>.exe` |
| Build system | GitHub Actions（`windows-build.yml` 於乾淨環境重建並驗證） |
| Latest release | v0.10.0 https://github.com/j0988114582-ui/grok-build-control-center/releases/latest |

## 專案說明（英文，可直接貼）

> Grok Build Control Center is an unofficial Windows desktop front-end for the
> locally installed Grok Build CLI. It turns the CLI's structured ACP interface
> into a normal Windows application for people who do not want to work in a
> terminal: pick a project folder, describe the task in plain language, and
> approve each tool action in a dialog before it runs.
>
> The application does not bundle or redistribute the Grok CLI. It launches the
> user's own locally installed CLI, and all AI credentials stay with that CLI
> (the app never stores account tokens).

## 符合條件對照（Foundation terms）

| 條件 | 本專案 |
|---|---|
| OSI 認可授權、無商業雙授權 | ✅ MIT |
| 持續維護中 | ✅ 活躍開發，v0.3.2 → v0.10.0 |
| 已有正式發行版本 | ✅ GitHub Releases，含 SHA256SUMS 與 SBOM |
| 功能已於下載頁說明 | ✅ README 與每個 Release 說明頁 |
| 由開發／維護團隊本人負責簽章 | ✅ 同一維護者 |
| 可由原始碼驗證建置 | ✅ GitHub Actions 公開建置紀錄 |
| 每次發行人工核可 | ✅ 已規劃：`release-signed.yml` 需在 SignPath 平台核可 |

## ⚠️ 必須主動揭露的兩項功能（審核方會看，隱瞞只會被退件）

Foundation 條款排除「駭客／安全繞過工具」與「未經警告修改系統、危害隱私」的軟體。本專案有兩個功能表面上會觸發這條，**申請時請主動說明**：

### 1. 手機遙控（實驗性）

> **Suggested wording:**
> The app includes an optional, off-by-default remote control feature so the
> user can monitor and steer their own long-running task from their phone.
> Design constraints, all user-visible:
> - The local HTTP server binds to `127.0.0.1` only.
> - Exposure to the internet happens **only** when the user explicitly enables a
>   Cloudflare Quick Tunnel, after confirming a risk dialog that states the
>   tunnel provider terminates TLS at the edge.
> - Pairing requires scanning a QR code (secret in the URL fragment) **and**
>   entering a 6-digit PIN shown on the desktop. Sessions are capped at 72 hours
>   and are cleared when the app restarts.
> - Phone-side permission approval is **off by default**.
> This is remote control of the user's own machine by the same user — comparable
> to VS Code Remote or an SSH session — not a remote administration tool aimed
> at third-party machines. There is no silent install, no persistence mechanism,
> and no capability to reach machines the user does not control.

### 2. 「YOLO」自動核准模式

> **Suggested wording:**
> The default permission mode is "ask": every tool action the AI wants to take is
> shown in a dialog first. The user may opt into an "always approve" mode, which
> is clearly labelled as high risk, shows a persistent warning banner, requires a
> confirmation dialog to enable, resets to "ask" on every application start, and
> (when remote control is active) additionally requires the PIN. It automates the
> user's own approvals for their own project folder; it does not bypass any
> operating system security boundary — the app runs with normal user rights
> (`asInvoker`, no elevation).

## 建議一併提供的佐證連結

- 隱私政策：`PRIVACY.md`
- 安全政策：`SECURITY.md`
- 信任鏈說明：`docs/signing-trust-chain.md`
- 建置與重現：`BUILDING.md`
- 遙控安全設計（Host/Origin 白名單、CSRF 三重防護、PIN 雜湊與鎖定、無上傳路由）：`src/main/remote-server.ts`、`src/main/remote-auth.ts` 與 `tests/remote-server.test.ts`

## 核准後我要做的事（工程面已就緒）

1. 於 GitHub repo 設定：
   - Secret：`SIGNPATH_API_TOKEN`
   - Variables：`SIGNPATH_ORGANIZATION_ID`、`SIGNPATH_PROJECT_SLUG`、`SIGNPATH_SIGNING_POLICY_SLUG`
2. 執行 `Signed release` workflow（輸入 tag）→ 於 SignPath 平台人工核可
3. CI 自動驗證簽章（非 Valid 即中止）、重算 SHA-256、更新 Release 資產
4. 更新 README／SECURITY／Release 說明，把「未簽章」改為實際狀態
