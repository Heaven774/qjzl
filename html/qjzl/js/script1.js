let map;
let currentVehicleMarker = null;
let currentVehicleId = null;
let r_tempChart = null;
let r_humChart = null;
let r_co2Chart = null;
let r_tempHistory = [];
let r_humHistory = [];
let r_co2History = [];
let allVehicles = [];
let api;
let mapLoaded = false;
let cloudPlatformInitialized = false;
let initialVehicleCheckCompleted = false;
let allVehicleMarkers = [];
let cloudPlatformAvailable = false;

// 后端 API 基础地址
const API_BASE = `/api`;

// 立即执行的调试代码 - 在脚本加载后立即执行
console.log('=======================================');
console.log('🚛 冷链车辆监控脚本已加载');
console.log('📡 API地址:', API_BASE);
console.log('🕐 当前时间:', new Date().toLocaleString());
console.log('=======================================');

// 高德地图Key和云平台配置(后续由 /api/config 接口注入)
let AMAP_KEY = '';
let CLOUD_CONFIG = {
    account: '',
    password: '',
    pollingInterval: 10000
};

// 从后端获取前端配置(环境变量中的高德Key和云平台账号密码)
async function fetchFrontendConfig() {
    try {
        const response = await fetch(API_BASE + '/config');
        const result = await response.json();
        if (result.success && result.data) {
            AMAP_KEY = result.data.amap_key || AMAP_KEY;
            CLOUD_CONFIG.account = result.data.cloud_account || CLOUD_CONFIG.account;
            CLOUD_CONFIG.password = result.data.cloud_password || CLOUD_CONFIG.password;
            CLOUD_CONFIG.pollingInterval = result.data.polling_interval || CLOUD_CONFIG.pollingInterval;
            console.log('✅ 前端配置已加载: amap_key=', AMAP_KEY ? AMAP_KEY.substring(0, 6) + '...' : '未设置',
                'cloud_account=', CLOUD_CONFIG.account || '未设置');
            return true;
        } else {
            console.warn('⚠️  配置接口返回数据格式异常:', result);
            return false;
        }
    } catch (error) {
        console.warn('⚠️  获取前端配置失败,使用空配置(请检查Node服务或环境变量):', error.message);
        return false;
    }
}

