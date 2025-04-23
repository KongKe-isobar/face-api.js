// 全局變數定義
// 進場攝影機元素
const entranceVideo = document.getElementById('entranceVideo');
const entranceCanvas = document.getElementById('entranceCanvas');
const entranceCameraSelect = document.getElementById('entranceCameraSelect');
const entranceSwitchBtn = document.getElementById('entranceSwitchBtn');
const entranceNotification = document.getElementById('entranceNotification');

// 出場攝影機元素
const exitVideo = document.getElementById('exitVideo');
const exitCanvas = document.getElementById('exitCanvas');
const exitCameraSelect = document.getElementById('exitCameraSelect');
const exitSwitchBtn = document.getElementById('exitSwitchBtn');
const exitNotification = document.getElementById('exitNotification');

// 訓練相關元素
const captureBtn = document.getElementById('captureBtn');
const personNameInput = document.getElementById('personName');
const photoCounter = document.getElementById('photoCounter');
const previewImages = document.getElementById('previewImages');
const statusMessage = document.getElementById('statusMessage');
const startTrainingBtn = document.getElementById('startTrainingBtn');

// 記錄相關元素
const logText = document.getElementById('log-text');
const content = "";

// 攝影機流和設備
let entranceStream = null;
let exitStream = null;
let videoDevices = [];

// 人臉辨識相關
let faceMatcher = null;
let capturedImages = [];
const MAX_PHOTOS = 3; // 每人最多拍攝照片數

// 進出場記錄
let records = [];
// 冷卻時間（防止短時間內重複偵測同一個人）- 毫秒
const ENTRANCE_COOLDOWN = 10000; // 10秒
const EXIT_COOLDOWN = 10000; // 10秒
// 紀錄最後一次偵測的人和時間
let lastEntranceDetection = { name: '', time: 0 };
let lastExitDetection = { name: '', time: 0 };

// 確保 faceapi 載入完成後再初始化
window.onload = function () {
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
            faceapi.nets.ssdMobilenetv1.loadFromUri('./models'),
            faceapi.nets.faceLandmark68Net.loadFromUri('./models'),
            faceapi.nets.faceRecognitionNet.loadFromUri('./models')
        ]);

        statusMessage.textContent = '模型載入成功，正在獲取可用攝影機...';

        // 獲取可用的攝影機設備
        await getAvailableCameras();

        // 啟動進場和出場攝影機
        await startEntranceWebcam();
        await startExitWebcam();

        // 設置按鈕事件
        setupEventListeners();

        statusMessage.textContent = '攝影機啟動成功，可以開始拍照訓練模型';

        // 載入標籤化的人臉描述符並創建 faceMatcher
        const labeledDescriptors = await getLabeledFaceDescriptions();
        faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

        startEntranceDetection();
        startExitDetection();
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
        entranceCameraSelect.innerHTML = '';
        exitCameraSelect.innerHTML = '';

        // 添加每個攝影機設備到下拉選單
        videoDevices.forEach((device, index) => {
            // 進場攝影機下拉選單
            const entranceOption = document.createElement('option');
            entranceOption.value = device.deviceId;
            entranceOption.text = device.label || `攝影機 ${index + 1}`;
            entranceCameraSelect.appendChild(entranceOption);

            // 出場攝影機下拉選單
            const exitOption = document.createElement('option');
            exitOption.value = device.deviceId;
            exitOption.text = device.label || `攝影機 ${index + 1}`;
            exitCameraSelect.appendChild(exitOption);
        });

        // 如果有多個攝影機，預設第二個攝影機為出場攝影機
        if (videoDevices.length > 1) {
            exitCameraSelect.selectedIndex = 1;
        }

        console.log(`找到 ${videoDevices.length} 個攝影機設備`);

    } catch (error) {
        console.error('獲取攝影機設備失敗:', error);
        statusMessage.textContent = `獲取攝影機設備失敗: ${error.message}`;
    }
}

