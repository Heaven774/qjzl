// 数据库初始化和测试数据生成脚本
const mysql = require('mysql2/promise');
const dbConfig = {
    socketPath: '/var/lib/mysql/mysql.sock',
    user: 'root',
    password: '',
    charset: 'utf8mb4'
};

async function initDatabase() {
    console.log('🚀 开始初始化数据库...\n');
    
    let connection;
    try {
        // 1. 连接 MySQL
        console.log('1️⃣  连接到 MySQL...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 连接成功！\n');
        
        // 2. 创建数据库
        console.log('2️⃣  创建数据库 qjzl...');
        await connection.query('CREATE DATABASE IF NOT EXISTS qjzl DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        await connection.query('USE qjzl');
        console.log('✅ 数据库创建成功！\n');
        
        // 3. 创建表
        console.log('3️⃣  创建数据表...');
        
        // 传感器数据表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS sensor_data (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                device_id VARCHAR(50) NOT NULL COMMENT '设备ID',
                sensor_type VARCHAR(50) NOT NULL COMMENT '传感器类型',
                sensor_name VARCHAR(100) NOT NULL COMMENT '传感器名称',
                value DECIMAL(10, 2) NOT NULL COMMENT '传感器数值',
                unit VARCHAR(20) DEFAULT NULL COMMENT '单位',
                location VARCHAR(50) NOT NULL COMMENT '位置',
                record_time DATETIME NOT NULL COMMENT '记录时间',
                timestamp BIGINT NOT NULL COMMENT '时间戳',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                INDEX idx_device_id (device_id),
                INDEX idx_sensor_type (sensor_type),
                INDEX idx_record_time (record_time),
                INDEX idx_location (location)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='传感器数据表'
        `);
        
        // 设备状态历史表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS device_status_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                device_id VARCHAR(50) NOT NULL COMMENT '设备ID',
                device_name VARCHAR(100) NOT NULL COMMENT '设备名称',
                status VARCHAR(20) NOT NULL COMMENT '状态',
                action VARCHAR(50) DEFAULT NULL COMMENT '操作',
                location VARCHAR(50) NOT NULL COMMENT '位置',
                record_time DATETIME NOT NULL COMMENT '记录时间',
                timestamp BIGINT NOT NULL COMMENT '时间戳',
                details TEXT DEFAULT NULL COMMENT '详细信息',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                INDEX idx_device_id (device_id),
                INDEX idx_status (status),
                INDEX idx_record_time (record_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备状态历史表'
        `);
        
        // 登录记录表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS login_logs (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                user_id VARCHAR(50) DEFAULT NULL COMMENT '用户ID',
                username VARCHAR(100) NOT NULL COMMENT '用户名',
                login_time DATETIME NOT NULL COMMENT '登录时间',
                logout_time DATETIME DEFAULT NULL COMMENT '退出时间',
                ip_address VARCHAR(50) DEFAULT NULL COMMENT 'IP地址',
                user_agent TEXT DEFAULT NULL COMMENT '浏览器信息',
                status VARCHAR(20) NOT NULL COMMENT '状态',
                failure_reason TEXT DEFAULT NULL COMMENT '失败原因',
                session_id VARCHAR(100) DEFAULT NULL COMMENT '会话ID',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                INDEX idx_username (username),
                INDEX idx_login_time (login_time),
                INDEX idx_status (status)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录记录表'
        `);
        
        // AI分析历史表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS ai_analysis_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                analysis_type VARCHAR(50) NOT NULL COMMENT '分析类型',
                environment_assessment TEXT DEFAULT NULL COMMENT '环境评估',
                risk_level VARCHAR(20) DEFAULT NULL COMMENT '风险等级',
                predictions TEXT DEFAULT NULL COMMENT '趋势预测',
                suggestions TEXT DEFAULT NULL COMMENT '优化建议',
                sensor_snapshot TEXT DEFAULT NULL COMMENT '传感器数据快照',
                analysis_time DATETIME NOT NULL COMMENT '分析时间',
                timestamp BIGINT NOT NULL COMMENT '时间戳',
                model_version VARCHAR(50) DEFAULT NULL COMMENT '模型版本',
                confidence_score DECIMAL(5, 2) DEFAULT NULL COMMENT '置信度',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                INDEX idx_analysis_type (analysis_type),
                INDEX idx_analysis_time (analysis_time),
                INDEX idx_risk_level (risk_level)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI分析历史表'
        `);
        
        // 运输车辆数据表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS vehicle_data (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                vehicle_id VARCHAR(50) NOT NULL COMMENT '车辆ID',
                vehicle_number VARCHAR(50) NOT NULL COMMENT '车牌号',
                location_latitude DECIMAL(10, 7) DEFAULT NULL COMMENT '纬度',
                location_longitude DECIMAL(10, 7) DEFAULT NULL COMMENT '经度',
                location_address TEXT DEFAULT NULL COMMENT '地址描述',
                temperature DECIMAL(5, 2) DEFAULT NULL COMMENT '温度',
                humidity DECIMAL(5, 2) DEFAULT NULL COMMENT '湿度',
                co2_level DECIMAL(8, 2) DEFAULT NULL COMMENT 'CO2浓度',
                door_status VARCHAR(20) DEFAULT NULL COMMENT '车门状态',
                main_device_status VARCHAR(20) DEFAULT NULL COMMENT '主设备状态',
                coldchain_device_status VARCHAR(20) DEFAULT NULL COMMENT '冷链设备状态',
                record_time DATETIME NOT NULL COMMENT '记录时间',
                timestamp BIGINT NOT NULL COMMENT '时间戳',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                INDEX idx_vehicle_id (vehicle_id),
                INDEX idx_vehicle_number (vehicle_number),
                INDEX idx_record_time (record_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运输车辆数据表'
        `);
        
        // 系统操作日志表
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS system_logs (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                log_type VARCHAR(50) NOT NULL COMMENT '日志类型',
                module VARCHAR(100) DEFAULT NULL COMMENT '模块',
                action VARCHAR(100) DEFAULT NULL COMMENT '操作',
                message TEXT NOT NULL COMMENT '日志消息',
                details TEXT DEFAULT NULL COMMENT '详细信息',
                user_id VARCHAR(50) DEFAULT NULL COMMENT '操作用户ID',
                record_time DATETIME NOT NULL COMMENT '记录时间',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                INDEX idx_log_type (log_type),
                INDEX idx_module (module),
                INDEX idx_record_time (record_time)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统操作日志表'
        `);
        
        console.log('✅ 数据表创建成功！\n');
        
        console.log('🎉 数据库初始化完成！');
        console.log('\n📊 现在可以启动服务器了：');
        console.log('   npm start');
        
    } catch (error) {
        console.error('❌ 错误:', error.message);
        console.log('\n💡 提示：请确保 MySQL 服务已启动，用户名密码配置正确！');
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

async function generateTestData(connection) {
    const now = new Date();
    const nowTimestamp = now.getTime();
    
    // 生成传感器数据（过去24小时，每小时一条）
    console.log('   - 生成传感器数据...');
    const sensorTypes = [
        { type: 'temperature', name: '温度', unit: '°C', locations: ['幼苗区', '种植区', '冷链区'] },
        { type: 'humidity', name: '湿度', unit: '%', locations: ['幼苗区', '种植区', '冷链区'] },
        { type: 'light', name: '光照', unit: 'lux', locations: ['幼苗区', '种植区'] },
        { type: 'soil_ph', name: '土壤PH', unit: '', locations: ['种植区'] },
        { type: 'co2', name: 'CO2', unit: 'ppm', locations: ['冷链区'] }
    ];
    
    for (let i = 0; i < 24; i++) {
        const recordTime = new Date(now.getTime() - i * 3600000);
        const timestamp = recordTime.getTime();
        
        for (const sensor of sensorTypes) {
            for (const location of sensor.locations) {
                let value;
                if (sensor.type === 'temperature') {
                    value = location === '冷链区' ? (2 + Math.random() * 6) : (20 + Math.random() * 10);
                } else if (sensor.type === 'humidity') {
                    value = 60 + Math.random() * 30;
                } else if (sensor.type === 'light') {
                    value = 5000 + Math.random() * 15000;
                } else if (sensor.type === 'soil_ph') {
                    value = 6 + Math.random() * 2;
                } else if (sensor.type === 'co2') {
                    value = 400 + Math.random() * 200;
                }
                
                await connection.execute(
                    `INSERT INTO sensor_data (device_id, sensor_type, sensor_name, value, unit, location, record_time, timestamp) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    ['DEV001', sensor.type, sensor.name, value, sensor.unit, location, recordTime, timestamp]
                );
            }
        }
    }
    
    // 生成设备状态数据
    console.log('   - 生成设备状态数据...');
    const devices = [
        { id: 'LIGHT001', name: '幼苗区补光灯', location: '幼苗区' },
        { id: 'FAN001', name: '幼苗区通风扇', location: '幼苗区' },
        { id: 'PUMP001', name: '蓄水区水泵', location: '蓄水区' },
        { id: 'HEATER001', name: '烘干区烘干灯', location: '烘干区' },
        { id: 'COOLER001', name: '冷链区制冷机', location: '冷链区' }
    ];
    
    for (const device of devices) {
        for (let i = 0; i < 5; i++) {
            const recordTime = new Date(now.getTime() - i * 3600000 * 4);
            await connection.execute(
                `INSERT INTO device_status_history (device_id, device_name, status, action, location, record_time, timestamp) 
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [device.id, device.name, i === 0 ? 'online' : (Math.random() > 0.3 ? 'online' : 'offline'), 
                 i === 0 ? 'start' : 'check', device.location, recordTime, recordTime.getTime()]
            );
        }
    }
    
    // 生成登录日志
    console.log('   - 生成登录日志...');
    const users = ['admin', 'operator1', 'manager'];
    for (const user of users) {
        for (let i = 0; i < 3; i++) {
            const loginTime = new Date(now.getTime() - i * 3600000 * 8);
            await connection.execute(
                `INSERT INTO login_logs (user_id, username, login_time, ip_address, status) 
                 VALUES (?, ?, ?, ?, ?)`,
                ['USER_' + user.toUpperCase(), user, loginTime, '192.168.1.' + Math.floor(Math.random() * 255), 'success']
            );
        }
    }
    
    // 生成AI分析数据
    console.log('   - 生成AI分析数据...');
    const riskLevels = ['low', 'medium', 'low', 'low', 'medium'];
    const assessments = ['环境适宜，生长条件良好', '温度略高，建议加强通风', '湿度适中，光照充足', '各项指标正常', '注意监测土壤湿度'];
    
    for (let i = 0; i < 5; i++) {
        const analysisTime = new Date(now.getTime() - i * 3600000 * 6);
        await connection.execute(
            `INSERT INTO ai_analysis_history (analysis_type, environment_assessment, risk_level, predictions, suggestions, analysis_time, timestamp, confidence_score) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            ['prediction', assessments[i], riskLevels[i], 
             JSON.stringify(['未来24小时温度稳定', '湿度将小幅上升']),
             JSON.stringify(['保持当前通风', '注意适量灌溉']),
             analysisTime, analysisTime.getTime(), 85 + Math.random() * 10]
        );
    }
    
    // 生成车辆数据
    console.log('   - 生成车辆数据...');
    const vehicles = [
        { id: 'VH001', number: '陕A88888' },
        { id: 'VH002', number: '陕B66666' }
    ];
    
    for (const vehicle of vehicles) {
        for (let i = 0; i < 10; i++) {
            const recordTime = new Date(now.getTime() - i * 1800000);
            await connection.execute(
                `INSERT INTO vehicle_data (vehicle_id, vehicle_number, location_latitude, location_longitude, location_address, temperature, humidity, co2_level, door_status, main_device_status, coldchain_device_status, record_time, timestamp) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [vehicle.id, vehicle.number, 
                 34.2 + Math.random() * 0.1, 108.9 + Math.random() * 0.1, 
                 '陕西省西安市' + (i === 0 ? '未央区' : '沿途'),
                 3 + Math.random() * 4, 85 + Math.random() * 10, 500 + Math.random() * 300,
                 'closed', 'online', 'online', recordTime, recordTime.getTime()]
            );
        }
    }
    
    // 生成系统日志
    console.log('   - 生成系统日志...');
    const logTypes = ['info', 'info', 'warning', 'info', 'error'];
    const messages = ['系统启动成功', '数据同步完成', '传感器数据异常波动', '用户登录成功', '设备通讯超时'];
    
    for (let i = 0; i < 10; i++) {
        const recordTime = new Date(now.getTime() - i * 7200000);
        await connection.execute(
            `INSERT INTO system_logs (log_type, module, action, message, record_time) 
             VALUES (?, ?, ?, ?, ?)`,
            [logTypes[i % 5], 'System', 'operation', messages[i % 5], recordTime]
        );
    }
}

initDatabase();
