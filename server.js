import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// 獲取 __dirname（在 ES module 中需要手動設置）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 8080;

// 設置靜態文件目錄
app.use(express.static(path.join(__dirname)));

// 設置multer的儲存配置
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // 確保personName存在
    const personName = req.body.personName || 'unknown';
    const dir = path.join(__dirname, 'labels', personName);
    
    // 創建資料夾（如果不存在）
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    cb(null, dir);
  },
  filename: function (req, file, cb) {
    // 提取文件名中的索引（photo_1, photo_2...）
    const match = file.fieldname.match(/photo_(\d+)/);
    const index = match ? match[1] : Date.now();
    
    cb(null, `${index}.jpg`);
  }
});

const upload = multer({ storage: storage });

// 處理照片上傳的API端點
app.post('/save-photos', upload.any(), (req, res) => {
  try {
    const files = req.files;
    const personName = req.body.personName;
    
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, message: '沒有上傳任何文件' });
    }
    
    console.log(`已成功儲存 ${files.length} 張 ${personName} 的照片`);
    
    return res.json({
      success: true,
      message: `成功儲存 ${files.length} 張照片`,
      data: {
        personName,
        count: files.length,
        paths: files.map(file => file.path)
      }
    });
  } catch (error) {
    console.error('儲存照片時出錯:', error);
    res.status(500).json({ success: false, message: `儲存失敗: ${error.message}` });
  }
});

// 啟動伺服器
app.listen(port, () => {
  console.log(`伺服器運行在 http://localhost:${port}`);
});