// 动态加载高德地图脚本(加载完成后resolve)
function loadAmapScript(amapKey) {
    return new Promise((resolve, reject) => {
        if (typeof AMap !== 'undefined') {
            resolve();
            return;
        }
        if (!amapKey) {
            console.warn('⚠️  未配置高德地图Key,跳过加载高德地图');
            reject(new Error('AMAP_KEY 未配置'));
            return;
        }
        const script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapKey)}`;
        script.onload = () => {
            console.log('✅ 高德地图脚本加载完成');
            resolve();
        };
        script.onerror = (e) => {
            console.error('❌ 高德地图脚本加载失败:', e);
            reject(new Error('高德地图脚本加载失败'));
        };
        document.head.appendChild(script);
    });
}

// 页面加载后:先获取配置 → 再加载高德地图 → 最后执行 init()
document.addEventListener('DOMContentLoaded', async function() {
    console.log('🚀 页面加载完成，开始初始化...');

    const vehicleList = document.getElementById('vehicle-list');
    if (vehicleList) {
        vehicleList.innerHTML = '<div class="loading">正在加载配置...</div>';
    }

    // 1) 从后端拉取配置(高德Key + 云平台账号密码)
    const cfgLoaded = await fetchFrontendConfig();

    // 2) 先加载车辆配置(不依赖地图)
    try {
        init().then(() => {
            console.log('✅ 车辆配置加载完成');
            if (allVehicles.length > 0) {
                selectVehicle(allVehicles[0].id);
            }
        }).catch(error => {
            console.error('❌ 初始化失败:', error);
            if (vehicleList) {
                vehicleList.innerHTML = '<div class="loading">加载失败，请刷新页面重试</div>';
            }
        });
    } catch (error) {
        console.error('❌ 初始化失败:', error);
    }

    // 3) 加载高德地图脚本并初始化地图
    try {
        await loadAmapScript(AMAP_KEY);
        initMap();
    } catch (mapError) {
        console.error('❌ 地图初始化失败:', mapError);
        try {
            const loadingElement = document.getElementById('mapLoading');
            if (loadingElement) loadingElement.style.display = 'none';
            const mapContainer = document.getElementById('map-container');
            if (mapContainer) {
                mapContainer.innerHTML =
                    '<div style="color:#ff2a6d;text-align:center;padding:30px;">' +
                    '地图未配置或加载失败<br>' +
                    '<small style="color:#999;">请在 docker-compose.yml 中为 node 服务设置 AMAP_KEY 环境变量</small>' +
                    '</div>';
            }
            mapLoaded = false;
        } catch (e) {
            /* ignore */
        }
    }
});

// 固定数据配置（设备离线时使用）
const FIXED_DATA = {
    temperature: 8.5,    // 固定温度值 (°C)
    humidity: 92.0,      // 固定湿度值 (%)
    co2: 12000           // 固定CO2值 (ppm)
};

// 检查 NLECloudAPI 是否已加载
function checkNLECloudAPI() {
    if (typeof NLECloudAPI === 'undefined') {
        console.error('NLECloudAPI 未加载，请检查网络连接或 SDK 引用');
        return false;
    }
    return true;
}

// 初始化函数
async function init() {
    updateCurrentTime();
    setInterval(updateCurrentTime, 1000);

    // 尝试初始化云平台
    await tryInitializeCloudPlatform();

    await loadAndCheckSavedVehicles();
}

// 尝试初始化云平台（不抛出错误）
async function tryInitializeCloudPlatform() {
    if (!checkNLECloudAPI()) {
        cloudPlatformAvailable = false;
        console.warn('NLECloudAPI 不可用，使用模拟模式');
        return;
    }

    try {
        api = new NLECloudAPI();
        await new Promise((resolve, reject) => {
            api.userLogin(CLOUD_CONFIG.account, CLOUD_CONFIG.password).completed(function(data) {
                if (data.Status === 0) {
                    console.log('云平台登录成功');
                    cloudPlatformInitialized = true;
                    cloudPlatformAvailable = true;
                    resolve();
                } else {
                    console.warn('云平台登录失败:', data.Msg);
                    cloudPlatformAvailable = false;
                    resolve(); // 不reject，继续执行
                }
            });
        });
    } catch (error) {
        console.error('初始化云平台失败:', error);
        cloudPlatformAvailable = false;
    }
}

// 加载已保存的车辆并自动检测设备状态（从数据库加载）
async function loadAndCheckSavedVehicles() {
    try {
        console.log('🔍 正在加载车辆配置...');
        console.log('   API 地址:', API_BASE + '/vehicle/configs');
        
        // 优先从数据库加载
        const response = await fetch(`${API_BASE}/vehicle/configs`);
        console.log('   响应状态:', response.status);
        
        const result = await response.json();
        console.log('   返回结果:', result);
        
        if (result.success && result.data && result.data.length > 0) {
            allVehicles = result.data.map(config => ({
                id: config.id,
                number: config.number,
                mainDeviceID: config.mainDeviceID,
                coldChainDeviceID: config.coldChainDeviceID,
                sensorTags: config.sensorTags || {
                    r_co2: 'r_co2',
                    temperature: 'r_temp',
                    humidity: 'r_hum'
                },
                location: config.location || '陕西省咸阳市秦都区',
                coords: config.coords || {lng: 108.706, lat: 34.341},
                // 默认设置为在线状态，使用固定数据
                isConnected: true,
                mainDeviceOnline: true,
                coldChainDeviceOnline: true,
                status: 'online',
                r_temp: FIXED_DATA.temperature,
                r_hum: FIXED_DATA.humidity,
                r_co2: FIXED_DATA.co2,
                lastUpdate: '--'
            }));
            console.log('✅ 从数据库加载车辆配置成功:', allVehicles.length, '辆');
            console.log('   车辆列表:', allVehicles);
        } else {
            console.log('⚠️  数据库中没有车辆配置数据');
            // 如果数据库没有数据，尝试从 localStorage 读取（兼容旧数据）
            const savedVehicles = localStorage.getItem('coldChainVehicles');
            if (savedVehicles) {
                allVehicles = JSON.parse(savedVehicles);
                allVehicles.forEach(vehicle => {
                    vehicle.isConnected = true;
                    vehicle.mainDeviceOnline = true;
                    vehicle.coldChainDeviceOnline = true;
                    vehicle.status = 'online';
                    vehicle.r_temp = FIXED_DATA.temperature;
                    vehicle.r_hum = FIXED_DATA.humidity;
                    vehicle.r_co2 = FIXED_DATA.co2;
                    vehicle.lastUpdate = '--';
                });
                console.log('从 localStorage 加载车辆配置:', allVehicles.length, '辆');
            } else {
                allVehicles = [];
                console.log('没有找到任何车辆配置数据');
            }
        }

        renderVehicleList();

        if (cloudPlatformAvailable) {
            if (!window.dataPollingInterval && allVehicles.length > 0) {
                window.dataPollingInterval = setInterval(pollAllVehiclesData, CLOUD_CONFIG.pollingInterval);
            }
            console.log('云平台可用，开始轮询真实数据');
        } else {
            console.log('云平台不可用，使用固定数据');
        }

        initialVehicleCheckCompleted = true;
        renderVehicleList();

    } catch (error) {
        console.error('❌ 加载车辆数据失败:', error);
        // 失败时尝试从 localStorage 读取
        try {
            const savedVehicles = localStorage.getItem('coldChainVehicles');
            if (savedVehicles) {
                allVehicles = JSON.parse(savedVehicles);
                allVehicles.forEach(vehicle => {
                    vehicle.isConnected = true;
                    vehicle.mainDeviceOnline = true;
                    vehicle.coldChainDeviceOnline = true;
                    vehicle.status = 'online';
                    vehicle.r_temp = FIXED_DATA.temperature;
                    vehicle.r_hum = FIXED_DATA.humidity;
                    vehicle.r_co2 = FIXED_DATA.co2;
                    vehicle.lastUpdate = '--';
                });
                console.log('从 localStorage 加载车辆配置:', allVehicles.length, '辆');
            } else {
                allVehicles = [];
            }
        } catch (e) {
            allVehicles = [];
        }
        renderVehicleList();
        initialVehicleCheckCompleted = true;
    }
}

// 注册并连接新车辆（修改：默认设置为在线状态，同时保存到数据库）
async function registerAndConnectVehicle() {
    const number = document.getElementById('registerVehicleNumber').value;
    const mainDeviceID = document.getElementById('registerMainDeviceID').value;
    const coldChainDeviceID = document.getElementById('registerColdChainDeviceID').value;
    const r_co2Tag = document.getElementById('registerCo2Tag').value;
    const temperatureTag = document.getElementById('registerTemperatureTag').value;
    const humidityTag = document.getElementById('registerHumidityTag').value;

    if (!number) {
        alert('请输入车辆编号');
        return;
    }

    if (!mainDeviceID) {
        alert('请输入主设备ID');
        return;
    }

    if (!coldChainDeviceID) {
        alert('请输入冷链运输设备ID');
        return;
    }

    if (allVehicles.find(v => v.number === number)) {
        alert('车辆编号已存在');
        return;
    }

    // 创建新车辆对象，默认设置为在线状态，使用固定数据
    const newVehicle = {
        id: 'V' + Date.now(),
        number: number,
        mainDeviceID: mainDeviceID.trim(),
        coldChainDeviceID: coldChainDeviceID.trim(),
        isConnected: true, // 默认连接
        mainDeviceOnline: true, // 默认在线
        coldChainDeviceOnline: true, // 默认在线
        status: 'online', // 默认在线状态
        // 使用固定数据初始化
        r_temp: FIXED_DATA.temperature,
        r_hum: FIXED_DATA.humidity,
        r_co2: FIXED_DATA.co2,
        lastUpdate: '--',
        location: '陕西省咸阳市秦都区',
        coords: {lng: 108.706, lat: 34.341}, // 咸阳坐标
        sensorTags: {
            r_co2: r_co2Tag.trim() || 'r_co2',
            temperature: temperatureTag.trim() || 'r_temp',
            humidity: humidityTag.trim() || 'r_hum'
        }
    };

    // 添加到车辆列表
    allVehicles.push(newVehicle);
    
    // 同时保存到数据库和 localStorage
    await saveVehicleConfigToDatabase(newVehicle);
    saveVehiclesToLocalStorage();

    // 如果云平台可用且还没有开始轮询，启动轮询
    if (cloudPlatformAvailable && !window.dataPollingInterval) {
        window.dataPollingInterval = setInterval(pollAllVehiclesData, CLOUD_CONFIG.pollingInterval);
    }

    renderVehicleList();
    hideRegisterForm();

    // 在地图上添加新车辆的绿色定位点
    if (mapLoaded) {
        addVehicleMarkerToMap(newVehicle);
    }

    alert('车辆注册成功！');

    // 如果这是第一辆车，自动选择它
    if (allVehicles.length === 1) {
        selectVehicle(newVehicle.id);
    }
}

// 保存车辆配置到数据库
async function saveVehicleConfigToDatabase(vehicle) {
    try {
        console.log('💾 正在保存车辆配置到数据库...');
        console.log('   车辆信息:', {
            id: vehicle.id,
            number: vehicle.number,
            mainDeviceID: vehicle.mainDeviceID,
            coldChainDeviceID: vehicle.coldChainDeviceID
        });
        
        const response = await fetch(`${API_BASE}/vehicle/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                id: vehicle.id,
                number: vehicle.number,
                mainDeviceID: vehicle.mainDeviceID,
                coldChainDeviceID: vehicle.coldChainDeviceID,
                sensorTags: vehicle.sensorTags,
                location: vehicle.location,
                coords: vehicle.coords
            })
        });
        
        console.log('   保存响应状态:', response.status);
        
        const result = await response.json();
        console.log('   保存结果:', result);
        
        if (result.success) {
            console.log(`✅ 车辆 ${vehicle.number} 配置已保存到数据库`);
        } else {
            console.error('❌ 保存车辆配置失败:', result.message);
        }
    } catch (error) {
        console.error('❌ 保存车辆配置到数据库失败:', error);
    }
}