// 啟動進場攝影機
async function startEntranceWebcam(deviceId) {
    try {
        // 如果有現有的影片流，先關閉它
        if (entranceStream) {
            stopWebcam(entranceStream);
        }

        // 設置影片約束條件
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };

        // 如果指定了設備 ID，使用該設備
        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        } else if (videoDevices.length > 0 && entranceCameraSelect.value) {
            // 使用下拉選單中選擇的設備
            constraints.video.deviceId = { exact: entranceCameraSelect.value };
        }

        // 請求攝影機權限
        entranceStream = await navigator.mediaDevices.getUserMedia(constraints);

        // 將攝影機流連接到 video 元素
        entranceVideo.srcObject = entranceStream;

        // 等待 video 元素載入完成
        return new Promise((resolve) => {
            entranceVideo.onloadedmetadata = () => {
                // 確保影片播放
                entranceVideo.play().then(() => {
                    console.log('進場攝影機啟動成功');

                    // 如果沒有標籤，請求一下權限後可能會更新標籤
                    if (videoDevices.some(device => !device.label) && entranceCameraSelect.options.length > 0) {
                        getAvailableCameras();
                    }

                    resolve();
                }).catch(err => {
                    console.error('進場視訊播放失敗:', err);
                    statusMessage.textContent = '進場視訊播放失敗，請重新整理頁面';
                    throw err;
                });
            };
        });
    } catch (error) {
        console.error('無法啟動進場攝影機:', error);

        if (error.name === 'NotAllowedError') {
            statusMessage.textContent = '無法啟動進場攝影機: 請允許瀏覽器使用攝影機權限';
        } else if (error.name === 'NotFoundError') {
            statusMessage.textContent = '無法啟動進場攝影機: 未找到可用的攝影機裝置';
        } else if (error.name === 'OverconstrainedError') {
            statusMessage.textContent = '無法啟動指定的進場攝影機: 請選擇其他攝影機';
            // 嘗試啟動默認攝影機
            if (deviceId) {
                await startEntranceWebcam();
            }
        } else {
            statusMessage.textContent = `無法啟動進場攝影機: ${error.message}`;
        }

        throw error;
    }
}

// 啟動出場攝影機
async function startExitWebcam(deviceId) {
    try {
        // 如果有現有的影片流，先關閉它
        if (exitStream) {
            stopWebcam(exitStream);
        }

        // 設置影片約束條件
        const constraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 }
            },
            audio: false
        };

        // 如果指定了設備 ID，使用該設備
        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        } else if (videoDevices.length > 0 && exitCameraSelect.value) {
            // 使用下拉選單中選擇的設備
            constraints.video.deviceId = { exact: exitCameraSelect.value };
        }

        // 請求攝影機權限
        exitStream = await navigator.mediaDevices.getUserMedia(constraints);

        // 將攝影機流連接到 video 元素
        exitVideo.srcObject = exitStream;

        // 等待 video 元素載入完成
        return new Promise((resolve) => {
            exitVideo.onloadedmetadata = () => {
                // 確保影片播放
                exitVideo.play().then(() => {
                    console.log('出場攝影機啟動成功');

                    // 如果沒有標籤，請求一下權限後可能會更新標籤
                    if (videoDevices.some(device => !device.label) && exitCameraSelect.options.length > 0) {
                        getAvailableCameras();
                    }

                    resolve();
                }).catch(err => {
                    console.error('出場視訊播放失敗:', err);
                    statusMessage.textContent = '出場視訊播放失敗，請重新整理頁面';
                    throw err;
                });
            };
        });
    } catch (error) {
        console.error('無法啟動出場攝影機:', error);

        if (error.name === 'NotAllowedError') {
            statusMessage.textContent = '無法啟動出場攝影機: 請允許瀏覽器使用攝影機權限';
        } else if (error.name === 'NotFoundError') {
            statusMessage.textContent = '無法啟動出場攝影機: 未找到可用的攝影機裝置';
        } else if (error.name === 'OverconstrainedError') {
            statusMessage.textContent = '無法啟動指定的出場攝影機: 請選擇其他攝影機';
            // 嘗試啟動默認攝影機
            if (deviceId) {
                await startExitWebcam();
            }
        } else {
            statusMessage.textContent = `無法啟動出場攝影機: ${error.message}`;
        }

        throw error;
    }
}

