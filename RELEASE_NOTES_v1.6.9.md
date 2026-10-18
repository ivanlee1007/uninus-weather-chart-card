# v1.6.9 — uninus-weather-chart-card

## 改名與相容支援

- GitHub 專案、HACS 與卡片選擇器名稱統一為 `uninus-weather-chart-card`。
- 新卡片使用 `type: custom:uninus-weather-chart-card`，主要前端檔案為 `uninus-weather-chart-card.js`。
- 既有 `type: custom:weather-chart-card`、`weather-chart-card-ha.js` 與 `weather-chart-card.js` 保留支援；三個 JS 檔案皆為可獨立載入的相同套件。
- 完整 bundle 加入跨檔名／cache-busting URL 的重複載入保護；卡片選擇器只加入一筆新名稱。舊版未受保護的 bundle 或其他上游卡片無法回溯保護，更新後仍應僅保留一個有效資源並完整重載頁面。
- 保留原有 YAML 設定、明確設定的標題、最後有效天氣快照儲存 key、兩套圖示、原作者署名與授權。

## 升級前必讀

**舊 YAML type 可以保留，但舊 HACS 資源 URL 不保證自動轉址。**

1. 更新前備份儀表板與資源設定，確認 HACS 顯示更名後的同一專案。
2. 安裝 v1.6.9 後檢查實際資源 URL，標準新路徑為：
   `/hacsfiles/uninus-weather-chart-card/uninus-weather-chart-card.js`，類型為 JavaScript module。HACS 可能附加 cache tag；若保留舊安裝目錄，請以實際可讀取的檔案路徑為準。
3. 僅保留一筆可正常載入的資源，移除失效／重複的舊路徑，再完整重新整理瀏覽器。
4. HACS 可能只下載所選的主要 JS，不會一併安裝舊檔名或圖示資料夾。需要離線圖示時，使用 ZIP 內的 `icons/`／`icons2/` 並設定本機 `icons` 路徑。

完整步驟請參閱 [UPGRADING.md](https://github.com/ivanlee1007/uninus-weather-chart-card/blob/v1.6.9/UPGRADING.md)。

## 發布檔案

- `uninus-weather-chart-card.js`：主要獨立 JS／HACS 選用檔案。
- `weather-chart-card-ha.js`、`weather-chart-card.js`：舊檔名獨立相容入口。
- `uninus-weather-chart-card.zip`：三個 JS 加上兩套完整圖示資料夾，可供手動／離線安裝。

## 驗證與限制

- 回歸範圍涵蓋六種入口載入順序、重複與 cache-busting 載入、新舊卡片混用、編輯器設定保留、真實 Chart.js，以及跨 type 的快照／中斷後重載恢復。
- 瀏覽器測試使用隔離的合成 Home Assistant 狀態，不代表已完成現場 HACS 遷移或正式 Home Assistant 驗證。
- 本次僅發布 GitHub Release，不會變更既有 Home Assistant、HACS 安裝或儀表板資源。v1.6.8 與歷史 tag／附件保持不變。