// 测试车辆设备连接（简化版，因为现在默认在线）
async function testVehicleConnection(vehicle) {
    if (!cloudPlatformAvailable) {
        return;
    }

    try {
        // 测试主设备连接
        let mainDeviceOnline = false;
        try {
            const mainDeviceStatus = await new Promise((resolve) => {
                api.getDevicesStatus(vehicle.mainDeviceID).completed(resolve);
            });

            if (mainDeviceStatus.Status === 0 &&
                mainDeviceStatus.ResultObj &&
                mainDeviceStatus.ResultObj.length > 0) {
                mainDeviceOnline = mainDeviceStatus.ResultObj[0].IsOnline;
            }
        } catch (error) {
            console.warn(`主设备 ${vehicle.mainDeviceID} 连接测试失败:`, error);
            mainDeviceOnline = false;
        }

        // 测试冷链设备连接
        let coldChainDeviceOnline = false;
        try {
            const coldChainDeviceStatus = await new Promise((resolve) => {
                api.getDevicesStatus(vehicle.coldChainDeviceID).completed(resolve);
            });

            if (coldChainDeviceStatus.Status === 0 &&
                coldChainDeviceStatus.ResultObj &&
                coldChainDeviceStatus.ResultObj.length > 0) {
                coldChainDeviceOnline = coldChainDeviceStatus.ResultObj[0].IsOnline;
            }
        } catch (error) {
            console.warn(`冷链设备 ${vehicle.coldChainDeviceID} 连接测试失败:`, error);
            coldChainDeviceOnline = false;
        }

        vehicle.mainDeviceOnline = mainDeviceOnline;
        vehicle.coldChainDeviceOnline = coldChainDeviceOnline;
        vehicle.isConnected = true;

        // 只要有一个设备在线，车辆就显示为在线
        vehicle.status = (mainDeviceOnline || coldChainDeviceOnline) ? 'online' : 'offline';

        console.log(`车辆 ${vehicle.number} 连接测试完成 - 主设备: ${mainDeviceOnline ? '在线' : '离线'}, 冷链设备: ${coldChainDeviceOnline ? '在线' : '离线'}, 车辆状态: ${vehicle.status}`);

    } catch (error) {
        console.error(`车辆 ${vehicle.number} 连接测试失败:`, error);
        vehicle.isConnected = false;
        vehicle.mainDeviceOnline = false;
        vehicle.coldChainDeviceOnline = false;
        vehicle.status = 'offline';
    }
}

