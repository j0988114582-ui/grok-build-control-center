# 程式碼簽章與發行信任鏈

本文件說明 Grok Build Control Center 的 Windows 程式碼簽章方式、如何驗證、以及簽章失效時的處理。與 roadmap issue #1 對應。

## 目前狀態

| 項目 | 狀態 |
|---|---|
| 簽章 | **尚未簽章**（申請中：SignPath Foundation 開源專案免費 OV 憑證） |
| 獨立完整性檢查 | ✅ 每個 Release 附 `SHA256SUMS.txt` |
| 相依清單 | ✅ 每個 Release 附 `sbom.cdx.json`（CycloneDX） |
| 可重現建置 | ✅ GitHub Actions 於乾淨環境重建並驗證（`.github/workflows/windows-build.yml`） |

**未簽章的實際影響**：Windows SmartScreen 可能顯示「無法辨識的發行者」警告。這是已知且公開揭露的信任缺口，不是隱藏的缺陷。在簽章生效前，請務必以 SHA-256 核對下載檔案。

## 簽章方案：SignPath Foundation

選擇理由與其他方案的比較：

| 方案 | 費用 | 私鑰保管 | 台灣個人可用 | 備註 |
|---|---|---|---|---|
| **SignPath Foundation**（採用） | 免費（開源專案） | SignPath HSM，維護者不持有金鑰 | ✅ | 需線上申請審核；每次發行需人工核可 |
| Certum 開源開發者憑證 | 約 €69 首年／€29 續約 | 實體加密卡 | ✅ | 需保管實體卡片 |
| Azure Artifact Signing | 訂閱制 | 雲端 HSM | ❌ 個人方案僅美國／加拿大 | — |
| EV 憑證 | 約 US$226 起／年 | 硬體或雲端 HSM | 個人申請困難 | 唯一能「立即」取得 SmartScreen 信譽者 |

### ⚠️ 對 SmartScreen 的正確預期

**OV 憑證不會讓 SmartScreen 警告立刻消失。** 簽章之後：

- 「發行者：不明」會變成經驗證的發行者身分 ✅
- SmartScreen 仍可能對新檔案顯示警告，直到累積足夠下載信譽（通常數週）⚠️
- 只有 **EV 憑證**能在第一次簽章後立即取得信譽

因此本專案**不會**因為完成簽章就宣稱「SmartScreen 警告已解決」。issue #1 明確要求：不得以壓下警告作為結案條件。

## 簽章流程（憑證核准後生效）

1. 於本機或 CI 建置未簽章安裝檔（`npm run package`）
2. GitHub Actions `Signed release` workflow 將安裝檔送交 SignPath 簽章
3. 維護者在 SignPath 平台**人工核可**該次簽章請求
4. CI 取回已簽章檔案，執行 `node scripts/verify-signature.mjs <installer> --required`
5. 驗證通過才重新計算 SHA-256、產生 SBOM，並上傳至 GitHub Release

### 安全失敗設計

- **未設定簽章密鑰**時，`Signed release` workflow 會**立即失敗並說明原因**，不會產出宣稱已簽章的檔案
- **簽章狀態非 `Valid`** 時，發行步驟中止（`--required` 模式回傳非零）
- **簽章未加蓋時間戳記**時同樣視為失敗——沒有時間戳的簽章會在憑證到期時一併失效
- SHA-256 校驗**始終保留**，作為獨立於憑證體系的第二道檢查

## 如何驗證你下載的檔案

```powershell
# 1) 完整性：與 Release 附的 SHA256SUMS.txt 比對
Get-FileHash .\Grok-Build-Control-Center-Setup-<版本>.exe -Algorithm SHA256

# 2) 簽章（簽章生效後）：Status 應為 Valid
Get-AuthenticodeSignature .\Grok-Build-Control-Center-Setup-<版本>.exe | Format-List Status, StatusMessage, SignerCertificate
```

專案內建的檢查工具（開發者用）：

```bash
node scripts/verify-signature.mjs <installer>            # 只報告
node scripts/verify-signature.mjs <installer> --required # 非 Valid 即失敗
```

## 憑證輪替與到期

- 簽章一律加蓋 RFC 3161 時間戳記，因此**憑證到期後，既有已發行檔案的簽章仍然有效**
- 憑證更新由 SignPath Foundation 處理；維護者需確認 CI 設定（organization id／project slug／signing policy）仍正確
- 若憑證遭撤銷：立即在 README 與最新 Release 標註、重新以新憑證簽署仍在支援的版本、保留 SHA-256 作為過渡期驗證方式

## 密鑰處理原則

- 維護者**不持有**私鑰；金鑰存放於 SignPath HSM，無法匯出
- CI 只持有 API token（GitHub Actions secret），可隨時撤銷重發
- 任何情況下都不會把憑證或 token 寫入原始碼、記錄檔或 Release 資產
