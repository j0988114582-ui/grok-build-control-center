# Grok Build Control Center v0.3.2 驗證紀錄

日期：2026-07-12（Asia/Taipei）

## 完整迴圈

- `npm run verify`：110/110 tests、ESLint 0 warnings、TypeScript、production build 全部通過。
- `node work/live_feature_smoke.mjs`：真實 Grok CLI 0.2.93 完成 ACP 連線、Grok 4.5／Composer 2.5 capability、週額度、session 建立、模型切換與精確 ID 清理。
- 真實帳號回傳總用量 79%，`productUsage: []`；Build／Imagine／API 因來源未提供而顯示 `—`。
- 原始碼 UI smoke：WebGL、三種視覺模式、快捷鍵、模型選單、帳號切換、產品額度列全通過；axe 在空白頁、帳號確認、session 三個狀態皆 0 violations。
- 打包後 `win-unpacked` 再跑同一套 UI smoke，結果一致，axe 仍為 0 violations。

## 安全與新手流程

- 官方安裝來源固定為 `https://x.ai/cli/install.ps1`，需使用者在程式內明確確認後才下載。
- 安裝腳本執行前會移除 `GROK_BIN_DIR`、`GROK_CHANNEL`、`GROK_VERSION`、`GROK_DEPLOYMENT_KEY`、`GROK_HOME` 覆寫值；完成後驗證 `grok --version`。
- OAuth 切帳號採 disconnect → login → disconnect → fresh connect；安裝／登入與一般 ACP 工作使用獨占／共享閘門避免舊帳號競態。
- 過期 billing request 在切帳號或清 cache 後只會回傳空值，不得覆寫新帳號額度。
- 權限與設定對話框皆有安全預設焦點、焦點圈限與關閉後焦點還原。

## 安裝包

- 檔名：`Grok-Build-Control-Center-Setup-0.3.2.exe`
- 大小：100,256,511 bytes
- SHA-256：`9A1892E2985A3FC72BA613754B92F1AA40D3F095101B63ED8FE0CBDABDADF6D8`
- Windows Authenticode：installer 與 packaged app 均為 `NotSigned`。
- asar 已包含 `LICENSE`、`PRIVACY.md`、`THIRD_PARTY_NOTICES.txt`。

未簽章版本不可宣稱已簽章；測試者只應從作者提供的 GitHub Release 下載並核對 SHA-256。