// 更新单个车辆的实时数据（核心逻辑：云平台可用时获取真实数据）
async function updateVehicleRealTimeData(vehicle) {
    if (!cloudPlatformAvailable) {
        // 云平台不可用，保持固定数据，但状态保持在线
        vehicle.r_temp = FIXED_DATA.temperature;
        vehicle.r_hum = FIXED_DATA.humidity;
        vehicle.r_co2 = FIXED_DATA.co2;
        vehicle.lastUpdate = '--';
        vehicle.status = 'online'; // 保持在线状态
        vehicle.mainDeviceOnline = true;
        vehicle.coldChainDeviceOnline = true;
        return;
    }

    try {
        // 获取设备状态
        let mainDeviceOnline = false;
        let coldChainDeviceOnline = false;

        // 获取主设备状态
        try {
            const mainDeviceStatus = await new Promise((resolve) => {
                api.getDevicesStatus(vehicle.mainDeviceID).completed(resolve);
            });

            if (mainDeviceStatus.Status === 0 &&
                mainDeviceStatus.ResultObj &&
                mainDeviceStatus.ResultObj.length > 0) {
                mainDeviceOnline = mainDeviceStatus.ResultObj[0].IsOnline;
            }
        } catch (error) {
            console.warn(`获取主设备 ${vehicle.mainDeviceID} 状态失败:`, error);
        }

        // 获取冷链设备状态
        try {
            const coldChainDeviceStatus = await new Promise((resolve) => {
                api.getDevicesStatus(vehicle.coldChainDeviceID).completed(resolve);
            });

            if (coldChainDeviceStatus.Status === 0 &&
                coldChainDeviceStatus.ResultObj &&
                coldChainDeviceStatus.ResultObj.length > 0) {
                coldChainDeviceOnline = coldChainDeviceStatus.ResultObj[0].IsOnline;
            }
        } catch (error) {
            console.warn(`获取冷链设备 ${vehicle.coldChainDeviceID} 状态失败:`, error);
        }

        vehicle.mainDeviceOnline = mainDeviceOnline;
        vehicle.coldChainDeviceOnline = coldChainDeviceOnline;

        // 只要有一个设备在线，车辆就显示为在线
        vehicle.status = (mainDeviceOnline || coldChainDeviceOnline) ? 'online' : 'offline';

        // 获取温湿度数据（从主设备）
        if (mainDeviceOnline) {
            const mainDeviceApiTags = [vehicle.sensorTags.temperature, vehicle.sensorTags.humidity].filter(tag => tag).join(',');

            if (mainDeviceApiTags) {
                try {
                    const mainDeviceSensorData = await new Promise((resolve) => {
                        api.getSensorData({
                            DeviceId: vehicle.mainDeviceID,
                            ApiTags: mainDeviceApiTags,
                            Method: 6,
                            TimeAgo: null,
                            Sort: 'DESC',
                            PageSize: 10,
                            PageIndex: 1
                        }).completed(resolve);
                    });

                    if (mainDeviceSensorData.Status === 0 && mainDeviceSensorData.ResultObj && mainDeviceSensorData.ResultObj.DataPoints) {
                        mainDeviceSensorData.ResultObj.DataPoints.forEach(point => {
                            if (point.PointDTO && point.PointDTO.length > 0) {
                                const value = point.PointDTO[0].Value;
                                const apiTag = point.ApiTag;

                                if (apiTag === vehicle.sensorTags.temperature) {
                                    vehicle.r_temp = value;
                                } else if (apiTag === vehicle.sensorTags.humidity) {
                                    vehicle.r_hum = value;
                                }
                            }
                        });
                    }
                } catch (error) {
                    console.warn(`获取主设备传感器数据失败:`, error);
                }
            }
        }

        // 获取CO2数据（从冷链设备）
        if (coldChainDeviceOnline) {
            try {
                const r_co2SensorData = await new Promise((resolve) => {
                    api.getSensorData({
                        DeviceId: vehicle.coldChainDeviceID,
                        ApiTags: vehicle.sensorTags.r_co2,
                        Method: 6,
                        TimeAgo: null,
                        Sort: 'DESC',
                        PageSize: 10,
                        PageIndex: 1
                    }).completed(resolve);
                });

                if (r_co2SensorData.Status === 0 && r_co2SensorData.ResultObj && r_co2SensorData.ResultObj.DataPoints) {
                    r_co2SensorData.ResultObj.DataPoints.forEach(point => {
                        if (point.PointDTO && point.PointDTO.length > 0) {
                            const value = point.PointDTO[0].Value;
                            if (point.ApiTag === vehicle.sensorTags.r_co2) {
                                vehicle.r_co2 = value;
                            }
                        }
                    });
                }
            } catch (error) {
                console.warn(`获取冷链设备CO2数据失败:`, error);
            }
        }

        // 更新最后更新时间
        if (mainDeviceOnline || coldChainDeviceOnline) {
            vehicle.lastUpdate = new Date().toLocaleString('zh-CN');
        } else {
            vehicle.lastUpdate = '--';
        }

        // 保存数据到数据库
        if (mainDeviceOnline || coldChainDeviceOnline) {
            saveVehicleDataToDatabase(vehicle);
        }

        if (mapLoaded && currentVehicleId === vehicle.id) {
            updateVehicleOnMap(vehicle);
        }
    } catch (error) {
        console.error(`更新车辆 ${vehicle.number} 数据失败:`, error);
        // 即使出错，也保持在线状态和固定数据
        vehicle.status = 'online';
        vehicle.r_temp = FIXED_DATA.temperature;
        vehicle.r_hum = FIXED_DATA.humidity;
        vehicle.r_co2 = FIXED_DATA.co2;
        vehicle.lastUpdate = '--';
    }
}

// 轮询所有车辆的数据
async function pollAllVehiclesData() {
    if (allVehicles.length === 0) return;

    for (let vehicle of allVehicles) {
        await updateVehicleRealTimeData(vehicle);
    }

    // 更新当前选中车辆的显示
    if (currentVehicleId) {
        const currentVehicle = allVehicles.find(v => v.id === currentVehicleId);
        if (currentVehicle) {
            selectVehicle(currentVehicleId);
        }
    }

    renderVehicleList();
}

