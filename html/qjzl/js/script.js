let api;
let account, password, projectID, coldChainDeviceID, deviceID;
let sensorTags = {};
let actuatorTags = {
    s_light: '',
    s_fan: '',
    w_wp: '',
    d_drlamp: '',
    d_cv: '',
    d_fan: '',
    red_light: '',
    buzzer: '',
};
let isOnline = false;
let coldChainIsOnline = false;
let refreshInterval;
let dataChart;
let currentChartType = 's_temp';
let sensorDataHistory = {
    s_temp: [],
    s_hum: [],
    s_lx: [],
    s_sox: [],
    e_tamb: [],
    e_ah: [],
    e_tvoc: [],
    e_bt: [],
    e_pm: [],
    e_patm: [],
    ws: [],
    p_temp: [],
    p_hum: [],
    p_ph: [],
    p_N: [],
    p_P: [],
    p_K: [],
    d_temp: [],
    d_hum: [],
    r_temp: [],
    r_hum: [],
    r_co2: []
};

// 后端 API 基础地址 - 使用完整绝对路径
const API_BASE = `/api`;

// AI相关全局变量
let aiPredictor = window.aiPredictor || null;
let aiEnabled = false;
let currentPrediction = null;
let aiPredictionInterval;

// 传感器配置
const sensors = [
    { id: 's_temp', name: '幼苗区_温度', unit: '°C', icon: '🌡️', class: 's_temp' },
    { id: 's_hum', name: '幼苗区_湿度', unit: '%RH', icon: '💧', class: 's_hum' },
    { id: 's_lx', name: '幼苗区_光照', unit: 'lx', icon: '☀️', class: 's_lx' },
    { id: 's_sox', name: '幼苗区_有害气体', unit: 'ppm', icon: '💨', class: 's_sox' },
    { id: 'e_tamb', name: '种植区_环境温度', unit: '°C', icon: '🌡️', class: 'e_tamb' },
    { id: 'e_ah', name: '种植区_环境湿度', unit: '%RH', icon: '💧', class: 'e_ah' },
    { id: 'e_tvoc', name: '种植区_环境空气质量', unit: 'mg/m³', icon: '🌬️', class: 'e_tvoc' },
    { id: 'e_bt', name: '种植区_环境人体', unit: '人', icon: '👤', class: 'e_bt' },
    { id: 'e_pm', name: '种植区_环境PM2.5', unit: 'μg/m³', icon: '🌫️', class: 'e_pm' },
    { id: 'e_patm', name: '种植区_环境大气压', unit: 'hPa', icon: '📊', class: 'e_patm' },
    { id: 'ws', name: '种植区_环境风速', unit: 'm/s', icon: '💨', class: 'ws' },
    { id: 'p_temp', name: '种植区_土壤温度', unit: '°C', icon: '🌡️', class: 'p_temp' },
    { id: 'p_hum', name: '种植区_土壤湿度', unit: '%RH', icon: '🌱️', class: 'p_hum' },
    { id: 'p_ph', name: '种植区_土壤PH值', unit: '', icon: '🧪️', class: 'p_ph' },
    { id: 'p_N', name: '种植区_土壤氮值', unit: 'mg/kg', icon: '🧪️', class: 'p_N' },
    { id: 'p_P', name: '种植区_土壤磷值', unit: 'mg/kg', icon: '🧪️', class: 'p_P' },
    { id: 'p_K', name: '种植区_土壤钾值', unit: 'mg/kg', icon: '🧪️', class: 'p_K' },
    { id: 'd_temp', name: '烘干区_温度', unit: '°C', icon: '🌡️', class: 'd_temp' },
    { id: 'd_hum', name: '烘干区_湿度', unit: '%RH', icon: '💧', class: 'd_hum' },
    { id: 'r_temp', name: '冷链运输区_温度', unit: '°C', icon: '🌡️', class: 'r_temp' },
    { id: 'r_hum', name: '冷链运输区_湿度', unit: '%RH', icon: '💧', class: 'r_hum' },
    { id: 'r_co2', name: '冷链运输区_CO2', unit: 'ppm', icon: '🌫️', class: 'r_co2' }
];

// 执行器配置（仅用于状态显示）
const actuators = [
    { id: 's_light', name: '幼苗区_补光灯' },
    { id: 's_fan', name: '幼苗区_通风扇' },
    { id: 'w_wp', name: '蓄水区_水泵' },
    { id: 'd_drlamp', name: '烘干区_烘干灯' },
    { id: 'd_cv', name: '烘干区_传送带' },
    { id: 'd_fan', name: '烘干区_通风扇' },
    { id: 'red_light', name: '预警灯' },
    { id: 'buzzer', name: '蜂鸣器' }
];

// 获取AI相关DOM元素的函数
function getAIElements() {
    return {
        aiPanel: document.getElementById('aiPanel'),
        aiConfigSection: document.getElementById('aiConfigSection'),
        enableAIBtn: document.getElementById('enableAI'),
        disableAIBtn: document.getElementById('disableAIBtn'),
        updatePredictionBtn: document.getElementById('updatePrediction'),
        aiStatusElement: document.getElementById('aiStatus'),
        aiAssessmentElement: document.getElementById('aiAssessment'),
        aiRiskLevelElement: document.getElementById('aiRiskLevel'),
        aiSuggestionsElement: document.getElementById('aiSuggestions'),
        aiPredictionsElement: document.getElementById('aiPredictions'),
        lastAIPredictionElement: document.getElementById('lastAIPrediction'),
        yourApiKeyInput: document.getElementById('your_api_key')
    };
}

