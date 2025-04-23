// 全局變數定義
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const personNameInput = document.getElementById('personName');
const photoCounter = document.getElementById('photoCounter');
const previewImages = document.getElementById('previewImages');
const statusMessage = document.getElementById('statusMessage');
const startTrainingBtn = document.getElementById('startTrainingBtn');
const cameraSelect = document.getElementById('cameraSelect');
const switchCameraBtn = document.getElementById('switchCameraBtn');

let stream = null;
let faceMatcher = null;
let capturedImages = [];
let isTrainingMode = true; // 預設為訓練模式
const MAX_PHOTOS = 3; // 每人最多拍攝照片數
let videoDevices = []; // 儲存所有可用的攝影機設備

// 確保 faceapi 載入完成後再初始化
window.onload = function() {
    if (typeof faceapi === 'undefined') {
        console.error('Face API 未載入');
        statusMessage.textContent = 'Face API 未載入，請重新整理頁面';
        return;
    }
    
    // 初始化程序
    initFaceApi();
};

// 初始化 Face API
async function initFaceApi() {
    try {
        // 顯示載入狀態
        statusMessage.textContent = '正在載入模型...';

        // 載入模型
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri('/models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('/models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('/models')
        ]);
        
        statusMessage.textContent = '模型載入成功，正在獲取可用攝影機...';
        
        // 獲取可用的攝影機設備
        await getAvailableCameras();
        
        // 啟動網路攝影機
        await startWebcam();
        
        // 設置按鈕事件
        setupEventListeners();
        
        statusMessage.textContent = '攝影機啟動成功，可以開始拍照';
        
    } catch (error) {
        console.error('初始化錯誤:', error);
        statusMessage.textContent = `錯誤: ${error.message}`;
    }
}

// 獲取可用的攝影機設備
async function getAvailableCameras() {
    try {
        // 獲取所有媒體設備
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        // 過濾出視訊輸入設備
        videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        // 如果沒有可用的攝影機設備
        if (videoDevices.length === 0) {
            statusMessage.textContent = '沒有找到可用的攝影機設備';
            return;
        }
        
        // 清除下拉選單選項
        cameraSelect.innerHTML = '';
        
        // 添加每個攝影機設備到下拉選單
        videoDevices.forEach((device, index) => {
            const option = document.createElement('option');
            option.value = device.deviceId;
            option.text = device.label || `攝影機 ${index + 1}`;
            cameraSelect.appendChild(option);
        });
        
        console.log(`找到 ${videoDevices.length} 個攝影機設備`);
        
    } catch (error) {
        console.error('獲取攝影機設備失敗:', error);
        statusMessage.textContent = `獲取攝影機設備失敗: ${error.message}`;
    }
}

// 啟動網路攝影機
async function startWebcam(deviceId) {
    try {
        // 如果有現有的影片流，先關閉它
        if (stream) {
            stopWebcam();
        }
        
        // 設置影片約束條件
        const constraints = {
            video: {
                width: { ideal: 720 },
                height: { ideal: 560 }
            },
            audio: false
        };
        
        // 如果指定了設備 ID，使用該設備
        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        } else if (videoDevices.length > 0 && cameraSelect.value) {
            // 使用下拉選單中選擇的設備
            constraints.video.deviceId = { exact: cameraSelect.value };
        }
        
        // 請求攝影機權限
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        // 將攝影機流連接到 video 元素
        video.srcObject = stream;
        
        // 等待 video 元素載入完成
        return new Promise((resolve) => {
            video.onloadedmetadata = () => {
                // 確保影片播放
                video.play().then(() => {
                    console.log('攝影機啟動成功');
                    
                    // 如果沒有標籤，請求一下權限後可能會更新標籤
                    if (videoDevices.some(device => !device.label) && cameraSelect.options.length > 0) {
                        getAvailableCameras();
                    }
                    
                    resolve();
                }).catch(err => {
                    console.error('視訊播放失敗:', err);
                    statusMessage.textContent = '視訊播放失敗，請重新整理頁面';
                    throw err;
                });
            };
        });
    } catch (error) {
        console.error('無法啟動網路攝影機:', error);
        
        if (error.name === 'NotAllowedError') {
            statusMessage.textContent = '無法啟動網路攝影機: 請允許瀏覽器使用攝影機權限';
        } else if (error.name === 'NotFoundError') {
            statusMessage.textContent = '無法啟動網路攝影機: 未找到可用的攝影機裝置';
        } else if (error.name === 'OverconstrainedError') {
            statusMessage.textContent = '無法啟動指定的攝影機: 請選擇其他攝影機或刷新頁面';
            // 嘗試啟動默認攝影機
            if (deviceId) {
                await startWebcam();
            }
        } else {
            statusMessage.textContent = `無法啟動網路攝影機: ${error.message}`;
        }
        
        throw error;
    }
}