function deleteVehicle(vehicleId, event) {
    event.stopPropagation();

    if (!confirm('确定要删除这辆车吗？此操作不可恢复。')) {
        return;
    }
    // 从地图移除标记
    const markerIndex = allVehicleMarkers.findIndex(m => m.vehicleId === vehicleId);
    if (markerIndex !== -1) {
        if (map && allVehicleMarkers[markerIndex].marker) {
            map.remove(allVehicleMarkers[markerIndex].marker);
        }
        allVehicleMarkers.splice(markerIndex, 1);
    }

    if (currentVehicleId === vehicleId) {
        currentVehicleId = null;
        document.getElementById('selected-vehicle').textContent = '未选择车辆';
        document.getElementById('r_temp-value').innerHTML = '--<span class="metric-unit">°C</span>';
        document.getElementById('r_hum-value').innerHTML = '--<span class="metric-unit">%</span>';
        document.getElementById('r_co2-value').innerHTML = '--<span class="metric-unit">ppm</span>';
        document.getElementById('update-time').textContent = '--';
        document.getElementById('update-location').textContent = '--';

        if (currentVehicleMarker) {
            map.remove(currentVehicleMarker);
            currentVehicleMarker = null;
        }

        if (r_tempChart) {
            r_tempChart.destroy();
            r_tempChart = null;
        }
        if (r_humChart) {
            r_humChart.destroy();
            r_humChart = null;
        }
        if (r_co2Chart) {
            r_co2Chart.destroy();
            r_co2Chart = null;
        }

        // 更新设备状态显示
        document.getElementById('main-device-status').textContent = '未连接';
        document.getElementById('main-device-status').style.color = '#ff2a6d';
        document.getElementById('coldchain-device-status').textContent = '未连接';
        document.getElementById('coldchain-device-status').style.color = '#ff2a6d';
    }

    // 从数据库删除
    deleteVehicleConfigFromDatabase(vehicleId);
    
    allVehicles = allVehicles.filter(v => v.id !== vehicleId);
    saveVehiclesToLocalStorage();
    renderVehicleList();

    alert('车辆删除成功！');
}

// 从数据库删除车辆配置
async function deleteVehicleConfigFromDatabase(vehicleId) {
    try {
        await fetch(`${API_BASE}/vehicle/config/${vehicleId}`, {
            method: 'DELETE'
        });
        console.log(`车辆 ${vehicleId} 配置已从数据库删除`);
    } catch (error) {
        console.error('从数据库删除车辆配置失败:', error);
    }
}

function showRegisterForm() {
    document.getElementById('registerForm').style.display = 'block';
}

function hideRegisterForm() {
    document.getElementById('registerForm').style.display = 'none';
}

function saveVehiclesToLocalStorage() {
    // 只保存必要的信息，不保存运行时状态
    const vehiclesToSave = allVehicles.map(vehicle => ({
        id: vehicle.id,
        number: vehicle.number,
        mainDeviceID: vehicle.mainDeviceID,
        coldChainDeviceID: vehicle.coldChainDeviceID,
        sensorTags: vehicle.sensorTags,
        location: vehicle.location,
        coords: vehicle.coords
    }));
    localStorage.setItem('coldChainVehicles', JSON.stringify(vehiclesToSave));
}

function renderVehicleList(vehiclesToRender = allVehicles) {
    const vehicleList = document.getElementById('vehicle-list');

    if (vehiclesToRender.length === 0) {
        vehicleList.innerHTML = '<div class="loading">暂无车辆，请先注册车辆</div>';
        return;
    }

    vehicleList.innerHTML = '';

    vehiclesToRender.forEach(vehicle => {
        const vehicleCard = document.createElement('div');
        vehicleCard.className = `vehicle-card ${currentVehicleId === vehicle.id ? 'active' : ''}`;
        vehicleCard.onclick = () => selectVehicle(vehicle.id);

        // 显示连接状态
        let connectionStatus = '在线'; // 默认显示在线
        if (initialVehicleCheckCompleted) {
            if (vehicle.status === 'online') {
                connectionStatus = '在线';
            } else {
                connectionStatus = '离线';
            }
        }

        vehicleCard.innerHTML = `
            <div class="vehicle-info">
                <span class="vehicle-number">${vehicle.number}</span>
                <span class="vehicle-status status-${vehicle.status}">
                    ${connectionStatus}
                </span>
            </div>
            <div class="vehicle-details">
                <div>🌡️ ${vehicle.r_temp !== null ? vehicle.r_temp + '°C' : '--'}</div>
                <div>💧 ${vehicle.r_hum !== null ? vehicle.r_hum + '%' : '--'}</div>
                <div>🌫 ${vehicle.r_co2 !== null ? vehicle.r_co2 + 'ppm' : '--'}</div>
                <div>📍 ${vehicle.location}</div>
                <div>🕒 ${vehicle.lastUpdate || '--'}</div>
            </div>
            <div class="vehicle-actions">
                <button class="btn btn-danger btn-small" onclick="deleteVehicle('${vehicle.id}', event)">删除</button>
            </div>
        `;

        vehicleList.appendChild(vehicleCard);
    });
}

async function selectVehicle(vehicleId) {
    currentVehicleId = vehicleId;
    const vehicle = allVehicles.find(v => v.id === vehicleId);

    if (!vehicle) return;

    // 重置历史数据数组
    r_tempHistory = [];
    r_humHistory = [];
    r_co2History = [];

    // 添加当前数据点到历史数组
    if (vehicle.r_temp !== null && vehicle.r_temp !== undefined) {
        r_tempHistory.push(parseFloat(vehicle.r_temp));
    }
    if (vehicle.r_hum !== null && vehicle.r_hum !== undefined) {
        r_humHistory.push(parseFloat(vehicle.r_hum));
    }
    if (vehicle.r_co2 !== null && vehicle.r_co2 !== undefined) {
        r_co2History.push(parseFloat(vehicle.r_co2));
    }

    console.log('Selected vehicle:', vehicle);
    console.log('r_temp:', vehicle.r_temp, 'r_hum:', vehicle.r_hum, 'r_co2:', vehicle.r_co2);
    console.log('History arrays - temp:', r_tempHistory, 'hum:', r_humHistory, 'co2:', r_co2History);

    document.getElementById('selected-vehicle').textContent = vehicle.number;
    document.getElementById('r_temp-value').innerHTML =
        vehicle.r_temp !== null ? vehicle.r_temp + '<span class="metric-unit">°C</span>' : '--<span class="metric-unit">°C</span>';
    document.getElementById('r_hum-value').innerHTML =
        vehicle.r_hum !== null ? vehicle.r_hum + '<span class="metric-unit">%</span>' : '--<span class="metric-unit">%</span>';
    document.getElementById('r_co2-value').innerHTML =
        vehicle.r_co2 !== null ? vehicle.r_co2 + '<span class="metric-unit">ppm</span>' : '--<span class="metric-unit">ppm</span>';
    document.getElementById('update-time').textContent = vehicle.lastUpdate || '--';
    document.getElementById('update-location').textContent = vehicle.location || '--';

    updateStatusIndicators(vehicle);

    // 更新设备状态显示
    if (vehicle.isConnected) {
        document.getElementById('main-device-status').textContent = vehicle.mainDeviceOnline ? '在线' : '离线';
        document.getElementById('main-device-status').style.color = vehicle.mainDeviceOnline ? '#00ff9d' : '#ffaa00';
        document.getElementById('coldchain-device-status').textContent = vehicle.coldChainDeviceOnline ? '在线' : '离线';
        document.getElementById('coldchain-device-status').style.color = vehicle.coldChainDeviceOnline ? '#00ff9d' : '#ffaa00';
    } else {
        document.getElementById('main-device-status').textContent = '未连接';
        document.getElementById('main-device-status').style.color = '#ff2a6d';
        document.getElementById('coldchain-device-status').textContent = '未连接';
        document.getElementById('coldchain-device-status').style.color = '#ff2a6d';
    }

    if (mapLoaded) {
        updateVehicleOnMap(vehicle);
    }

    await updateRealTimeChart(vehicle);
    renderVehicleList();
}

