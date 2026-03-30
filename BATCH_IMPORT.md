# Batch Import Feature

新的批量導入功能讓你可以一次搜尋並下載多首歌曲。

## 功能特點

- 📝 **批量輸入**: 一次輸入多首歌曲
- 🔍 **智能搜尋**: 使用 Tidal API 自動搜尋歌曲
- ✅ **結果確認**: 為每首歌選擇正確的版本
- 🎵 **彈性擴展**: 架構設計支援未來添加 Amazon Music 等其他服務
- 📋 **隊列整合**: 直接加入現有的下載隊列

## 使用方法

### 1. 切換到批量導入頁面

點擊 "📝 Batch Import" 標籤頁

### 2. 輸入歌曲列表

支援的格式：
```
Song Name - Artist Name
Artist Name - Song Name
Song Name
```

範例：
```
Bohemian Rhapsody - Queen
Led Zeppelin - Stairway to Heaven
Hotel California - Eagles
```

### 3. 搜尋歌曲

點擊 "🔍 Search Songs" 按鈕，系統會使用 Tidal API 搜尋每首歌曲

### 4. 確認結果

- 系統會為每個搜尋顯示最多 5 個結果
- 第一個結果會自動被選中
- 點擊其他結果可以切換選擇
- 每首歌只能選擇一個版本

### 5. 加入隊列

點擊 "➕ Add X Selected Songs to Queue" 將選中的歌曲加入下載隊列

## 技術架構

### 後端 (Python)

#### 1. `music_service.py` - 音樂服務抽象層

```python
# 抽象基類
class MusicService(ABC):
    @abstractmethod
    def search_track(self, query: str) -> List[Track]

    @abstractmethod
    def get_service_name(self) -> str

# Tidal 實現
class TidalService(MusicService):
    # 使用 tidalapi 套件搜尋歌曲

# Amazon Music 實現（預留）
class AmazonMusicService(MusicService):
    # 未來實現

# 工廠模式
class MusicServiceFactory:
    @classmethod
    def get_service(cls, service_name: str) -> MusicService
```

**設計優點**:
- 抽象層讓添加新服務變得簡單
- Track 類別統一了不同服務的歌曲資料格式
- 工廠模式讓服務切換更靈活

#### 2. `batch_search.py` - 批量搜尋工具

```bash
# 從檔案搜尋
python3 batch_search.py -f songs.txt

# 從 stdin 搜尋
echo "Song Name - Artist" | python3 batch_search.py -

# 輸出到檔案
python3 batch_search.py -f songs.txt -o results.json

# 使用不同服務（未來）
python3 batch_search.py -s amazon_music "Song Name"
```

### 前端 (React)

#### `BatchImport.js` 組件

- 歌曲列表輸入區域
- 搜尋結果顯示
- 單選功能
- 與隊列整合

### IPC 通訊

**Electron Main Process** (`main.js`):
```javascript
ipcMain.handle('batch-search', async (event, songList) => {
  // 調用 batch_search.py
  // 返回 JSON 格式的搜尋結果
});
```

**Preload Script** (`preload.js`):
```javascript
batchSearch: (songList) => ipcRenderer.invoke('batch-search', songList)
```

## 安裝依賴

### Python 依賴

```bash
# 安裝 tidalapi 套件
pip3 install tidalapi
```

### 首次使用 Tidal 搜尋

第一次使用 Tidal 搜尋時，需要進行 OAuth 認證：

1. 系統會顯示一個認證 URL
2. 在瀏覽器中打開該 URL
3. 登入 Tidal 帳號並授權
4. 認證完成後，搜尋會自動繼續
5. 認證資訊會被保存，之後不需要再次認證

## 開發注意事項

### 添加新的音樂服務

要添加新的音樂服務（如 Amazon Music），請：

1. 在 `music_service.py` 中創建新的服務類：
```python
class NewMusicService(MusicService):
    def search_track(self, query: str) -> List[Track]:
        # 實現搜尋邏輯
        pass

    def get_service_name(self) -> str:
        return 'new_service'
```

2. 在 `MusicServiceFactory` 中註冊：
```python
_services = {
    'tidal': TidalService,
    'amazon_music': AmazonMusicService,
    'new_service': NewMusicService,  # 添加這行
}
```

3. 更新 UI 讓用戶可以選擇服務

### 測試

```bash
# 測試單曲搜尋
python3 music_service.py "Bohemian Rhapsody - Queen"

# 測試批量搜尋
python3 batch_search.py "Bohemian Rhapsody - Queen"

# 從檔案測試
cat > test_songs.txt << EOF
Bohemian Rhapsody - Queen
Stairway to Heaven - Led Zeppelin
Hotel California - Eagles
EOF

python3 batch_search.py -f test_songs.txt --pretty
```

## 故障排除

### tidalapi 未安裝

```
Error: tidalapi library not installed
```

**解決方法**:
```bash
pip3 install tidalapi
```

### 搜尋失敗

如果搜尋失敗，檢查：
1. 網路連接
2. Tidal API 是否可用
3. 查看 `/tmp/batch_search.log` 日誌

### OAuth 認證問題

如果認證失敗：
```bash
# 刪除舊的認證檔案
rm -rf ~/.tidalapi/

# 重新嘗試搜尋
```

## 未來功能

- [ ] Amazon Music 整合
- [ ] Spotify 整合
- [ ] 從 Spotify/Apple Music 播放清單匯入
- [ ] 批量下載進度顯示
- [ ] 歌曲去重功能
- [ ] 自動選擇最佳版本（根據音質、受歡迎度等）
- [ ] 保存搜尋歷史
- [ ] 匯出/匯入歌曲列表

## 相關檔案

```
tidalDownloader/
├── music_service.py          # 音樂服務抽象層
├── batch_search.py            # 批量搜尋工具
├── tidal-electron-app/
│   ├── src/
│   │   ├── components/
│   │   │   └── BatchImport.js  # 批量導入 UI 組件
│   │   ├── App.js             # 添加了批量導入標籤頁
│   │   └── index.css          # 添加了批量導入樣式
│   └── electron/
│       ├── main.js            # 添加了 batch-search IPC handler
│       └── preload.js         # 添加了 batchSearch API
└── BATCH_IMPORT.md            # 本文檔
```