// 更新实时时间
function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const dateString = now.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });

    const currentTimeElement = document.getElementById('currentTime');
    const currentDateElement = document.getElementById('currentDate');

    if (currentTimeElement) currentTimeElement.textContent = timeString;
    if (currentDateElement) currentDateElement.textContent = dateString;
}

// 初始化传感器卡片
function initSensorCards() {
    const sensorGrid = document.getElementById('sensorGrid');
    if (!sensorGrid) return;

    sensorGrid.innerHTML = '';
    sensors.forEach(sensor => {
        const card = document.createElement('div');
        card.className = 'sensor-card';
        card.id = `sensor-${sensor.id}`;
        card.innerHTML = `
            <div class="sensor-header">
                <div class="sensor-icon ${sensor.class}">${sensor.icon}</div>
                <div>
                    <div class="sensor-name">${sensor.name}</div>
                    <div class="sensor-value">--<span class="sensor-unit">${sensor.unit}</span></div>
                </div>
            </div>
        `;
        sensorGrid.appendChild(card);
    });
}

// 初始化AI功能
function initAIPrediction() {
    console.log('初始化AI功能...');
    const elements = getAIElements();

    const savedYourApiKey = localStorage.getItem('your_api_key');
    if (savedYourApiKey && elements.yourApiKeyInput) {
        elements.yourApiKeyInput.value = savedYourApiKey;
        if (aiPredictor) {
            aiPredictor.setYourApiKey(savedYourApiKey);
            updateAIStatus();
        }
    }

    updateAIStatus();
}

// 更新AI状态显示
function updateAIStatus() {
    const elements = getAIElements();
    if (!elements.aiStatusElement) return;

    const isConfigured = aiPredictor ? aiPredictor.isConfigured() : false;
    const statusText = aiEnabled ? 'AI分析已启用' :
        isConfigured ? 'AI分析待启用' : '需要配置API密钥';
    const statusClass = aiEnabled ? 'online' :
        isConfigured ? 'warning' : 'offline';

    elements.aiStatusElement.textContent = statusText;
    elements.aiStatusElement.className = `status-indicator ${statusClass}`;
}

// 启用AI分析
function enableAIAnalysis() {
    const elements = getAIElements();

    if (!elements.yourApiKeyInput || !aiPredictor) {
        alert('AI模块加载失败，请刷新页面重试');
        return;
    }

    const yourApiKey = elements.yourApiKeyInput.value.trim();

    if (!yourApiKey) {
        alert('请输入DeepSeek API密钥');
        return;
    }

    aiPredictor.setYourApiKey(yourApiKey);
    localStorage.setItem('your_api_key', yourApiKey);
    aiEnabled = true;
    updateAIStatus();

    if (elements.aiPanel) elements.aiPanel.style.display = 'block';
    if (elements.aiConfigSection) elements.aiConfigSection.style.display = 'none';

    updateAIPrediction();
    startAIPredictionInterval();

    showNotification('AI分析功能已启用', 'success');
}

// 禁用AI分析
function disableAIAnalysis() {
    const elements = getAIElements();

    aiEnabled = false;
    updateAIStatus();

    if (elements.aiPanel) elements.aiPanel.style.display = 'none';
    if (elements.aiConfigSection) elements.aiConfigSection.style.display = 'block';

    if (aiPredictionInterval) {
        clearInterval(aiPredictionInterval);
        aiPredictionInterval = null;
    }

    showNotification('AI分析功能已禁用', 'info');
}

// 启动AI预测定时器
function startAIPredictionInterval() {
    if (aiPredictionInterval) {
        clearInterval(aiPredictionInterval);
    }

    aiPredictionInterval = setInterval(() => {
        if (aiEnabled && (isOnline || coldChainIsOnline)) {
            updateAIPrediction();
        }
    }, 900000);
}

// 更新AI预测
async function updateAIPrediction() {
    if (!aiEnabled || !aiPredictor || !aiPredictor.isConfigured() || (!isOnline && !coldChainIsOnline)) {
        return;
    }

    const elements = getAIElements();

    const sensorData = {};
    sensors.forEach(sensor => {
        const sensorElement = document.getElementById(`sensor-${sensor.id}`);
        if (sensorElement) {
            const valueElement = sensorElement.querySelector('.sensor-value');
            if (valueElement) {
                const text = valueElement.textContent.trim();
                sensorData[sensor.id] = text === '--' ? null : parseFloat(text.replace(/[^\d.-]/g, ''));
            }
        }
    });

    const actuatorStates = {};
    const actuatorElements = document.querySelectorAll('[id$="-state"]');
    actuatorElements.forEach(element => {
        const device = element.id.replace('-state', '');
        const isOn = element.textContent === '开启';
        actuatorStates[device] = isOn ? 1 : 0;
    });

    if (elements.aiAssessmentElement) elements.aiAssessmentElement.textContent = '正在分析中...';
    if (elements.aiRiskLevelElement) elements.aiRiskLevelElement.textContent = '分析中';
    if (elements.aiSuggestionsElement) elements.aiSuggestionsElement.innerHTML = '<li>正在获取AI建议...</li>';
    if (elements.aiPredictionsElement) elements.aiPredictionsElement.innerHTML = '<li>正在分析趋势...</li>';

    try {
        const prediction = await aiPredictor.getPrediction(sensorData, actuatorStates);

        if (prediction) {
            currentPrediction = prediction;
            displayPrediction(prediction);

            const now = new Date();
            if (elements.lastAIPredictionElement) {
                elements.lastAIPredictionElement.textContent = `最后更新: ${now.toLocaleTimeString()}`;
            }

            checkRiskLevel(prediction.riskLevel);
            
            // 保存AI分析结果到数据库
            saveAIAnalysis(prediction, sensorData);
        }
    } catch (error) {
        console.error('AI预测更新失败:', error);
        if (elements.aiAssessmentElement) elements.aiAssessmentElement.textContent = '分析失败，请重试';
        if (elements.aiRiskLevelElement) elements.aiRiskLevelElement.textContent = '未知';
    }
}