// 停止網路攝影機
function stopWebcam(stream) {
    if (stream) {
        stream.getTracks().forEach(track => {
            track.stop();
        });
    }
}

// 設置按鈕和事件監聽
function setupEventListeners() {
    // 切換進場攝影機按鈕
    entranceSwitchBtn.addEventListener('click', async () => {
        const selectedDeviceId = entranceCameraSelect.value;
        if (selectedDeviceId) {
            statusMessage.textContent = '正在切換進場攝影機...';
            try {
                await startEntranceWebcam(selectedDeviceId);
                statusMessage.textContent = '進場攝影機切換成功';
            } catch (error) {
                console.error('切換進場攝影機失敗:', error);
                statusMessage.textContent = `切換進場攝影機失敗: ${error.message}`;
            }
        } else {
            statusMessage.textContent = '請選擇要切換的進場攝影機';
        }
    });

    // 切換出場攝影機按鈕
    exitSwitchBtn.addEventListener('click', async () => {
        const selectedDeviceId = exitCameraSelect.value;
        if (selectedDeviceId) {
            statusMessage.textContent = '正在切換出場攝影機...';
            try {
                await startExitWebcam(selectedDeviceId);
                statusMessage.textContent = '出場攝影機切換成功';
            } catch (error) {
                console.error('切換出場攝影機失敗:', error);
                statusMessage.textContent = `切換出場攝影機失敗: ${error.message}`;
            }
        } else {
            statusMessage.textContent = '請選擇要切換的出場攝影機';
        }
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

            // 載入標籤化的人臉描述符並創建 faceMatcher
            const labeledDescriptors = await getLabeledFaceDescriptions();
            faceMatcher = new faceapi.FaceMatcher(labeledDescriptors, 0.6);

            statusMessage.textContent = '訓練完成，開始人臉識別';

            // 開始進場和出場的人臉偵測循環
            startEntranceDetection();
            startExitDetection();
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
        tempCanvas.width = entranceVideo.videoWidth;
        tempCanvas.height = entranceVideo.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // 繪製視訊幀到canvas
        tempCtx.drawImage(entranceVideo, 0, 0, tempCanvas.width, tempCanvas.height);

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
    try {
        // 如果有捕獲的照片，使用這些照片
        if (capturedImages.length > 0) {
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
        } else {
            // 否則，從labels目錄中載入
            // 從伺服器獲取可用的標籤列表
            const response = await fetch('/api/labels');
            if (!response.ok) {
                throw new Error('無法獲取標籤列表');
            }

            const labels = await response.json();
            return Promise.all(
                labels.map(async label => {
                    const descriptions = [];
                    for (let i = 1; i <= 3; i++) {
                        try {
                            const img = await faceapi.fetchImage(`/labels/${label}/${i}.jpg`);
                            const detection = await faceapi.detectSingleFace(img)
                                .withFaceLandmarks()
                                .withFaceDescriptor();

                            if (detection) {
                                descriptions.push(detection.descriptor);
                            }
                        } catch (e) {
                            console.log(`無法載入 ${label} 的第 ${i} 張照片`);
                        }
                    }

                    return new faceapi.LabeledFaceDescriptors(label, descriptions);
                })
            );
        }
    } catch (error) {
        console.error('無法獲取標籤化的人臉描述符:', error);

        // 如果有捕獲的照片，作為備用方案
        if (capturedImages.length > 0) {
            const label = personNameInput.value.trim();
            const descriptions = [];

            for (const img of capturedImages) {
                try {
                    const imgEl = new Image();
                    imgEl.src = img.dataUrl;
                    await new Promise(resolve => { imgEl.onload = resolve; });

                    const detection = await faceapi.detectSingleFace(imgEl)
                        .withFaceLandmarks()
                        .withFaceDescriptor();

                    if (detection) {
                        descriptions.push(detection.descriptor);
                    }
                } catch (e) {
                    console.error('處理捕獲的圖片時出錯:', e);
                }
            }

            return [new faceapi.LabeledFaceDescriptors(label, descriptions)];
        }

        // 如果沒有其他選項，使用現有的labels/kong目錄
        // const label = 'kong';
        // const descriptions = [];

        // for (let i = 1; i <= 3; i++) {
        //     try {
        //         const img = await faceapi.fetchImage(`/labels/kong/${i}.jpg`);
        //         const detection = await faceapi.detectSingleFace(img)
        //             .withFaceLandmarks()
        //             .withFaceDescriptor();

        //         if (detection) {
        //             descriptions.push(detection.descriptor);
        //         }
        //     } catch (e) {
        //         console.log(`無法載入 kong 的第 ${i} 張照片`);
        //     }
        // }

        // return [new faceapi.LabeledFaceDescriptors(label, descriptions)];
    }
}

// 開始進場人臉偵測循環
function startEntranceDetection() {
    setInterval(async () => {
        // 清除畫布
        const ctx = entranceCanvas.getContext('2d');
        ctx.clearRect(0, 0, entranceCanvas.width, entranceCanvas.height);

        if (!entranceVideo.paused && !entranceVideo.ended) {
            try {
                // 偵測臉部
                const detections = await faceapi.detectAllFaces(entranceVideo)
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                // 調整尺寸以匹配畫布 - 修正方框偏移問題
                const displaySize = {
                    width: entranceCanvas.width,
                    height: entranceCanvas.height
                };
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
                        drawBox.draw(entranceCanvas);

                        // 檢查是否需要顯示進場通知
                        const personName = result.label;
                        const currentTime = Date.now();

                        // 如果不是unknown且不在冷卻時間內
                        if (personName !== 'unknown' &&
                            (personName !== lastEntranceDetection.name ||
                                currentTime - lastEntranceDetection.time > ENTRANCE_COOLDOWN)) {

                            // 更新最後一次偵測
                            lastEntranceDetection = {
                                name: personName,
                                time: currentTime
                            };

                            // 顯示進場通知
                            textTypingEffect(logText, '你好', personName);
                        }
                    });
                }
            } catch (error) {
                console.error('進場偵測錯誤:', error);
            }
        }
    }, 100);
}