// 高德地图初始化函数（完全重写，确保加载提示消失）
function initMap() {
    try {
        // 创建地图实例
        map = new AMap.Map('map-container', {
            zoom: 12,
            center: [108.706, 34.341],
            viewMode: '3D',
            rotateEnable: true,
            pitchEnable: true,
            pitch: 0,
            rotation: 0,
            zooms: [2, 20],
            expandZoomRange: true
        });

        // 添加地图控件
        map.addControl(new AMap.Scale({ visible: true }));
        map.addControl(new AMap.ToolBar({ visible: true }));
        map.addControl(new AMap.HawkEye({ visible: true }));
        map.addControl(new AMap.Geolocation({
            enableHighAccuracy: true,
            timeout: 10000,
            buttonOffset: new AMap.Pixel(10, 20),
            zoomToAccuracy: true,
            buttonPosition: 'RB'
        }));

        // 方法1: 监听地图视图改变事件（最可靠）
        map.on('viewchange', function() {
            if (!mapLoaded) {
                hideMapLoading();
            }
        });

        // 方法2: 监听地图移动结束事件
        map.on('moveend', function() {
            if (!mapLoaded) {
                hideMapLoading();
            }
        });

        // 方法3: 监听地图缩放结束事件
        map.on('zoomend', function() {
            if (!mapLoaded) {
                hideMapLoading();
            }
        });

        // 方法4: 使用 setTimeout 强制隐藏（兜底方案）
        setTimeout(function() {
            if (!mapLoaded) {
                hideMapLoading();
                console.log('地图加载超时，强制隐藏加载提示');
            }
        }, 3000);

    } catch (error) {
        console.error('地图初始化失败:', error);
        hideMapLoading();
    }
}