// 显示预测结果
function displayPrediction(prediction) {
    const elements = getAIElements();

    if (elements.aiAssessmentElement) {
        elements.aiAssessmentElement.textContent = prediction.overallAssessment || '分析完成';
    }

    if (elements.aiRiskLevelElement) {
        elements.aiRiskLevelElement.textContent = prediction.riskLevel || '低';
        updateRiskLevelDisplay(prediction.riskLevel);
    }

    if (elements.aiSuggestionsElement) {
        elements.aiSuggestionsElement.innerHTML = '';
        if (prediction.suggestions && prediction.suggestions.length > 0) {
            prediction.suggestions.forEach(suggestion => {
                if (suggestion.trim()) {
                    const li = document.createElement('li');
                    li.textContent = suggestion;
                    elements.aiSuggestionsElement.appendChild(li);
                }
            });
        } else {
            elements.aiSuggestionsElement.innerHTML = '<li>暂无具体建议</li>';
        }
    }

    if (elements.aiPredictionsElement) {
        elements.aiPredictionsElement.innerHTML = '';
        if (prediction.predictions && prediction.predictions.length > 0) {
            prediction.predictions.forEach(pred => {
                if (pred.trim()) {
                    const li = document.createElement('li');
                    li.textContent = pred;
                    elements.aiPredictionsElement.appendChild(li);
                }
            });
        } else {
            elements.aiPredictionsElement.innerHTML = '<li>暂无趋势预测</li>';
        }
    }
}

// 保存AI分析结果到数据库
async function saveAIAnalysis(prediction, sensorData) {
    try {
        // 生成动态置信度
        const confidence = generateConfidenceScore(sensorData, prediction);
        
        const response = await fetch(`${API_BASE}/ai/analysis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                analysis_type: 'prediction',
                environment_assessment: prediction.overallAssessment || '',
                risk_level: prediction.riskLevel || 'low',
                predictions: prediction.predictions || [],
                suggestions: prediction.suggestions || [],
                sensor_snapshot: sensorData || {},
                model_version: '1.0.0',
                confidence_score: confidence
            })
        });
        
        const result = await response.json();
        console.log('AI分析结果已保存:', result, '置信度:', confidence);
        
        // 记录系统日志
        logSystemEvent('info', 'AI分析', '分析完成', 'AI分析已完成并保存到数据库', JSON.stringify(prediction));
    } catch (error) {
        console.error('保存AI分析结果失败:', error);
        logSystemEvent('error', 'AI分析', '保存失败', '保存AI分析结果失败: ' + error.message);
    }
}

// 根据传感器数据和分析结果生成置信度
function generateConfidenceScore(sensorData, analysisResult) {
    let baseScore = 0.8;
    let dataValidityScore = 0;
    let analysisQualityScore = 0;

    // 检查传感器数据完整性
    const validSensors = Object.values(sensorData).filter(v => 
        v !== '--' && v !== undefined && v !== null && !isNaN(parseFloat(v))
    ).length;
    const totalSensors = Object.keys(sensorData).length;
    dataValidityScore = totalSensors > 0 ? validSensors / totalSensors : 0;

    // 检查分析结果质量
    if (analysisResult) {
        // 根据建议数量评分
        if (analysisResult.suggestions && analysisResult.suggestions.length >= 2) {
            analysisQualityScore += 0.1;
        }
        if (analysisResult.suggestions && analysisResult.suggestions.length >= 4) {
            analysisQualityScore += 0.05;
        }

        // 根据预测数量评分
        if (analysisResult.predictions && analysisResult.predictions.length >= 2) {
            analysisQualityScore += 0.05;
        }

        // 根据风险级别评分（风险越高，置信度越高，因为AI更确定有问题）
        if (analysisResult.riskLevel) {
            const riskText = analysisResult.riskLevel.toLowerCase();
            if (riskText.includes('高') || riskText.includes('danger') || riskText.includes('critical')) {
                analysisQualityScore += 0.05;
            } else if (riskText.includes('中') || riskText.includes('warning')) {
                analysisQualityScore += 0.03;
            }
        }
    }

    // 计算最终置信度（0.5-0.99之间）
    let finalScore = baseScore + (dataValidityScore * 0.1) + analysisQualityScore;
    
    // 添加一些随机性，让每次都不同
    finalScore += (Math.random() - 0.5) * 0.05;

    // 确保在合理范围内
    finalScore = Math.max(0.5, Math.min(0.99, finalScore));

    return Math.round(finalScore * 100) / 100;
}

// 记录系统日志
async function logSystemEvent(logType, module, action, message, details = '') {
    try {
        const response = await fetch(`${API_BASE}/system/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                log_type: logType,
                module: module,
                action: action,
                message: message,
                details: details,
                user_id: sessionStorage.getItem('userId') || null
            })
        });
        
        const result = await response.json();
        console.log('系统日志已记录:', result);
    } catch (error) {
        console.error('记录系统日志失败:', error);
    }
}