// 開始出場人臉偵測循環
function startExitDetection() {
    setInterval(async () => {
        // 清除畫布
        const ctx = exitCanvas.getContext('2d');
        ctx.clearRect(0, 0, exitCanvas.width, exitCanvas.height);

        if (!exitVideo.paused && !exitVideo.ended) {
            try {
                // 偵測臉部
                const detections = await faceapi.detectAllFaces(exitVideo)
                    .withFaceLandmarks()
                    .withFaceDescriptors();

                // 調整尺寸以匹配畫布 - 修正方框偏移問題
                const displaySize = {
                    width: exitCanvas.width,
                    height: exitCanvas.height
                };
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
                        drawBox.draw(exitCanvas);

                        // 檢查是否需要顯示出場通知
                        const personName = result.label;
                        const currentTime = Date.now();

                        // 如果不是unknown且不在冷卻時間內
                        if (personName !== 'unknown' &&
                            (personName !== lastExitDetection.name ||
                                currentTime - lastExitDetection.time > EXIT_COOLDOWN)) {

                            // 更新最後一次偵測
                            lastExitDetection = {
                                name: personName,
                                time: currentTime
                            };

                            // 顯示出場通知
                            textTypingEffect(logText, '再見', personName);
                        }
                    });
                }
            } catch (error) {
                console.error('出場偵測錯誤:', error);
            }
        }
    }, 100);
}

function textTypingEffect(element, prefix, text, i = 0) {
    const content = `${prefix}，${text}！`;

    if (i === 0) {
        element.textContent = "";
    }

    element.textContent += content[i];

    if (i === content.length - 1) {
        return;
    }

    setTimeout(() => textTypingEffect(element, prefix, text, i + 1), 50)
}