// 停止網路攝影機
function stopWebcam() {
    if (stream) {
        stream.getTracks().forEach(track => {
            track.stop();
        });
        video.srcObject = null;
    }
}

// 設置按鈕和事件監聽
function setupEventListeners() {
    // 切換攝影機按鈕
    switchCameraBtn.addEventListener('click', async () => {
        const selectedDeviceId = cameraSelect.value;
        if (selectedDeviceId) {
            statusMessage.textContent = '正在切換攝影機...';
            try {
                await startWebcam(selectedDeviceId);
                statusMessage.textContent = '攝影機切換成功';
            } catch (error) {
                console.error('切換攝影機失敗:', error);
                statusMessage.textContent = `切換攝影機失敗: ${error.message}`;
            }
        } else {
            statusMessage.textContent = '請選擇要切換的攝影機';
        }
    });
    
    // 攝影機選擇變更事件
    cameraSelect.addEventListener('change', () => {
        // 僅在點擊切換按鈕時才切換攝影機，這樣用戶可以在下拉選單中查看和選擇，但不會自動切換
    });
    
    // 拍照按鈕
    captureBtn.addEventListener('click', capturePhoto);
    
    // 開始訓練按鈕
    startTrainingBtn.addEventListener('click', async () => {
        if (capturedImages.length === 0) {
            statusMessage.textContent = '請先拍攝照片';
            return;
        }
        
        statusMessage.textContent = '正在訓練模型...';
        
        try {
            // 儲存圖片到伺服器（使用fetch API）
            await saveImagesToServer();
            
            // 訓練完成後切換到識別模式
            isTrainingMode = false;
            captureBtn.disabled = true;
            personNameInput.disabled = true;
            startTrainingBtn.disabled = true;
            
            // 載入標籤化的人臉描述符並創建 faceMatcher
            const labeledDescriptors = await getLabeledFaceDescriptions();
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);
            
            statusMessage.textContent = '訓練完成，開始人臉識別';
            
            // 開始偵測循環
            startDetection();
        } catch (error) {
            console.error('訓練失敗:', error);
            statusMessage.textContent = `訓練失敗: ${error.message}`;
        }
    });
}

// 拍照功能
async function capturePhoto() {
    // 檢查是否輸入姓名
    const personName = personNameInput.value.trim();
    if (!personName) {
        statusMessage.textContent = '請輸入姓名';
        return;
    }
    
    // 檢查是否達到最大照片數
    if (capturedImages.length >= MAX_PHOTOS) {
        statusMessage.textContent = `已達到最大照片數量 (${MAX_PHOTOS})`;
        return;
    }
    
    try {
        // 創建臨時canvas來拍照
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = video.videoWidth;
        tempCanvas.height = video.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 繪製視訊幀到canvas
        tempCtx.drawImage(video, 0, 0, tempCanvas.width, tempCanvas.height);
        
        // 檢測人臉，確保照片中有人臉
        const detections = await faceapi.detectAllFaces(tempCanvas)
            .withFaceLandmarks();
            
        if (detections.length === 0) {
            statusMessage.textContent = '未檢測到人臉，請調整位置';
            return;
        }
        
        if (detections.length > 1) {
            statusMessage.textContent = '檢測到多個人臉，請確保鏡頭中只有一個人臉';
            return;
        }
        
        // 將canvas轉換為blob
        const dataUrl = tempCanvas.toDataURL('image/jpeg');
        
        // 儲存照片資訊
        capturedImages.push({
            name: personName,
            dataUrl: dataUrl,
            index: capturedImages.length + 1
        });
        
        // 更新計數器
        photoCounter.textContent = `${capturedImages.length}/${MAX_PHOTOS}`;
        
        // 添加照片預覽
        addPhotoPreview(dataUrl, capturedImages.length - 1);
        
        statusMessage.textContent = `拍攝成功 (${capturedImages.length}/${MAX_PHOTOS})`;
        
    } catch (error) {
        console.error('拍照錯誤:', error);
        statusMessage.textContent = `拍照錯誤: ${error.message}`;
    }
}