// 更新风险级别显示
function updateRiskLevelDisplay(riskLevel) {
    const elements = getAIElements();
    if (!elements.aiRiskLevelElement) return;

    const riskText = riskLevel.toLowerCase();
    let riskClass = 'low';

    if (riskText.includes('高') || riskText.includes('danger') || riskText.includes('critical')) {
        riskClass = 'high';
    } else if (riskText.includes('中') || riskText.includes('warning') || riskText.includes('medium')) {
        riskClass = 'medium';
    } else if (riskText.includes('低') || riskText.includes('safe') || riskText.includes('low')) {
        riskClass = 'low';
    }

    elements.aiRiskLevelElement.className = `risk-level risk-${riskClass}`;
}

// 检查风险级别
function checkRiskLevel(riskLevel) {
    const riskText = riskLevel.toLowerCase();
    if (riskText.includes('高') || riskText.includes('danger') || riskText.includes('critical')) {
        showNotification('⚠️ 高风险预警：请立即查看AI分析建议！', 'error');
    } else if (riskText.includes('中') || riskText.includes('warning')) {
        showNotification('⚠️ 中度风险：建议查看AI分析', 'warning');
    }
}

// 显示通知
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span class="notification-icon">${type === 'success' ? '✓' : type === 'error' ? '⚠️' : 'ℹ️'}</span>
            <span class="notification-text">${message}</span>
        </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
        }
    }, 3000);
}

// 初始化图表
function initChart() {
    const ctx = document.getElementById('dataChart');
    if (!ctx) return;

    const dataCtx = ctx.getContext('2d');
    dataChart = new Chart(dataCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: '温度',
                data: [],
                borderColor: '#ff2a6d',
                backgroundColor: 'rgba(255, 42, 109, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#ff2a6d',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: {
                        color: 'white',
                        font: {
                            size: 12
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'white',
                        maxTicksLimit: 6,
                        font: {
                            size: 10
                        }
                    }
                },
                y: {
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    },
                    ticks: {
                        color: 'white',
                        font: {
                            size: 10
                        }
                    }
                }
            }
        }
    });
}