// 隐藏地图加载提示的统一函数
function hideMapLoading() {
    if (!mapLoaded) {
        try {
            const loadingElement = document.getElementById('mapLoading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
            mapLoaded = true;

            // 如果有选中的车辆，立即更新地图
            if (currentVehicleId) {
                const vehicle = allVehicles.find(v => v.id === currentVehicleId);
                if (vehicle) {
                    updateVehicleOnMap(vehicle);
                }
            }

            console.log('地图加载完成，加载提示已隐藏');
        } catch (error) {
            console.error('隐藏地图加载提示失败:', error);
        }
    }
}

// 切换地图类型函数（高德地图）
function changeMapType() {
    const selectElement = document.getElementById('mapTypeSelect');
    const mapType = selectElement.value;

    if (map) {
        switch(mapType) {
            case 'normal':
                map.setMapStyle('normal');
                break;
            case 'satellite':
                map.setMapStyle('satellite');
                break;
            case 'terrain':
                map.setMapStyle('normal');
                break;
        }
    }
}

// 更新车辆在地图上的位置（高德地图版本）
function updateVehicleOnMap(vehicle) {
    if (currentVehicleMarker) {
        map.remove(currentVehicleMarker);
        currentVehicleMarker = null;
    }

    if (vehicle.coords) {
        const position = [vehicle.coords.lng, vehicle.coords.lat];

        let vehicleIconUrl;
        if (vehicle.status === 'online') {
            vehicleIconUrl = "https://img.icons8.com/fluency/96/00ff9d/truck.png";
        } else {
            vehicleIconUrl = "https://img.icons8.com/fluency/96/ffaa00/truck.png";
        }

        currentVehicleMarker = new AMap.Marker({
            position: position,
            icon: new AMap.Icon({
                image: vehicleIconUrl,
                size: new AMap.Size(40, 40),
                imageSize: new AMap.Size(40, 40)
            }),
            offset: new AMap.Pixel(-20, -40),
            title: vehicle.number
        });

        const infoWindow = new AMap.InfoWindow({
            content: `
                <div style="color: #333; font-weight: 600; min-width: 220px;">
                    <strong>${vehicle.number}</strong><br>
                    📡 主设备: ${vehicle.mainDeviceID}<br>
                    📡 冷链设备: ${vehicle.coldChainDeviceID}<br>
                    🌡️ 温度: ${vehicle.r_temp || '--'}°C<br>
                    💧 湿度: ${vehicle.r_hum || '--'}%<br>
                    🌫 CO2: ${vehicle.r_co2 || '--'}ppm<br>
                    📍 状态: ${vehicle.status === 'online' ? '在线' : '离线'}<br>
                    🕒 更新: ${vehicle.lastUpdate || '--'}
                </div>
            `,
            offset: new AMap.Pixel(0, -30)
        });

        currentVehicleMarker.on('click', function() {
            infoWindow.open(map, position);
        });

        map.add(currentVehicleMarker);
        map.panTo(position);
    }
}

// 为车辆在地图上添加标记（高德地图版本）
function addVehicleMarkerToMap(vehicle) {
    if (!vehicle.coords) return;

    const position = [vehicle.coords.lng, vehicle.coords.lat];

    const svgContent = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
            <circle cx="12" cy="12" r="8" fill="#00ff9d" stroke="#007a4d" stroke-width="2"/>
        </svg>
    `;

    const svgUrl = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgContent);

    const marker = new AMap.Marker({
        position: position,
        icon: new AMap.Icon({
            image: svgUrl,
            size: new AMap.Size(24, 24),
            imageSize: new AMap.Size(24, 24)
        }),
        offset: new AMap.Pixel(-12, -12),
        title: vehicle.number
    });

    const infoWindow = new AMap.InfoWindow({
        content: `
            <div style="color: #333; font-weight: 600; min-width: 200px;">
                <strong>${vehicle.number}</strong><br>
                📍 ${vehicle.location || '未知位置'}<br>
                🕒 注册时间: ${new Date().toLocaleString('zh-CN')}
            </div>
        `,
        offset: new AMap.Pixel(0, -15)
    });

    marker.on('click', function() {
        infoWindow.open(map, position);
    });

    map.add(marker);
    allVehicleMarkers.push({
        vehicleId: vehicle.id,
        marker: marker
    });

    if (allVehicles.length === 1) {
        map.panTo(position);
    }
}

function updateStatusIndicators(vehicle) {
    const tempStatus = document.getElementById('r_temp-status');
    if (vehicle.r_temp === null) {
        tempStatus.textContent = '无数据';
        tempStatus.className = 'metric-status status-alert';
    } else if (vehicle.r_temp >= 7 && vehicle.r_temp <= 10) {
        tempStatus.textContent = '正常';
        tempStatus.className = 'metric-status status-normal';
    } else {
        tempStatus.textContent = '异常';
        tempStatus.className = 'metric-status status-alert';
    }

    const humidityStatus = document.getElementById('r_hum-status');
    if (vehicle.r_hum === null) {
        humidityStatus.textContent = '无数据';
        humidityStatus.className = 'metric-status status-alert';
    } else if (vehicle.r_hum >= 90 && vehicle.r_hum <= 100) {
        humidityStatus.textContent = '正常';
        humidityStatus.className = 'metric-status status-normal';
    } else {
        humidityStatus.textContent = '异常';
        humidityStatus.className = 'metric-status status-warning';
    }

    const r_co2Status = document.getElementById('r_co2-status');
    if (vehicle.r_co2 === null) {
        r_co2Status.textContent = '无数据';
        r_co2Status.className = 'metric-status status-alert';
    } else if (vehicle.r_co2 >= 300 && vehicle.r_co2 <= 30000) {
        r_co2Status.textContent = '正常';
        r_co2Status.className = 'metric-status status-normal';
    } else {
        r_co2Status.textContent = '异常';
        r_co2Status.className = 'metric-status status-warning';
    }
}

async function updateRealTimeChart(vehicle) {
    // 更新温度图表
    updateTempChart(vehicle);
    // 更新湿度图表
    updateHumChart(vehicle);
    // 更新CO2图表
    updateCo2Chart(vehicle);
}

function updateTempChart(vehicle) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }
    
    const canvas = document.getElementById('r_temp-chart');
    if (!canvas) {
        console.error('r_temp-chart canvas not found');
        return;
    }
    const ctx = canvas.getContext('2d');

    if (r_tempChart) {
        r_tempChart.destroy();
    }

    // 检查数据是否存在（包括0值）
    if (vehicle.r_temp === null || vehicle.r_temp === undefined) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('暂无温度数据', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const currentTemp = parseFloat(vehicle.r_temp);
    r_tempHistory.push(currentTemp);

    if (r_tempHistory.length > 20) {
        r_tempHistory.shift();
    }

    const labels = [];
    for (let i = 0; i < r_tempHistory.length; i++) {
        const time = new Date(Date.now() - (r_tempHistory.length - i - 1) * CLOUD_CONFIG.pollingInterval);
        labels.push(time.getMinutes() + ':' + time.getSeconds().toString().padStart(2, '0'));
    }

    r_tempChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '冷链温度 (°C)',
                data: r_tempHistory,
                borderColor: '#ff7e5e',
                backgroundColor: 'rgba(255, 126, 94, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#ff7e5e',
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

function updateHumChart(vehicle) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }
    
    const canvas = document.getElementById('r_hum-chart');
    if (!canvas) {
        console.error('r_hum-chart canvas not found');
        return;
    }
    const ctx = canvas.getContext('2d');

    if (r_humChart) {
        r_humChart.destroy();
    }

    // 检查数据是否存在（包括0值）
    if (vehicle.r_hum === null || vehicle.r_hum === undefined) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('暂无湿度数据', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const currentHum = parseFloat(vehicle.r_hum);
    r_humHistory.push(currentHum);

    if (r_humHistory.length > 20) {
        r_humHistory.shift();
    }

    const labels = [];
    for (let i = 0; i < r_humHistory.length; i++) {
        const time = new Date(Date.now() - (r_humHistory.length - i - 1) * CLOUD_CONFIG.pollingInterval);
        labels.push(time.getMinutes() + ':' + time.getSeconds().toString().padStart(2, '0'));
    }

    r_humChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: '冷链湿度 (%)',
                data: r_humHistory,
                borderColor: '#00f5ff',
                backgroundColor: 'rgba(0, 245, 255, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#00f5ff',
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

function updateCo2Chart(vehicle) {
    if (typeof Chart === 'undefined') {
        console.error('Chart.js not loaded');
        return;
    }
    
    const canvas = document.getElementById('r_co2-chart');
    if (!canvas) {
        console.error('r_co2-chart canvas not found');
        return;
    }
    const ctx = canvas.getContext('2d');

    if (r_co2Chart) {
        r_co2Chart.destroy();
    }

    // 检查数据是否存在（包括0值）
    if (vehicle.r_co2 === null || vehicle.r_co2 === undefined) {
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '14px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('暂无CO2数据', ctx.canvas.width / 2, ctx.canvas.height / 2);
        return;
    }

    const currentCo2 = parseFloat(vehicle.r_co2);
    r_co2History.push(currentCo2);

    if (r_co2History.length > 20) {
        r_co2History.shift();
    }

    const labels = [];
    for (let i = 0; i < r_co2History.length; i++) {
        const time = new Date(Date.now() - (r_co2History.length - i - 1) * CLOUD_CONFIG.pollingInterval);
        labels.push(time.getMinutes() + ':' + time.getSeconds().toString().padStart(2, '0'));
    }

    r_co2Chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'CO2浓度 (ppm)',
                data: r_co2History,
                borderColor: '#7e42ff',
                backgroundColor: 'rgba(126, 66, 255, 0.1)',
                borderWidth: 3,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#7e42ff',
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

function centerOnVehicle() {
    if (currentVehicleMarker) {
        const position = currentVehicleMarker.getPosition();
        map.panTo(position);
    }
}

function filterVehicles() {
    const searchTerm = document.getElementById('vehicle-search').value.toLowerCase();
    const filteredVehicles = allVehicles.filter(vehicle =>
        vehicle.number.toLowerCase().includes(searchTerm) ||
        (vehicle.location && vehicle.location.toLowerCase().includes(searchTerm))
    );
    renderVehicleList(filteredVehicles);
}

// 保存冷链车辆数据到数据库
async function saveVehicleDataToDatabase(vehicle) {
    try {
        // 保存温度数据
        if (vehicle.r_temp !== null && vehicle.r_temp !== undefined) {
            await fetch(`${API_BASE}/sensor/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: vehicle.coldChainDeviceID,
                    sensor_type: 'r_temp',
                    sensor_name: '冷链运输区温度',
                    value: vehicle.r_temp,
                    unit: '°C',
                    location: '冷链区'
                })
            });
        }

        // 保存湿度数据
        if (vehicle.r_hum !== null && vehicle.r_hum !== undefined) {
            await fetch(`${API_BASE}/sensor/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: vehicle.coldChainDeviceID,
                    sensor_type: 'r_hum',
                    sensor_name: '冷链运输区湿度',
                    value: vehicle.r_hum,
                    unit: '%',
                    location: '冷链区'
                })
            });
        }

        // 保存CO2数据
        if (vehicle.r_co2 !== null && vehicle.r_co2 !== undefined) {
            await fetch(`${API_BASE}/sensor/data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    device_id: vehicle.mainDeviceID,
                    sensor_type: 'r_co2',
                    sensor_name: 'CO2浓度',
                    value: vehicle.r_co2,
                    unit: 'ppm',
                    location: '冷链区'
                })
            });
        }

        // 保存车辆数据
        await fetch(`${API_BASE}/vehicle/data`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                vehicle_id: vehicle.id,
                vehicle_number: vehicle.number,
                location_latitude: vehicle.coords ? vehicle.coords.lat : null,
                location_longitude: vehicle.coords ? vehicle.coords.lng : null,
                location_address: vehicle.location,
                temperature: vehicle.r_temp,
                humidity: vehicle.r_hum,
                co2_level: vehicle.r_co2,
                door_status: 'closed',
                main_device_status: vehicle.mainDeviceOnline ? 'online' : 'offline',
                coldchain_device_status: vehicle.coldChainDeviceOnline ? 'online' : 'offline'
            })
        });

        console.log(`车辆 ${vehicle.number} 数据已保存到数据库`);
    } catch (error) {
        console.error('保存车辆数据到数据库失败:', error);
    }
}

function updateCurrentTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString();
    const dateString = now.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
    });

    document.getElementById('currentTime').textContent = timeString;
    document.getElementById('currentDate').textContent = dateString;
}

// 导出必要的函数供HTML调用
window.showRegisterForm = showRegisterForm;
window.hideRegisterForm = hideRegisterForm;
window.registerAndConnectVehicle = registerAndConnectVehicle;
window.selectVehicle = selectVehicle;
window.changeMapType = changeMapType;
window.centerOnVehicle = centerOnVehicle;
window.filterVehicles = filterVehicles;
window.deleteVehicle = deleteVehicle;
window.init = init;

// 注意：DOMContentLoaded 监听器已移至文件头部（加载顺序：拉取配置 → 加载高德地图 → 初始化）

// 手动刷新车辆列表
window.refreshVehicleList = async function() {
    console.log('🔄 手动刷新车辆列表...');
    const vehicleList = document.getElementById('vehicle-list');
    if (vehicleList) {
        vehicleList.innerHTML = '<div class="loading">正在刷新车辆配置...</div>';
    }
    
    try {
        const response = await fetch(`${API_BASE}/vehicle/configs`);
        console.log('   响应状态:', response.status);
        
        const result = await response.json();
        console.log('   返回结果:', result);
        
        if (result.success && result.data && result.data.length > 0) {
            allVehicles = result.data.map(config => ({
                id: config.id,
                number: config.number,
                mainDeviceID: config.mainDeviceID,
                coldChainDeviceID: config.coldChainDeviceID,
                sensorTags: config.sensorTags || {
                    r_co2: 'r_co2',
                    temperature: 'r_temp',
                    humidity: 'r_hum'
                },
                location: config.location || '陕西省咸阳市秦都区',
                coords: config.coords || {lng: 108.706, lat: 34.341},
                isConnected: true,
                mainDeviceOnline: true,
                coldChainDeviceOnline: true,
                status: 'online',
                r_temp: FIXED_DATA.temperature,
                r_hum: FIXED_DATA.humidity,
                r_co2: FIXED_DATA.co2,
                lastUpdate: '--'
            }));
            console.log('✅ 刷新成功，共', allVehicles.length, '辆车辆');
        } else {
            allVehicles = [];
            console.log('⚠️  没有找到车辆配置');
        }
        
        renderVehicleList();
    } catch (error) {
        console.error('❌ 刷新失败:', error);
        if (vehicleList) {
            vehicleList.innerHTML = '<div class="loading">刷新失败: ' + error.message + '</div>';
        }
    }
}