// 添加照片預覽
function addPhotoPreview(dataUrl, index) {
    const previewDiv = document.createElement('div');
    previewDiv.className = 'preview-image';
    previewDiv.innerHTML = `
        <img src="${dataUrl}" alt="照片 ${index + 1}">
        <button class="delete-btn" data-index="${index}">×</button>
    `;
    
    // 刪除按鈕點擊事件
    const deleteBtn = previewDiv.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => {
        capturedImages.splice(index, 1);
        previewImages.innerHTML = ''; // 清空預覽區
        
        // 重新生成預覽
        capturedImages.forEach((img, i) => {
            addPhotoPreview(img.dataUrl, i);
        });
        
        // 更新計數器
        photoCounter.textContent = `${capturedImages.length}/${MAX_PHOTOS}`;
        statusMessage.textContent = `已刪除照片 (${capturedImages.length}/${MAX_PHOTOS})`;
    });
    
    previewImages.appendChild(previewDiv);
}

// 將照片儲存到伺服器
async function saveImagesToServer() {
    // 如果沒有照片，直接返回
    if (capturedImages.length === 0) {
        return;
    }
    
    const personName = capturedImages[0].name;
    
    // 建立FormData物件
    const formData = new FormData();
    formData.append('personName', personName);
    
    // 將每張照片添加到FormData
    capturedImages.forEach((img, index) => {
        // 將dataURL轉換為Blob
        const blob = dataURLtoBlob(img.dataUrl);
        formData.append(`photo_${index + 1}`, blob, `${index + 1}.jpg`);
    });
    
    // 使用fetch API發送到伺服器
    // 注意: 這裡需要一個伺服器端的API來接收和處理這些圖片
    try {
        const response = await fetch('/save-photos', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            throw new Error(`服務器回應錯誤: ${response.status}`);
        }
        
        const result = await response.json();
        console.log('照片儲存成功:', result);
        return result;
    } catch (error) {
        console.error('照片儲存失敗:', error);
        throw error;
    }
}

// 將dataURL轉換為Blob
function dataURLtoBlob(dataURL) {
    const parts = dataURL.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = window.atob(parts[1]);
    const rawLength = raw.length;
    const uInt8Array = new Uint8Array(rawLength);
    
    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
    
    return new Blob([uInt8Array], { type: contentType });
}

// 獲取標籤化的人臉描述符
async function getLabeledFaceDescriptions() {
    // 在實際場景中，這個函數應該從伺服器獲取現有的標籤
    // 這裡我們使用本地儲存的標籤示例
    const labels = [personNameInput.value.trim()]; // 當前用戶的標籤
    
    return Promise.all(
        labels.map(async label => {
            const descriptions = [];
            
            // 從capturedImages獲取描述符
            for (let i = 0; i < capturedImages.length; i++) {
                const img = new Image();
                img.src = capturedImages[i].dataUrl;
                
                // 等待圖片載入
                await new Promise(resolve => {
                    img.onload = resolve;
                });
                
                // 偵測臉部和描述符
                const detection = await faceapi.detectSingleFace(img)
                    .withFaceLandmarks()
                    .withFaceDescriptor();
                    
                if (detection) {
                    descriptions.push(detection.descriptor);
                }
            }
            
            return new faceapi.LabeledFaceDescriptors(label, descriptions);
        })
    );
}

// 開始人臉偵測循環
function startDetection() {
    setInterval(async () => {
        // 檢查是否處於訓練模式
        if (isTrainingMode || !faceMatcher) {
            return;
        }
        
        // 清除畫布
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // 偵測臉部
        const detections = await faceapi.detectAllFaces(video)
            .withFaceLandmarks()
            .withFaceDescriptors();
            
        // 調整尺寸以匹配畫布
        const displaySize = { width: video.width, height: video.height };
        const resizedDetections = faceapi.resizeResults(detections, displaySize);
        
        // 如果有臉部，進行比對
        if (resizedDetections.length > 0) {
            // 比對
            const results = resizedDetections.map(d => 
                faceMatcher.findBestMatch(d.descriptor)
            );
            
            // 繪製
            results.forEach((result, i) => {
                const box = resizedDetections[i].detection.box;
                const drawBox = new faceapi.draw.DrawBox(box, { label: result.toString() });
                drawBox.draw(canvas);
            });
        }
    }, 100);
}