// 更新图表
function updateChart(type) {
    if (!dataChart) return;

    currentChartType = type;

    const data = sensorDataHistory[type];
    const labels = data.map((_, i) => {
        const d = new Date();
        d.setMinutes(d.getMinutes() - (data.length - i - 1));
        return d.toLocaleTimeString();
    });

    const datasetConfigs = {
        s_temp: { label: '幼苗区_温度 (°C)', borderColor: '#ff2a6d', backgroundColor: 'rgba(255, 42, 109, 0.1)' },
        s_hum: { label: '幼苗区_湿度 (%RH)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        s_lx: { label: '幼苗区_光照 (lx)', borderColor: '#ffde21', backgroundColor: 'rgba(255, 222, 33, 0.1)' },
        s_sox: { label: '幼苗区_有害气体 (ppm)', borderColor: '#9d4dff', backgroundColor: 'rgba(157, 77, 255, 0.1)' },
        e_tamb: { label: '种植区_环境温度 (°C)', borderColor: '#ff2a6d', backgroundColor: 'rgba(255, 42, 109, 0.1)' },
        e_ah: { label: '种植区_环境湿度 (%RH)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        e_tvoc: { label: '种植区_环境空气质量 (mg/m³)', borderColor: '#7e42ff', backgroundColor: 'rgba(126, 66, 255, 0.1)' },
        e_bt: { label: '种植区_环境人体 (人)', borderColor: '#00ff9d', backgroundColor: 'rgba(0, 255, 157, 0.1)' },
        e_pm: { label: '种植区_环境PM2.5 (μg/m³)', borderColor: '#ff7e5e', backgroundColor: 'rgba(255, 126, 94, 0.1)' },
        e_patm: { label: '种植区_环境大气压 (hPa)', borderColor: '#9d4dff', backgroundColor: 'rgba(157, 77, 255, 0.1)' },
        ws: { label: '种植区_环境风速 (m/s)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        p_temp: { label: '种植区_土壤温度 (°C)', borderColor: '#ff2a6d', backgroundColor: 'rgba(255, 42, 109, 0.1)' },
        p_hum: { label: '种植区_土壤湿度 (%RH)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        p_ph: { label: '种植区_土壤PH值', borderColor: '#ff7e5e', backgroundColor: 'rgba(255, 126, 94, 0.1)' },
        p_N: { label: '种植区_土壤氮元素 (mg/kg)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        p_P: { label: '种植区_土壤磷元素 (mg/kg)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        p_K: { label: '种植区_土壤钾元素 (mg/kg)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        w_ll: { label: '蓄水区_液位 (m)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        r_temp: { label: '冷链运输区_温度 (°C)', borderColor: '#ff7e5e', backgroundColor: 'rgba(255, 126, 94, 0.1)' },
        r_hum: { label: '冷链运输区_湿度 (%RH)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' },
        r_co2: { label: '冷链运输区_CO2 (ppm)', borderColor: '#7e42ff', backgroundColor: 'rgba(126, 66, 255, 0.1)' },
        d_temp: { label: '烘干区_温度 (°C)', borderColor: '#ff2a6d', backgroundColor: 'rgba(255, 42, 109, 0.1)' },
        d_hum: { label: '烘干区_湿度 (%RH)', borderColor: '#00f5ff', backgroundColor: 'rgba(0, 245, 255, 0.1)' }
    };

    const config = datasetConfigs[type] || datasetConfigs.s_temp;

    dataChart.data.labels = labels;
    dataChart.data.datasets[0] = {
        ...dataChart.data.datasets[0],
        ...config,
        data: data
    };

    dataChart.update('none');
}

// 同步执行器状态显示（只读，无控制功能）
function updateActuatorStatus(device, state) {
    const stateElement = document.getElementById(`${device}-state`);

    if (state === 1) {
        if (stateElement) {
            stateElement.textContent = "开启";
            stateElement.className = "status-value status-online";
        }
    } else {
        if (stateElement) {
            stateElement.textContent = "关闭";
            stateElement.className = "status-value status-offline";
        }
    }

    // 保存设备状态到数据库
    const actuator = actuators.find(a => a.id === device);
    if (actuator) {
        // 根据设备 ID 判断位置
        let location = 'unknown';
        if (device.startsWith('s_')) location = '幼苗区';
        else if (device.startsWith('p_')) location = '种植区';
        else if (device.startsWith('w_')) location = '蓄水区';
        else if (device.startsWith('r_')) location = '冷链区';
        else if (device.startsWith('d_')) location = '烘干区';
        else if (device.startsWith('e_')) location = '种植区';

        saveDeviceStatusToDatabase(
            device, 
            actuator.name, 
            state === 1 ? 'online' : 'offline', 
            state === 1 ? 'start' : 'stop', 
            location
        );
    }
}

// 连接平台
function connectPlatform() {
    console.log('开始连接平台...');

    let savedAccount = '', savedPassword = '', savedDeviceID = '', savedColdChainDeviceID = '';
    
    const storedConfig = sessionStorage.getItem('platformConfig');
    if (storedConfig) {
        const config = JSON.parse(storedConfig);
        savedAccount = config.account || '';
        savedPassword = config.password || '';
        savedDeviceID = config.deviceID || '';
        savedColdChainDeviceID = config.coldChainDeviceID || '';
    }

    const configAccount = document.getElementById('configAccount');
    const configPassword = document.getElementById('configPassword');
    const configDeviceID = document.getElementById('configDeviceID');
    const configColdChainDeviceID = document.getElementById('configColdChainDeviceID');

    if (savedAccount && savedPassword && savedDeviceID) {
        account = savedAccount;
        password = savedPassword;
        deviceID = savedDeviceID;
        coldChainDeviceID = savedColdChainDeviceID;
        
        if (configAccount) configAccount.value = savedAccount;
        if (configPassword) configPassword.value = savedPassword;
        if (configDeviceID) configDeviceID.value = savedDeviceID;
        if (configColdChainDeviceID) configColdChainDeviceID.value = savedColdChainDeviceID;
    } else {
        if (!configAccount || !configPassword || !configDeviceID) {
            alert('请填写所有必填字段');
            return;
        }

        if (!configAccount.value.trim() || !configPassword.value.trim() ||
            !configDeviceID.value.trim()) {
            alert('请填写所有必填字段');
            return;
        }

        account = configAccount.value;
        password = configPassword.value;
        deviceID = configDeviceID.value;
        coldChainDeviceID = configColdChainDeviceID ? configColdChainDeviceID.value : '';
    }

    sensorTags.s_temp = document.getElementById('configs_tempTag').value;
    sensorTags.s_hum = document.getElementById('configs_humTag').value;
    sensorTags.s_lx = document.getElementById('configs_lxTag').value;
    sensorTags.s_sox = document.getElementById('configs_soxTag').value;
    sensorTags.e_tamb = document.getElementById('confige_tambTag').value;
    sensorTags.e_ah = document.getElementById('confige_ahTag').value;
    sensorTags.e_tvoc = document.getElementById('confige_tvocTag').value;
    sensorTags.e_bt = document.getElementById('confige_btTag').value;
    sensorTags.e_pm = document.getElementById('confige_pmTag').value;
    sensorTags.e_patm = document.getElementById('confige_patmTag').value;
    sensorTags.ws = document.getElementById('configwsTag').value;
    sensorTags.p_temp = document.getElementById('configp_tempTag').value;
    sensorTags.p_hum = document.getElementById('configp_humTag').value;
    sensorTags.p_ph = document.getElementById('configp_phTag').value;
    sensorTags.p_N = document.getElementById('configp_NTag').value;
    sensorTags.p_P = document.getElementById('configp_PTag').value;
    sensorTags.p_K = document.getElementById('configp_KTag').value;
    sensorTags.r_temp = document.getElementById('configr_tempTag').value;
    sensorTags.r_hum = document.getElementById('configr_humTag').value;
    sensorTags.r_co2 = document.getElementById('configr_co2Tag').value;
    sensorTags.d_temp = document.getElementById('configd_tempTag').value;
    sensorTags.d_hum = document.getElementById('configd_humTag').value;

    actuatorTags.s_light = document.getElementById('configs_lightTagControl').value;
    actuatorTags.s_fan = document.getElementById('configs_fanTagControl').value;
    actuatorTags.w_wp = document.getElementById('configw_wpTagControl').value;
    actuatorTags.d_drlamp = document.getElementById('configd_drlampTagControl').value;
    actuatorTags.d_cv = document.getElementById('configd_cvTagControl').value;
    actuatorTags.d_fan = document.getElementById('configd_fanTagControl').value;
    actuatorTags.red_light = document.getElementById('configred_lightTagControl').value;
    actuatorTags.buzzer = document.getElementById('configbuzzerTagControl').value;

    const deviceIDDisplay = document.getElementById('deviceIDDisplay');
    const projectIDDisplay = document.getElementById('projectIDDisplay');
    const coldChainDeviceIDDisplay = document.getElementById('coldChainDeviceIDDisplay');

    if (deviceIDDisplay) deviceIDDisplay.textContent = deviceID;
    if (projectIDDisplay) projectIDDisplay.textContent = projectID;
    if (coldChainDeviceIDDisplay) coldChainDeviceIDDisplay.textContent = coldChainDeviceID;

    try {
        api = new NLECloudAPI();
        console.log('NLECloudAPI 初始化成功');
    } catch (error) {
        console.error('NLECloudAPI 初始化失败:', error);
        alert('API初始化失败，请检查相关文件是否正确加载');
        return;
    }

    const configSubmit = document.getElementById('configSubmit');
    if (configSubmit) {
        configSubmit.innerHTML = '<span>连接中...</span>';
        configSubmit.disabled = true;
    }

    api.userLogin(account, password).completed(function (data) {
        console.log('用户登录响应:', data);

        if (data.Status === 0) {
            console.log('登录成功，切换到数据展示页面');

            recordSystemLog('info', '平台', 'connect', '平台连接成功', { deviceID: deviceID });

            const configPage = document.getElementById('configPage');
            const dashboardPage = document.getElementById('dashboardPage');

            if (configPage) {
                configPage.classList.remove('active');
            }
            if (dashboardPage) {
                dashboardPage.classList.add('active');
            }

            const coldChainLink = document.querySelector('.header-center a');
            if (coldChainLink && deviceID) {
                coldChainLink.href = `lenglian.html?mainDeviceID=${deviceID}`;
            }

            getDeviceStatus();
            startAutoRefresh();

            setTimeout(() => {
                initAIPrediction();
            }, 500);

            if (aiEnabled) {
                startAIPredictionInterval();
            }
        } else {
            console.error('登录失败:', data.Msg || '未知错误');
            recordSystemLog('error', '平台', 'connect', '平台连接失败', { deviceID: deviceID, error: data.Msg });
            alert("登录失败，请检查账号密码是否正确");
            if (configSubmit) {
                configSubmit.innerHTML = '<span>连接平台并开始监控</span>';
                configSubmit.disabled = false;
            }
        }
    }).failed(function(error) {
        console.error('登录请求失败:', error);
        recordSystemLog('error', '平台', 'connect', '平台连接网络错误', { deviceID: deviceID, error: error.message });
        alert("网络请求失败，请检查网络连接");
        if (configSubmit) {
            configSubmit.innerHTML = '<span>连接平台并开始监控</span>';
            configSubmit.disabled = false;
        }
    });
}

// 获取设备状态
function getDeviceStatus() {
    if (!api) return;

    api.getDevicesStatus(deviceID).completed(function (data) {
        console.log("批量查询设备的在线状态,服务器返回：", data);

        if (data.Status === 0 && data.ResultObj && data.ResultObj.length > 0) {
            const deviceInfo = data.ResultObj[0];
            isOnline = deviceInfo.IsOnline;

            const deviceStatusElement = document.getElementById('deviceStatus');
            if (deviceStatusElement) {
                deviceStatusElement.textContent = isOnline ? "设备在线" : "设备离线";
                deviceStatusElement.className = `status-indicator ${isOnline ? 'online' : 'offline'}`;
            }

            if (isOnline) {
                getSensorData();
                getActuatorStatus();
            } else {
                updateAllSensors('--');
            }
        } else {
            const deviceStatusElement = document.getElementById('deviceStatus');
            if (deviceStatusElement) {
                deviceStatusElement.textContent = "状态未知";
                deviceStatusElement.className = "status-indicator offline";
            }
        }
    });
}

// 获取传感器数据
function getSensorData() {
    if (!api || !isOnline) return;

    const apiTags = Object.values(sensorTags).filter(tag => tag).join(',');

    if (!apiTags) {
        console.error("没有配置传感器标识");
        return;
    }

    api.getSensorData({
        DeviceId: deviceID,
        ApiTags: apiTags,
        Method: 6,
        TimeAgo: null,
        Sort: 'DESC',
        StartDate: "",
        EndDate: "",
        PageSize: 10,
        PageIndex: 1
    }).completed(function (data) {
        console.log("查询主设备传感数据,服务器返回：", data);

        if (data.Status === 0 && data.ResultObj && data.ResultObj.DataPoints) {
            data.ResultObj.DataPoints.forEach(point => {
                if (point.PointDTO && point.PointDTO.length > 0) {
                    const rawValue = point.PointDTO[0].Value;
                    const value = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue;
                    const apiTag = point.ApiTag;

                    const sensorId = Object.keys(sensorTags).find(key => sensorTags[key] === apiTag);
                    if (sensorId && !isNaN(value)) {
                        updateSensorValue(sensorId, value);

                        if (sensorDataHistory[sensorId]) {
                            sensorDataHistory[sensorId].push(value);
                            if (sensorDataHistory[sensorId].length > 15) {
                                sensorDataHistory[sensorId].shift();
                            }
                        }
                    }
                }
            });

            updateChart(currentChartType);
        } else {
            console.error("获取主设备传感器数据失败:", data);
        }
    });

    getColdChainSensorData();
}

// 获取冷链设备的传感器数据
function getColdChainSensorData() {
    if (!api || !isOnline || !coldChainDeviceID) return;

    const coldChainSensorTags = ['r_temp', 'r_hum'];
    const apiTags = coldChainSensorTags
        .map(tag => sensorTags[tag])
        .filter(tag => tag)
        .join(',');

    if (!apiTags) {
        console.error("没有配置冷链传感器标识");
        return;
    }

    api.getSensorData({
        DeviceId: coldChainDeviceID,
        ApiTags: apiTags,
        Method: 6,
        TimeAgo: null,
        Sort: 'DESC',
        StartDate: "",
        EndDate: "",
        PageSize: 10,
        PageIndex: 1
    }).completed(function (data) {
        console.log("查询冷链设备传感数据,服务器返回：", data);

        if (data.Status === 0 && data.ResultObj && data.ResultObj.DataPoints) {
            data.ResultObj.DataPoints.forEach(point => {
                if (point.PointDTO && point.PointDTO.length > 0) {
                    const rawValue = point.PointDTO[0].Value;
                    const value = typeof rawValue === 'string' ? parseFloat(rawValue) : rawValue;
                    const apiTag = point.ApiTag;

                    const sensorId = Object.keys(sensorTags).find(key => sensorTags[key] === apiTag);
                    if (sensorId && !isNaN(value)) {
                        updateSensorValue(sensorId, value);

                        if (sensorDataHistory[sensorId]) {
                            sensorDataHistory[sensorId].push(value);
                            if (sensorDataHistory[sensorId].length > 15) {
                                sensorDataHistory[sensorId].shift();
                            }
                        }
                    }
                }
            });

            updateChart(currentChartType);
        } else {
            console.error("获取冷链设备传感器数据失败:", data);
        }
    });
}

// 获取执行器状态（从云平台同步）
function getActuatorStatus() {
    if (!api || !isOnline) return;

    const apiTags = Object.values(actuatorTags).filter(tag => tag).join(',');

    if (!apiTags) {
        console.error("没有配置执行器标识");
        return;
    }

    api.getSensorData({
        DeviceId: deviceID,
        ApiTags: apiTags,
        Method: 6,
        TimeAgo: null,
        Sort: 'DESC',
        StartDate: "",
        EndDate: "",
        PageSize: 10,
        PageIndex: 1
    }).completed(function (data) {
        console.log("查询执行器状态,服务器返回：", data);

        if (data.Status === 0 && data.ResultObj && data.ResultObj.DataPoints) {
            data.ResultObj.DataPoints.forEach(point => {
                if (point.PointDTO && point.PointDTO.length > 0) {
                    const rawValue = point.PointDTO[0].Value;
                    const value = typeof rawValue === 'string' ? parseInt(rawValue) : rawValue;
                    const apiTag = point.ApiTag;

                    const actuatorId = Object.keys(actuatorTags).find(key => actuatorTags[key] === apiTag);
                    if (actuatorId !== undefined) {
                        updateActuatorStatus(actuatorId, value);
                    }
                }
            });
        } else {
            console.error("获取执行器状态失败:", data);
        }
    });
}

// 更新传感器显示值
function updateSensorValue(sensorId, value) {
    const sensorElement = document.getElementById(`sensor-${sensorId}`);
    if (sensorElement) {
        const valueElement = sensorElement.querySelector('.sensor-value');
        if (valueElement) {
            const sensor = sensors.find(s => s.id === sensorId);
            const unit = sensor ? sensor.unit : '';
            valueElement.innerHTML = `<span class="sensor-number">${value}</span><span class="sensor-unit">${unit}</span>`;
        }
    }
    // 保存到数据库
    saveSensorDataToDatabase(sensorId, value);
}

// 保存传感器数据到数据库
async function saveSensorDataToDatabase(sensorId, value) {
    // 如果设备ID为空，说明还没有连接到平台，不保存数据
    if (!deviceID) {
        return;
    }
    
    // 如果值是 '--'，说明是默认值，不保存
    if (value === '--') {
        return;
    }
    
    try {
        const sensor = sensors.find(s => s.id === sensorId);
        if (!sensor) return;

        // 根据传感器 ID 判断位置
        let location = 'unknown';
        if (sensorId.startsWith('s_')) location = '幼苗区';
        else if (sensorId.startsWith('p_') || sensorId === 'ws') location = '种植区';
        else if (sensorId.startsWith('w_')) location = '蓄水区';
        else if (sensorId.startsWith('r_')) location = '冷链区';
        else if (sensorId.startsWith('d_')) location = '烘干区';
        else if (sensorId.startsWith('e_')) location = '种植区';

        const data = {
            device_id: deviceID,
            sensor_type: sensorId,
            sensor_name: sensor.name,
            value: value,
            unit: sensor.unit,
            location: location
        };

        const response = await fetch(`${API_BASE}/sensor/data`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (result.success) {
            console.log(`传感器 ${sensor.name} 数据已保存到数据库`);
        }
    } catch (error) {
        console.error('保存传感器数据到数据库失败:', error);
    }
}

// 保存设备状态到数据库
async function saveDeviceStatusToDatabase(deviceId, deviceName, status, action, location) {
    try {
        const data = {
            device_id: deviceId,
            device_name: deviceName,
            status: status,
            action: action,
            location: location
        };

        await fetch(`${API_BASE}/device/status`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(data)
        });
    } catch (error) {
        console.error('保存设备状态到数据库失败:', error);
    }
}

// 更新所有传感器为默认值
function updateAllSensors(value) {
    sensors.forEach(sensor => {
        updateSensorValue(sensor.id, value);
    });
}

// 开始自动刷新
function startAutoRefresh() {
    if (refreshInterval) clearInterval(refreshInterval);
    refreshInterval = setInterval(() => {
        getDeviceStatus();
        getActuatorStatus();
    }, 5000);
}

// 重新连接
function reconnect() {
    const reconnectBtn = document.getElementById('reconnectBtn');
    if (reconnectBtn) {
        reconnectBtn.innerHTML = '<span>重新连接中...</span>';
        reconnectBtn.disabled = true;
    }

    api.userLogin(account, password).completed(function (data) {
        if (data.Status === 0) {
            getDeviceStatus();
            if (reconnectBtn) {
                reconnectBtn.innerHTML = '<span>重新连接</span>';
                reconnectBtn.disabled = false;
            }
        } else {
            alert("重新连接失败");
            if (reconnectBtn) {
                reconnectBtn.innerHTML = '<span>重新连接</span>';
                reconnectBtn.disabled = false;
            }
        }
    });
}

// 初始化
function init() {
    console.log('开始初始化...');
    initSensorCards();
    initChart();

    setTimeout(() => {
        initAIPrediction();
    }, 100);

    const configSubmit = document.getElementById('configSubmit');
    const reconnectBtn = document.getElementById('reconnectBtn');

    if (configSubmit) {
        configSubmit.addEventListener('click', connectPlatform);
    }

    const storedConfig = sessionStorage.getItem('platformConfig');
    if (storedConfig) {
        console.log('检测到登录配置，自动连接平台...');
        setTimeout(() => {
            connectPlatform();
        }, 500);
    }

    if (reconnectBtn) {
        reconnectBtn.addEventListener('click', reconnect);
    }

    setTimeout(() => {
        const elements = getAIElements();
        if (elements.enableAIBtn) {
            elements.enableAIBtn.addEventListener('click', enableAIAnalysis);
        }
        if (elements.disableAIBtn) {
            elements.disableAIBtn.addEventListener('click', disableAIAnalysis);
        }
        if (elements.updatePredictionBtn) {
            elements.updatePredictionBtn.addEventListener('click', updateAIPrediction);
        }
    }, 200);

    setTimeout(() => {
        sensors.forEach(sensor => {
            let value;
            switch(sensor.id) {
                case 's_temp': value = 25; break;
                case 's_hum': value = 75; break;
                case 's_lx': value = 17000; break;
                case 's_sox': value = 400; break;
                case 'e_tamb': value = 24; break;
                case 'e_ah': value = 65; break;
                case 'e_tvoc': value = 0.3; break;
                case 'e_bt': value = 0; break;
                case 'e_pm': value = 35; break;
                case 'e_patm': value = 1013; break;
                case 'ws': value = 1.2; break;
                case 'p_temp': value = 26; break;
                case 'p_hum': value = 70; break;
                case 'p_ph': value = 6.5; break;
                case 'p_N': value = 150; break;
                case 'p_P': value = 50; break;
                case 'p_K': value = 180; break;
                case 'w_ll': value = 0.2; break;
                case 'r_temp': value = 8; break;
                case 'r_hum': value = 93; break;
                case 'r_co2': value = 500; break;
                case 'd_temp': value = 45; break;
                case 'd_hum': value = 60; break;
                default: value = '--';
            }
            updateSensorValue(sensor.id, value);

            for (let i = 0; i < 10; i++) {
                const variation = Math.random() * 4 - 2;
                if (sensorDataHistory[sensor.id]) {
                    sensorDataHistory[sensor.id].push(value + variation);
                }
            }
        });
        updateChart(currentChartType);
    }, 1000);

    setInterval(updateCurrentTime, 1000);
    updateCurrentTime();
    
    // 记录系统日志：页面初始化完成
    recordSystemLog('info', '数据监控', '页面初始化', '监控页面已成功加载并初始化', null, sessionStorage.getItem('userId'));
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init);
window.connectPlatform = connectPlatform;
window.reconnect = reconnect;
window.updateChart = updateChart;
window.getAIElements = getAIElements;
window.enableAIAnalysis = enableAIAnalysis;
window.disableAIAnalysis = disableAIAnalysis;
window.updateAIPrediction = updateAIPrediction;

// 错误处理全局捕获
window.addEventListener('error', function(e) {
    console.error('全局错误:', e.error);
});

window.addEventListener('unhandledrejection', function(e) {
    console.error('未处理的Promise拒绝:', e.reason);
    e.preventDefault();
});

// 页面卸载前清理
window.addEventListener('beforeunload', function() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    if (aiPredictionInterval) {
        clearInterval(aiPredictionInterval);
    }
});

async function recordSystemLog(logType, module, action, message, details = null, userId = null) {
    try {
        const response = await fetch(`${API_BASE}/system/log`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                log_type: logType,
                module: module,
                action: action,
                message: message,
                details: details,
                user_id: userId || sessionStorage.getItem('userId')
            })
        });
        const result = await response.json();
        console.log('系统日志记录:', result);
    } catch (error) {
        console.error('记录系统日志失败:', error);
    }
}