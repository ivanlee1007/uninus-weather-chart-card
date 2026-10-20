# Changelog

## v1.6.9 — uninus-weather-chart-card rebrand (2026-10-19)

- Canonical repository, HACS/card picker name, YAML type and frontend filename use `uninus-weather-chart-card`. This is the first rebrand release; publishing does not deploy to Home Assistant.
- Retain legacy `custom:weather-chart-card`, both standalone legacy JavaScript filenames and the existing snapshot storage prefix. Guard complete bundles against repeated dependency initialization and duplicate registration.
- Publish-ready workflow includes all three standalone JS assets and both icon sets in the ZIP; HACS may install only its selected canonical JS. Existing HACS resource URLs may require manual migration; no old-path redirect is promised. See [UPGRADING.md](UPGRADING.md).
- Add real-browser entrypoint-order, mixed-card/editor and snapshot compatibility regressions; validation/release gates use Node 24 and install Chromium before the full suite.

## v1.6.8 (2026-10-11)

- 在同一瀏覽器站點的可用儲存空間中保存每張卡片最後有效的天氣讀數、預報與文字；天氣暫時不可用後，即使重新整理或重建卡片，仍可恢復已保存的資料與最後有效時間，並明示「資料暫時不可用」。沒有有效快照時不捏造數據。
- 混合有效與無效的預報資料只保留有效項目供即時圖表及快照使用；全無效或空的更新不覆蓋既有預報，避免無效日期造成圖表錯誤。站點、實體、日／小時與文字設定分別隔離，過期回呼不能污染目前顯示。
- 儲存遭拒、額度不足或快照損壞時安全降級；無法寫入儲存時，同一實例仍可顯示既有資料，但重新整理後無法保留。快照採版本化、大小限制與欄位白名單，不保存整個 hass 或警報。
- 僅本地合成 hass 的 Edge built-card 測試通過；原始事故現場與正式 Home Assistant 尚未驗證。GitHub 發布不代表已部署到 Home Assistant。

## v1.6.7

- 當天氣資料 unavailable／unknown 或溫度無效時，在同一卡片實例中保留上一筆有效顯示；重新整理頁面時不保留。修正首次無資料、圖示及圖表缺值等情況。
