const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000 ;

// 中间件 - 配置 CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 处理预请求
app.options('*', cors());

app.use(bodyParser.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// 添加响应头
app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    next();
});

// 调试日志中间件
app.use((req, res, next) => {
    console.log(`📡 请求: ${req.method} ${req.path}`);
    console.log(`   来源: ${req.headers['referer'] || 'unknown'}`);
    console.log(`   IP: ${req.ip}`);
    next();
});

// 数据库配置 - Windows 系统使用 TCP 连接
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'qjzl',
    charset: 'utf8mb4',
    timezone: '+08:00'  // 设置时区为东八区（北京时间）
};

// 创建数据库连接池
let pool = null;
let dbConnected = false;

async function initDatabase() {
    console.log('🔍 正在尝试连接数据库...');
    console.log('📋 配置信息:');
    console.log('   主机:', dbConfig.host);
    console.log('   用户:', dbConfig.user);
    console.log('   数据库:', dbConfig.database);
    
    try {
        pool = mysql.createPool({
            ...dbConfig,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
        
        // 测试连接
        const [rows] = await pool.query('SELECT 1 as test');
        console.log('✅ 数据库测试查询成功:', rows[0]);
        
        dbConnected = true;
        console.log('✅ 数据库连接成功！');
        
        // 自动创建表
        await createTables();
        
    } catch (error) {
        dbConnected = false;
        console.error('❌ 数据库连接失败!');
        console.error('   错误信息:', error.message);
        console.error('   错误代码:', error.code);
        console.error('   错误状态:', error.sqlState);
        console.log('\n💡 请检查:');
        console.log('   1. MySQL 服务是否启动?');
        console.log('   2. 用户名/密码是否正确?');
        console.log('   3. 数据库 qjzl 是否已创建?');
        console.log('   4. 查看 TROUBLESHOOT.md 获取更多帮助\n');
    }
}

async function createTables() {
    console.log('📊 正在创建数据库表...');
    
    try {
        // 创建传感器数据表
        await pool.query(`
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
        console.log('✅ sensor_data 表创建成功');
        
        //创建设备状态历史表
        await pool.query(`
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
        console.log('✅ device_status_history 表创建成功');
        
        // 创建登录记录表
        await pool.query(`
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
        console.log('✅ login_logs 表创建成功');
        
        // 创建AI分析历史表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ai_analysis_history (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                analysis_type VARCHAR(50) NOT NULL COMMENT '分析类型',
                environment_assessment TEXT DEFAULT NULL COMMENT '环境评估',
                risk_level VARCHAR(20) DEFAULT NULL COMMENT '风险等级',
                predictions TEXT DEFAULT NULL COMMENT '趋势预测',
                suggestions TEXT DEFAULT NULL COMMENT '优化建议',
                sensor_snapshot TEXT DEFAULT NULL COMMENT '分析时的传感器数据快照',
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
        console.log('✅ ai_analysis_history 表创建成功');
        
        // 创建运输车辆数据表
        await pool.query(`
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
        console.log('✅ vehicle_data 表创建成功');
        
        // 创建车辆注册配置表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS vehicle_config (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                vehicle_id VARCHAR(100) NOT NULL UNIQUE COMMENT '车辆唯一标识',
                vehicle_number VARCHAR(50) NOT NULL UNIQUE COMMENT '车辆编号/车牌号',
                main_device_id VARCHAR(50) NOT NULL COMMENT '主设备ID',
                cold_chain_device_id VARCHAR(50) NOT NULL COMMENT '冷链运输设备ID',
                sensor_tags TEXT DEFAULT NULL COMMENT '传感器标识配置(JSON)',
                location VARCHAR(200) DEFAULT NULL COMMENT '位置描述',
                coords TEXT DEFAULT NULL COMMENT '坐标(JSON格式)',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '更新时间',
                INDEX idx_vehicle_id (vehicle_id),
                INDEX idx_vehicle_number (vehicle_number)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='车辆注册配置表'
        `);
        console.log('✅ vehicle_config 表创建成功');
        
        // 创建系统操作日志表
        await pool.query(`
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
        console.log('✅ system_logs 表创建成功');
        
        // 创建图片存储表
        await pool.query(`
            CREATE TABLE IF NOT EXISTS pictrue (
                id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
                image_data LONGBLOB NOT NULL COMMENT '图片二进制数据',
                filename VARCHAR(255) DEFAULT NULL COMMENT '文件名',
                filesize INT DEFAULT 0 COMMENT '文件大小(字节)',
                stage VARCHAR(20) DEFAULT 'unknown' COMMENT '生长阶段',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
                INDEX idx_created_at (created_at),
                INDEX idx_stage (stage)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='图片存储表'
        `);
        console.log('✅ pictrue 表创建成功');

        // 给已有表添加 stage 列（如果不存在）
        try {
            await pool.query('ALTER TABLE pictrue ADD COLUMN stage VARCHAR(20) DEFAULT \'unknown\' COMMENT \'生长阶段\' AFTER filesize');
            console.log('✅ pictrue 表 stage 列添加成功');
        } catch (e) {
            if (!e.message.includes('Duplicate column')) {
                console.warn('⚠️ 添加 stage 列失败:', e.message);
            }
        }
        
        console.log('✅ 所有表创建完成！');
        
    } catch (error) {
        console.error('❌ 创建表失败:', error.message);
    }
}

// 初始化数据库
initDatabase();

// ==================== API 路由 ====================

// 前端公共配置接口 - 将 Docker 环境变量中的高德地图Key和云平台账号密码注入前端
app.get('/api/config', (req, res) => {
    res.json({
        success: true,
        data: {
            amap_key: process.env.AMAP_KEY || '',
            cloud_account: process.env.CLOUD_ACCOUNT || '',
            cloud_password: process.env.CLOUD_PASSWORD || '',
            polling_interval: parseInt(process.env.CLOUD_POLLING_INTERVAL || '10000')
        }
    });
});

// 健康检查 - 即使数据库失败也能访问
app.get('/api/health', (req, res) => {
    res.json({ 
        status: dbConnected ? 'ok' : 'db_not_connected',
        message: '辣椒智慧农业数据库服务运行正常',
        database: dbConnected ? 'connected' : 'disconnected',
        config: {
            host: dbConfig.host,
            user: dbConfig.user,
            database: dbConfig.database
        }
    });
});

// 获取统计数据概览
app.get('/api/stats/overview', async (req, res) => {
    if (!dbConnected) {
        return res.json({ success: false, message: '数据库未连接', data: {} });
    }
    
    try {
        const [sensorRows] = await pool.query('SELECT COUNT(*) as count FROM sensor_data');
        const [deviceRows] = await pool.query('SELECT COUNT(*) as count FROM device_status_history');
        const [loginRows] = await pool.query('SELECT COUNT(*) as count FROM login_logs');
        const [aiRows] = await pool.query('SELECT COUNT(*) as count FROM ai_analysis_history');
        const [vehicleRows] = await pool.query('SELECT COUNT(*) as count FROM vehicle_data');
        
        let pictrueCount = 0;
        try {
            const [rows] = await pool.query('SELECT COUNT(*) as count FROM pictrue');
            pictrueCount = rows[0].count || 0;
        } catch (e) {}
        
        let blockchainCount = 0;
        try {
            const [bcRows] = await pool.query('SELECT COUNT(*) as count FROM blockchain_proof');
            blockchainCount = bcRows[0].count || 0;
        } catch (e) {}
        
        let blockCount = 0;
        try {
            const [bRows] = await pool.query('SELECT COUNT(*) as count FROM block');
            blockCount = bRows[0].count || 0;
        } catch (e) {}
        
        res.json({
            success: true,
            data: {
                sensor_count: sensorRows[0].count || 0,
                device_count: deviceRows[0].count || 0,
                login_count: loginRows[0].count || 0,
                ai_count: aiRows[0].count || 0,
                vehicle_count: vehicleRows[0].count || 0,
                pictrue_count: pictrueCount,
                blockchain_count: blockchainCount,
                block_count: blockCount
            }
        });
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.json({ success: false, message: '获取统计数据失败', data: {} });
    }
});

// 测试数据库连接
app.get('/api/test-db', async (req, res) => {
    if (!dbConnected || !pool) {
        return res.json({
            success: false,
            message: '数据库未连接，请检查配置'
        });
    }
    
    try {
        const [rows] = await pool.query('SELECT NOW() as current_time, DATABASE() as db_name');
        res.json({
            success: true,
            message: '数据库连接正常',
            data: rows[0]
        });
    } catch (error) {
        res.json({
            success: false,
            message: error.message
        });
    }
});

// 创建数据库（如果不存在）
app.get('/api/init-db', async (req, res) => {
    try {
        // 先不指定数据库连接
        const tempPool = mysql.createPool({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            charset: 'utf8mb4'
    // 直接返回字符串，不做时区转换
        });
        
        await tempPool.query('CREATE DATABASE IF NOT EXISTS qjzl DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
        await tempPool.end();
        
        // 重新初始化连接
        await initDatabase();
        
        res.json({ success: true, message: '数据库创建成功！' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
});

// ==================== 1. 传感器数据 API ====================

// 存储传感器数据
app.post('/api/sensor/data', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { device_id, sensor_type, sensor_name, value, unit, location } = req.body;
        const now = new Date();
        const timestamp = now.getTime();
        
        const query = `
            INSERT INTO sensor_data 
            (device_id, sensor_type, sensor_name, value, unit, location, record_time, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            device_id, sensor_type, sensor_name, value, unit, location, now, timestamp
        ]);
        
        res.json({ 
            success: true, 
            id: result.insertId,
            message: '传感器数据存储成功' 
        });
    } catch (error) {
        console.error('存储传感器数据失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取传感器历史数据
app.get('/api/sensor/data', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        const { keyword, device_id, sensor_type, location, start_time, end_time, limit = 100 } = req.query;
        
        let query = 'SELECT * FROM sensor_data WHERE 1=1';
        const params = [];
        
        if (keyword) {
            query += ' AND (sensor_name LIKE ? OR sensor_type LIKE ? OR location LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        if (device_id) {
            query += ' AND device_id = ?';
            params.push(device_id);
        }
        if (sensor_type) {
            query += ' AND sensor_type = ?';
            params.push(sensor_type);
        }
        if (location) {
            query += ' AND location = ?';
            params.push(location);
        }
        if (start_time) {
            query += ' AND record_time >= ?';
            params.push(start_time);
        }
        if (end_time) {
            query += ' AND record_time <= ?';
            params.push(end_time);
        }
        
        query += ' ORDER BY record_time DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取传感器数据失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// ==================== 2. 设备状态 API ====================

// 存储设备状态
app.post('/api/device/status', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { device_id, device_name, status, action, location, details } = req.body;
        const now = new Date();
        const timestamp = now.getTime();
        
        const query = `
            INSERT INTO device_status_history 
            (device_id, device_name, status, action, location, record_time, timestamp, details)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            device_id, device_name, status, action, location, now, timestamp, details
        ]);
        
        res.json({ 
            success: true, 
            id: result.insertId,
            message: '设备状态存储成功' 
        });
    } catch (error) {
        console.error('存储设备状态失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取设备状态历史
app.get('/api/device/status', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        const { keyword, device_id, device_name, status, start_time, end_time, limit = 100 } = req.query;
        
        let query = 'SELECT * FROM device_status_history WHERE 1=1';
        const params = [];
        
        if (keyword) {
            query += ' AND (device_name LIKE ? OR location LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (device_id) {
            query += ' AND device_id = ?';
            params.push(device_id);
        }
        if (device_name) {
            query += ' AND device_name = ?';
            params.push(device_name);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (start_time) {
            query += ' AND record_time >= ?';
            params.push(start_time);
        }
        if (end_time) {
            query += ' AND record_time <= ?';
            params.push(end_time);
        }
        
        query += ' ORDER BY record_time DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取设备状态失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// ==================== 3. 登录日志 API ====================

// 存储登录记录
app.post('/api/login/log', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { user_id, username, user_agent, status, failure_reason, session_id } = req.body;
        
        // 获取客户端真实IP地址
        const clientIp = req.headers['x-forwarded-for'] || 
                         req.headers['x-real-ip'] || 
                         req.connection.remoteAddress || 
                         req.socket.remoteAddress || 
                         (req.connection.socket ? req.connection.socket.remoteAddress : null);
        
        // 如果是IPv6格式的localhost，转换为IPv4
        const ipAddress = clientIp === '::1' ? '127.0.0.1' : 
                         (clientIp && clientIp.startsWith('::ffff:') ? clientIp.substring(7) : clientIp);
        
        const now = new Date();
        
        const query = `
            INSERT INTO login_logs 
            (user_id, username, login_time, ip_address, user_agent, status, failure_reason, session_id)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            user_id, username, now, ipAddress, user_agent, status, failure_reason, session_id
        ]);
        
        res.json({ 
            success: true, 
            id: result.insertId,
            message: '登录记录存储成功',
            ip: ipAddress 
        });
    } catch (error) {
        console.error('存储登录记录失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取登录历史
app.get('/api/login/logs', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        const { keyword, username, status, start_time, end_time, limit = 100 } = req.query;
        
        let query = 'SELECT * FROM login_logs WHERE 1=1';
        const params = [];
        
        if (keyword) {
            query += ' AND (username LIKE ? OR ip_address LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (username) {
            query += ' AND username = ?';
            params.push(username);
        }
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }
        if (start_time) {
            query += ' AND login_time >= ?';
            params.push(start_time);
        }
        if (end_time) {
            query += ' AND login_time <= ?';
            params.push(end_time);
        }
        
        query += ' ORDER BY login_time DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取登录日志失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// ==================== 4. AI分析历史 API ====================

// 存储AI分析结果
app.post('/api/ai/analysis', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { 
            analysis_type, environment_assessment, risk_level, 
            predictions, suggestions, sensor_snapshot, 
            model_version, confidence_score 
        } = req.body;
        const now = new Date();
        const timestamp = now.getTime();
        
        const query = `
            INSERT INTO ai_analysis_history 
            (analysis_type, environment_assessment, risk_level, predictions, suggestions, 
             sensor_snapshot, analysis_time, timestamp, model_version, confidence_score)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            analysis_type, 
            environment_assessment, 
            risk_level, 
            JSON.stringify(predictions), 
            JSON.stringify(suggestions),
            JSON.stringify(sensor_snapshot), 
            now, 
            timestamp, 
            model_version, 
            confidence_score
        ]);
        
        res.json({ 
            success: true, 
            id: result.insertId,
            message: 'AI分析结果存储成功' 
        });
    } catch (error) {
        console.error('存储AI分析结果失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取AI分析历史
app.get('/api/ai/analysis', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        const { keyword, analysis_type, risk_level, start_time, end_time, limit = 100 } = req.query;
        
        let query = 'SELECT * FROM ai_analysis_history WHERE 1=1';
        const params = [];
        
        if (keyword) {
            query += ' AND (analysis_type LIKE ? OR environment_assessment LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (analysis_type) {
            query += ' AND analysis_type = ?';
            params.push(analysis_type);
        }
        if (risk_level) {
            query += ' AND risk_level = ?';
            params.push(risk_level);
        }
        if (start_time) {
            query += ' AND analysis_time >= ?';
            params.push(start_time);
        }
        if (end_time) {
            query += ' AND analysis_time <= ?';
            params.push(end_time);
        }
        
        query += ' ORDER BY analysis_time DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取AI分析历史失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// ==================== 5. 运输车辆数据 API ====================

// 存储车辆数据
app.post('/api/vehicle/data', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { 
            vehicle_id, vehicle_number, location_latitude, location_longitude, 
            location_address, temperature, humidity, co2_level, door_status,
            main_device_status, coldchain_device_status
        } = req.body;
        const now = new Date();
        const timestamp = now.getTime();
        
        const query = `
            INSERT INTO vehicle_data 
            (vehicle_id, vehicle_number, location_latitude, location_longitude, location_address,
             temperature, humidity, co2_level, door_status, main_device_status, 
             coldchain_device_status, record_time, timestamp)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            vehicle_id, vehicle_number, location_latitude, location_longitude, location_address,
            temperature, humidity, co2_level, door_status, main_device_status,
            coldchain_device_status, now, timestamp
        ]);
        
        res.json({ 
            success: true, 
            id: result.insertId,
            message: '车辆数据存储成功' 
        });
    } catch (error) {
        console.error('存储车辆数据失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取车辆历史数据
app.get('/api/vehicle/data', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        const { keyword, vehicle_id, vehicle_number, start_time, end_time, limit = 100 } = req.query;
        
        let query = 'SELECT * FROM vehicle_data WHERE 1=1';
        const params = [];
        
        if (keyword) {
            query += ' AND (vehicle_number LIKE ? OR location_address LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (vehicle_id) {
            query += ' AND vehicle_id = ?';
            params.push(vehicle_id);
        }
        if (vehicle_number) {
            query += ' AND vehicle_number = ?';
            params.push(vehicle_number);
        }
        if (start_time) {
            query += ' AND record_time >= ?';
            params.push(start_time);
        }
        if (end_time) {
            query += ' AND record_time <= ?';
            params.push(end_time);
        }
        
        query += ' ORDER BY record_time DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取车辆数据失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// 获取车牌号列表
app.get('/api/vehicle/numbers', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        const [rows] = await pool.query('SELECT DISTINCT vehicle_number FROM vehicle_data WHERE vehicle_number IS NOT NULL AND vehicle_number != "" ORDER BY vehicle_number');
        const numbers = rows.map(row => row.vehicle_number);
        res.json({ success: true, data: numbers });
    } catch (error) {
        console.error('获取车牌号失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// ==================== 车辆注册配置 API ====================

// 保存车辆注册配置
app.post('/api/vehicle/config', async (req, res) => {
    console.log('📥 收到保存车辆配置请求:', req.body);
    
    if (!dbConnected) {
        console.error('❌ 数据库未连接');
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { id, number, mainDeviceID, coldChainDeviceID, sensorTags, location, coords } = req.body;
        
        // 先检查是否已存在
        const [existing] = await pool.query('SELECT * FROM vehicle_config WHERE vehicle_id = ? OR vehicle_number = ?', [id, number]);
        console.log('   现有记录:', existing);
        
        if (existing.length > 0) {
            console.log('   更新现有记录');
            // 更新现有记录
            await pool.query(`
                UPDATE vehicle_config 
                SET vehicle_number = ?, main_device_id = ?, cold_chain_device_id = ?, 
                    sensor_tags = ?, location = ?, coords = ?, updated_at = NOW()
                WHERE vehicle_id = ?
            `, [number, mainDeviceID, coldChainDeviceID, JSON.stringify(sensorTags), location, JSON.stringify(coords), id]);
        } else {
            console.log('   插入新记录');
            // 插入新记录
            await pool.query(`
                INSERT INTO vehicle_config 
                (vehicle_id, vehicle_number, main_device_id, cold_chain_device_id, 
                 sensor_tags, location, coords, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())
            `, [id, number, mainDeviceID, coldChainDeviceID, JSON.stringify(sensorTags), location, JSON.stringify(coords)]);
        }
        
        console.log('✅ 车辆配置保存成功');
        res.json({ success: true, message: '车辆配置保存成功' });
    } catch (error) {
        console.error('❌ 保存车辆配置失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取所有车辆注册配置
app.get('/api/vehicle/configs', async (req, res) => {
    console.log('📤 收到获取车辆配置请求');
    
    if (!dbConnected) {
        console.error('❌ 数据库未连接');
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        const [rows] = await pool.query('SELECT * FROM vehicle_config ORDER BY created_at DESC');
        console.log('   查询结果:', rows);
        
        const configs = rows.map(row => ({
            id: row.vehicle_id,
            number: row.vehicle_number,
            mainDeviceID: row.main_device_id,
            coldChainDeviceID: row.cold_chain_device_id,
            sensorTags: row.sensor_tags ? JSON.parse(row.sensor_tags) : {},
            location: row.location,
            coords: row.coords ? JSON.parse(row.coords) : null
        }));
        
        console.log('✅ 成功返回', configs.length, '个车辆配置');
        res.json({ success: true, data: configs });
    } catch (error) {
        console.error('❌ 获取车辆配置失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// 删除车辆注册配置
app.delete('/api/vehicle/config/:id', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM vehicle_config WHERE vehicle_id = ?', [id]);
        res.json({ success: true, message: '车辆配置删除成功' });
    } catch (error) {
        console.error('删除车辆配置失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 6. 系统日志 API ====================

// 存储系统日志
app.post('/api/system/log', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { log_type, module, action, message, details, user_id } = req.body;
        const now = new Date();
        
        const query = `
            INSERT INTO system_logs 
            (log_type, module, action, message, details, user_id, record_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [
            log_type, module, action, message, details, user_id, now
        ]);
        
        res.json({ 
            success: true, 
            id: result.insertId,
            message: '系统日志存储成功' 
        });
    } catch (error) {
        console.error('存储系统日志失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取系统日志
app.get('/api/system/logs', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        let { keyword, log_type, module, start_time, end_time, limit = 100 } = req.query;
        console.log('📝 系统日志查询参数:', { keyword, log_type, module, start_time, end_time, limit });
        
        // 转换时间格式：从 ISO 格式 (2026-05-19T00:00:00) 转换为 MySQL DATETIME 格式 (2026-05-19 00:00:00)
        if (start_time) {
            start_time = start_time.replace('T', ' ').replace('Z', '');
        }
        if (end_time) {
            end_time = end_time.replace('T', ' ').replace('Z', '');
        }
        console.log('🔄 转换后的时间:', { start_time, end_time });
        
        let query = 'SELECT * FROM system_logs WHERE 1=1';
        const params = [];
        
        if (keyword) {
            query += ' AND (module LIKE ? OR action LIKE ? OR message LIKE ?)';
            params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
        }
        if (log_type) {
            query += ' AND log_type = ?';
            params.push(log_type);
        }
        if (module) {
            // 处理中英文映射
            let searchModule = module;
            if (module === '平台') {
                searchModule = 'platform';
            }
            // 使用模糊匹配，同时匹配中文和英文
            query += ' AND (module LIKE ? OR module LIKE ?)';
            params.push('%' + module + '%', '%' + searchModule + '%');
        }
        if (start_time) {
            query += ' AND record_time >= ?';
            params.push(start_time);
        }
        if (end_time) {
            query += ' AND record_time <= ?';
            params.push(end_time);
        }
        
        query += ' ORDER BY record_time DESC LIMIT ?';
        params.push(parseInt(limit));
        
        console.log('📝 执行的SQL:', query);
        console.log('📝 SQL参数:', params);
        const [rows] = await pool.query(query, params);
        console.log('📊 查询结果条数:', rows.length);
        if (rows.length > 0) {
            console.log('📋 第一条数据:', { module: rows[0].module, record_time: rows[0].record_time });
        }
        // 查询数据库中所有不同的 module 值
        const [allModules] = await pool.query('SELECT DISTINCT module FROM system_logs');
        console.log('📚 数据库中所有模块:', allModules.map(m => m.module));
        
        // 如果指定了模块查询，额外查询匹配的模块
        if (module) {
            const [exactMatch] = await pool.query('SELECT DISTINCT module FROM system_logs WHERE module = ?', [module]);
            console.log('🔍 精确匹配模块:', exactMatch.map(m => m.module));
            
            const [likeMatch] = await pool.query('SELECT DISTINCT module FROM system_logs WHERE module LIKE ?', ['%' + module + '%']);
            console.log('🔍 模糊匹配模块:', likeMatch.map(m => m.module));
        }
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取系统日志失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// ==================== 7. 图片存储 API ====================

// 保存图片（接收 base64）
app.post('/api/pictrue', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { image_base64, filename } = req.body;
        if (!image_base64) {
            return res.json({ success: false, message: '图片数据不能为空' });
        }
        
        // 解码 base64
        const imageBuffer = Buffer.from(image_base64, 'base64');
        const filesize = imageBuffer.length;
        
        const query = `
            INSERT INTO pictrue (image_data, filename, filesize)
            VALUES (?, ?, ?)
        `;
        
        const [result] = await pool.query(query, [imageBuffer, filename || 'snapshot.jpg', filesize]);
        
        res.json({ 
            success: true, 
            id: result.insertId,
            filesize: filesize,
            message: '图片保存成功'
        });
    } catch (error) {
        console.error('保存图片失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 获取图片列表（不含图片数据，仅元信息）
app.get('/api/pictrue', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接', data: [] });
    }
    
    try {
        const { limit = 50, start_time, end_time, stage } = req.query;
        let query = 'SELECT id, filename, filesize, stage, created_at FROM pictrue WHERE 1=1';
        const params = [];
        
        if (start_time) {
            query += ' AND created_at >= ?';
            params.push(start_time);
        }
        if (end_time) {
            query += ' AND created_at <= ?';
            params.push(end_time);
        }
        if (stage) {
            query += ' AND stage = ?';
            params.push(stage);
        }
        
        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(parseInt(limit));
        
        const [rows] = await pool.query(query, params);
        res.json({ success: true, data: rows });
    } catch (error) {
        console.error('获取图片列表失败:', error);
        res.status(500).json({ success: false, message: error.message, data: [] });
    }
});

// 获取单张图片（返回二进制）
app.get('/api/pictrue/:id', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const [rows] = await pool.query('SELECT image_data, filename FROM pictrue WHERE id = ?', [req.params.id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '图片不存在' });
        }
        res.set('Content-Type', 'image/jpeg');
        res.set('Content-Disposition', `inline; filename="${rows[0].filename || 'snapshot.jpg'}"`);
        res.send(rows[0].image_data);
    } catch (error) {
        console.error('获取图片失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 删除单张图片
app.delete('/api/pictrue/:id', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { id } = req.params;
        const [rows] = await pool.query('SELECT id FROM pictrue WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '图片不存在' });
        }
        await pool.query('DELETE FROM pictrue WHERE id = ?', [id]);
        console.log(`🗑️ 图片 ${id} 已删除`);
        res.json({ success: true, message: '图片已删除', id: parseInt(id) });
    } catch (error) {
        console.error('删除图片失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 手动更新图片生长阶段
app.patch('/api/pictrue/:id', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }

    try {
        const { id } = req.params;
        const { stage } = req.body;

        const validStages = ['seedling', 'grow', 'harvest', 'other', 'unknown'];
        if (!stage || !validStages.includes(stage)) {
            return res.status(400).json({ success: false, message: '无效的生长阶段，有效值: ' + validStages.join(', ') });
        }

        const [rows] = await pool.query('SELECT id FROM pictrue WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '图片不存在' });
        }

        await pool.query('UPDATE pictrue SET stage = ? WHERE id = ?', [stage, id]);
        console.log(`📝 图片 ${id} 阶段已更新为: ${stage}`);
        res.json({ success: true, message: '阶段已更新', id: parseInt(id), stage });
    } catch (error) {
        console.error('更新图片阶段失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// AI 图片分类 - 使用 DeepSeek Vision API 识别辣椒生长阶段
app.post('/api/pictrue/classify/:id', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }

    try {
        const { id } = req.params;
        
        // 从数据库读取图片
        const [rows] = await pool.query('SELECT image_data, filename, stage, created_at FROM pictrue WHERE id = ?', [id]);
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: '图片不存在' });
        }

        // 将图片转为 base64
        const base64Image = rows[0].image_data.toString('base64');
        const imageMime = 'image/jpeg';

        // 检测图片真实 MIME 类型（通过文件头）
        function detectMime(buf) {
            if (!buf || buf.length < 4) return 'image/jpeg';
            const header = buf.toString('hex', 0, 4).toUpperCase();
            if (header.startsWith('89504E47')) return 'image/png';
            if (header.startsWith('FFD8FF')) return 'image/jpeg';
            if (header.startsWith('474946')) return 'image/gif';
            if (header.startsWith('424D')) return 'image/bmp';
            if (header.startsWith('524946')) return 'image/webp';
            return 'image/jpeg';
        }
        const detectedMime = detectMime(rows[0].image_data);
        const dataUri = `data:${detectedMime};base64,${base64Image}`;
        
        // 使用 Qwen-VL（通义千问）视觉识别 API - 完全免费（新用户送100万tokens）
        // 注册获取 API Key: https://help.aliyun.com/zh/model-studio/get-api-key
        const QWEN_API_KEY = process.env.QWEN_API_KEY || '';
        let aiStage = 'unknown';
        let lastError = null;

        if (QWEN_API_KEY) {
            const qwenModels = ['qwen-vl-plus', 'qwen3-vl-plus'];
            for (const modelName of qwenModels) {
                for (let retry = 0; retry < 2; retry++) {
                    try {
                        console.log(`  🤖 Qwen-VL 尝试模型: ${modelName} (第${retry+1}次)`);
                        const response = await fetch('https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${QWEN_API_KEY}`
                            },
                            body: JSON.stringify({
                                model: modelName,
                                messages: [
                                    {
                                        role: 'system',
                                        content: '你是一位农业专家，根据图片内容判断辣椒(辣椒)的生长阶段。请仔细分析图片中的视觉特征：\n' +
                                            '- seedling(育苗期): 幼苗/小苗/刚发芽，植株矮小\n' +
                                            '- grow(生长开花期): 从营养生长到开花坐果的全过程，包括绿色叶片茂盛、出现花朵或小辣椒幼果\n' +
                                            '- harvest(采收期): 辣椒果实已成熟(红色/变色)，或正在采收/加工\n' +
                                            '- other(其他): 图片中没有人或辣椒植株，或是人物/物品等\n' +
                                            '只返回英文类别名称，不要输出任何其他内容。'
                                    },
                                    {
                                        role: 'user',
                                        content: [
                                            { type: 'text', text: '这张图片属于哪个阶段？只输出英文词。' },
                                            { type: 'image_url', image_url: { url: dataUri } }
                                        ]
                                    }
                                ],
                                max_tokens: 20,
                                temperature: 0
                            })
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            lastError = `Qwen模型 ${modelName} 失败: ${response.status} ${errorText}`;
                            console.error(`  ⚠️ ${lastError}`);
                            if (retry === 0) {
                                console.log('  🔄 即将重试...');
                                await new Promise(r => setTimeout(r, 1000));
                            }
                            continue;
                        }

                        const data = await response.json();
                        const reply = data.choices[0].message.content.trim().toLowerCase();
                        console.log(`  ✅ Qwen模型 ${modelName} 返回: ${reply}`);
                        
                        const validStages = ['seedling', 'grow', 'harvest', 'other', 'unknown'];
                        for (const s of validStages) {
                            if (reply.includes(s)) {
                                aiStage = s;
                                break;
                            }
                        }
                        if (aiStage !== 'unknown') break;
                        break; // 成功获取但为unknown，跳出重试循环
                    } catch (e) {
                        lastError = `Qwen模型 ${modelName} 异常: ${e.message}`;
                        console.error(`  ⚠️ ${lastError}`);
                        if (retry === 0) {
                            console.log('  🔄 即将重试...');
                            await new Promise(r => setTimeout(r, 1000));
                        }
                    }
                }
                if (aiStage !== 'unknown') break; // 已识别成功，跳出模型循环
            }
        } else {
            console.log('  ⚠️ 未配置 QWEN_API_KEY');
        }

        if (aiStage === 'unknown') {
            console.log('  ⏰ AI识别未生效，使用时间兜底策略');
            // 按创建时间推估 - 从数据库读取图片创建时间
            const createdAt = rows[0].created_at || rows[0].record_time;
            if (createdAt) {
                const month = new Date(createdAt).getMonth() + 1;
                const monthStageMap = {
                    3: 'seedling', 4: 'seedling',
                    5: 'grow', 6: 'grow', 7: 'grow', 8: 'grow', 9: 'grow',
                    10: 'harvest', 11: 'harvest', 12: 'harvest'
                };
                aiStage = monthStageMap[month] || 'unknown';
                console.log(`  📅 按月份(${month}月)推估阶段: ${aiStage}`);
            }
        }
        
        // 验证返回的阶段是否合法
        const validStages = ['seedling', 'grow', 'harvest', 'other', 'unknown'];
        const stage = validStages.includes(aiStage) ? aiStage : 'unknown';

        // 更新数据库
        await pool.query('UPDATE pictrue SET stage = ? WHERE id = ?', [stage, id]);
        
        console.log(`✅ 图片 ${id} 分类完成: ${stage}`);

        res.json({
            success: true,
            id: parseInt(id),
            stage: stage,
            message: '图片分类完成'
        });
    } catch (error) {
        console.error('图片分类失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 数据清理 API ====================

app.delete('/api/cleanup', async (req, res) => {
    if (!dbConnected) {
        return res.status(500).json({ success: false, message: '数据库未连接' });
    }
    
    try {
        const { type, date, hour, filter_value, current_tab } = req.body;
        
        if (!type) {
            return res.json({ success: false, message: '请指定清除类型' });
        }
        
        let totalDeleted = 0;
        let startTime = '';
        let endTime = '';
        
        if (type === '7days') {
            // 清除7天内的数据
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            startTime = sevenDaysAgo.toISOString().slice(0, 19).replace('T', ' ');
            endTime = new Date().toISOString().slice(0, 19).replace('T', ' ');
        } else if (type === 'selected') {
            // 清除指定日期的数据
            if (!date) {
                return res.json({ success: false, message: '请指定日期' });
            }
            
            if (hour !== undefined && hour !== null && hour !== '') {
                // 清除指定小时的数据
                const startHour = String(hour).padStart(2, '0');
                const endHourNum = (parseInt(hour) + 1) % 24;
                const endHour = String(endHourNum).padStart(2, '0');
                startTime = `${date} ${startHour}:00:00`;
                endTime = `${date} ${endHour}:00:59`;
            } else {
                // 清除全天数据
                startTime = `${date} 00:00:00`;
                endTime = `${date} 23:59:59`;
            }
        } else {
            return res.json({ success: false, message: '无效的清除类型' });
        }
        
        // 根据当前标签页和筛选条件清除数据
        if (current_tab === 'sensor') {
            // 清除传感器数据
            if (filter_value) {
                const [sensorResult] = await pool.query('DELETE FROM sensor_data WHERE record_time >= ? AND record_time <= ? AND sensor_type = ?', [startTime, endTime, filter_value]);
                totalDeleted += sensorResult.affectedRows;
            } else {
                const [sensorResult] = await pool.query('DELETE FROM sensor_data WHERE record_time >= ? AND record_time <= ?', [startTime, endTime]);
                totalDeleted += sensorResult.affectedRows;
            }
        } else if (current_tab === 'device') {
            // 清除设备状态历史
            if (filter_value) {
                const [deviceResult] = await pool.query('DELETE FROM device_status_history WHERE record_time >= ? AND record_time <= ? AND device_name = ?', [startTime, endTime, filter_value]);
                totalDeleted += deviceResult.affectedRows;
            } else {
                const [deviceResult] = await pool.query('DELETE FROM device_status_history WHERE record_time >= ? AND record_time <= ?', [startTime, endTime]);
                totalDeleted += deviceResult.affectedRows;
            }
        } else if (current_tab === 'vehicle') {
            // 清除车辆数据
            if (filter_value) {
                const [vehicleResult] = await pool.query('DELETE FROM vehicle_data WHERE record_time >= ? AND record_time <= ? AND vehicle_number = ?', [startTime, endTime, filter_value]);
                totalDeleted += vehicleResult.affectedRows;
            } else {
                const [vehicleResult] = await pool.query('DELETE FROM vehicle_data WHERE record_time >= ? AND record_time <= ?', [startTime, endTime]);
                totalDeleted += vehicleResult.affectedRows;
            }
        } else if (current_tab === 'login') {
            // 清除登录日志（使用 login_time）
            const [loginResult] = await pool.query('DELETE FROM login_logs WHERE login_time >= ? AND login_time <= ?', [startTime, endTime]);
            totalDeleted += loginResult.affectedRows;
        } else if (current_tab === 'ai') {
            // 清除AI分析历史（使用 analysis_time）
            const [aiResult] = await pool.query('DELETE FROM ai_analysis_history WHERE analysis_time >= ? AND analysis_time <= ?', [startTime, endTime]);
            totalDeleted += aiResult.affectedRows;
        } else if (current_tab === 'system') {
            // 清除系统日志
            if (filter_value) {
                // 处理中英文映射
                let searchModule = filter_value;
                if (filter_value === '平台') {
                    searchModule = 'platform';
                }
                const [systemResult] = await pool.query('DELETE FROM system_logs WHERE record_time >= ? AND record_time <= ? AND (module LIKE ? OR module LIKE ?)', [startTime, endTime, '%' + filter_value + '%', '%' + searchModule + '%']);
                totalDeleted += systemResult.affectedRows;
            } else {
                const [systemResult] = await pool.query('DELETE FROM system_logs WHERE record_time >= ? AND record_time <= ?', [startTime, endTime]);
                totalDeleted += systemResult.affectedRows;
            }
        } else if (current_tab === 'pictrue') {
            // 清除指定日期图片
            const [pictrueResult] = await pool.query('DELETE FROM pictrue WHERE created_at >= ? AND created_at <= ?', [startTime, endTime]);
            totalDeleted += pictrueResult.affectedRows;
        } else {
            // 默认清除所有表
            const [sensorResult] = await pool.query('DELETE FROM sensor_data WHERE record_time >= ? AND record_time <= ?', [startTime, endTime]);
            totalDeleted += sensorResult.affectedRows;
            const [deviceResult] = await pool.query('DELETE FROM device_status_history WHERE record_time >= ? AND record_time <= ?', [startTime, endTime]);
            totalDeleted += deviceResult.affectedRows;
            const [vehicleResult] = await pool.query('DELETE FROM vehicle_data WHERE record_time >= ? AND record_time <= ?', [startTime, endTime]);
            totalDeleted += vehicleResult.affectedRows;
            const [loginResult] = await pool.query('DELETE FROM login_logs WHERE login_time >= ? AND login_time <= ?', [startTime, endTime]);
            totalDeleted += loginResult.affectedRows;
            const [aiResult] = await pool.query('DELETE FROM ai_analysis_history WHERE analysis_time >= ? AND analysis_time <= ?', [startTime, endTime]);
            totalDeleted += aiResult.affectedRows;
            const [systemResult] = await pool.query('DELETE FROM system_logs WHERE record_time >= ? AND record_time <= ?', [startTime, endTime]);
            totalDeleted += systemResult.affectedRows;
        }
        
        res.json({ 
            success: true, 
            count: totalDeleted,
            message: `成功清除 ${totalDeleted} 条数据` 
        });
        
    } catch (error) {
        console.error('清除数据失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==================== 区块链 API ====================

app.get('/api/blockchain', async (req, res) => {
    if (!dbConnected) {
        return res.json({ success: false, data: [], total: 0 });
    }
    try {
        const start_date = req.query.start_date || '';
        const end_date = req.query.end_date || '';
        const start_hour = req.query.start_hour || '';

        let sql = "SELECT id, proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code, created_at FROM block";
        const params = [];
        const conditions = [];

        if (start_date) {
            conditions.push("created_at >= ?");
            params.push(start_date + ' 00:00:00');
        }
        if (end_date) {
            conditions.push("created_at <= ?");
            params.push(end_date + ' 23:59:59');
        }
        if (start_hour) {
            conditions.push("HOUR(created_at) = ?");
            params.push(parseInt(start_hour));
        }

        if (conditions.length > 0) {
            sql += " WHERE " + conditions.join(" AND ");
        }
        sql += " ORDER BY created_at DESC LIMIT 200";

        const [rows] = await pool.query(sql, params);
        // 格式化日期（处理UTC时间转北京时间）
        const data = rows.map(r => {
            let createdAt = r.created_at;
            let dateObj = null;
            
            // 尝试多种方式解析日期
            if (createdAt instanceof Date) {
                dateObj = createdAt;
            } else if (typeof createdAt === 'string') {
                // 尝试解析字符串日期
                const trimmed = createdAt.trim();
                // 处理 MySQL DATETIME 格式: YYYY-MM-DD HH:MM:SS
                if (trimmed.match(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)) {
                    dateObj = new Date(trimmed.replace(' ', 'T') + 'Z');
                } else {
                    dateObj = new Date(createdAt);
                }
            }
            
            if (dateObj && !isNaN(dateObj.getTime())) {
                // 将UTC时间转换为北京时间（+8小时）
                const beijingTime = new Date(dateObj.getTime() + 8 * 60 * 60 * 1000);
                const year = beijingTime.getUTCFullYear();
                const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
                const day = String(beijingTime.getUTCDate()).padStart(2, '0');
                const hours = String(beijingTime.getUTCHours()).padStart(2, '0');
                const minutes = String(beijingTime.getUTCMinutes()).padStart(2, '0');
                const seconds = String(beijingTime.getUTCSeconds()).padStart(2, '0');
                createdAt = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            } else {
                createdAt = String(createdAt);
            }
            return { ...r, created_at: createdAt };
        });
        res.json({ success: true, data, total: data.length });
    } catch (error) {
        console.error('获取区块链数据失败:', error);
        res.json({ success: false, message: error.message, data: [], total: 0 });
    }
});

app.post('/api/blockchain/verify', async (req, res) => {
    if (!dbConnected) {
        return res.json({ success: false, message: '数据库未连接' });
    }
    try {
        const { record_id } = req.body;
        if (!record_id) {
            return res.json({ success: false, message: '缺少参数 record_id' });
        }
        const [rows] = await pool.query('SELECT * FROM block WHERE id = ?', [record_id]);
        if (rows.length === 0) {
            return res.json({ success: false, message: '记录不存在' });
        }
        const row = rows[0];
        const crypto = require('crypto');
        const expected_hash = crypto.createHash('md5').update(row.raw_material).digest('hex').toUpperCase();
        const match = (expected_hash === row.md5_hash);
        res.json({
            success: true,
            data: {
                id: row.id,
                proof_code: row.proof_code,
                raw_material: row.raw_material,
                stored_hash: row.md5_hash,
                computed_hash: expected_hash,
                match
            }
        });
    } catch (error) {
        console.error('区块链验证失败:', error);
        res.json({ success: false, message: error.message });
    }
});

app.post('/api/blockchain/verify-code', async (req, res) => {
    if (!dbConnected) {
        return res.json({ success: false, message: '数据库未连接' });
    }
    try {
        const { verify_code } = req.body;
        if (!verify_code) {
            return res.json({ success: false, message: '缺少参数 verify_code' });
        }
        const code = verify_code.trim().toUpperCase();
        const [rows] = await pool.query('SELECT * FROM block WHERE verify_code = ?', [code]);
        if (rows.length === 0) {
            return res.json({ success: false, message: '验证码无效或记录不存在' });
        }
        const row = rows[0];
        // 重新计算哈希验证
        const crypto = require('crypto');
        const expected_hash = crypto.createHash('md5').update(row.raw_material).digest('hex').toUpperCase();
        const match = (expected_hash === row.md5_hash);
        res.json({
            success: true,
            data: {
                id: row.id,
                proof_code: row.proof_code,
                prod_date: row.prod_date,
                region_code: row.region_code,
                variety_code: row.variety_code,
                batch_no: row.batch_no,
                salt_value: row.salt_value,
                raw_material: row.raw_material,
                stored_hash: row.md5_hash,
                computed_hash: expected_hash,
                match,
                verify_code: row.verify_code,
                created_at: row.created_at instanceof Date ?
                    row.created_at.toISOString().slice(0, 19).replace('T', ' ') : String(row.created_at)
            }
        });
    } catch (error) {
        console.error('区块链验证失败:', error);
        res.json({ success: false, message: error.message });
    }
});

// ==================== 统计数据 API ====================

app.get('/api/stats/overview', async (req, res) => {
    if (!dbConnected) {
        return res.json({ 
            success: false, 
            message: '数据库未连接',
            data: {
                sensor_count: 0,
                device_count: 0,
                login_count: 0,
                ai_count: 0,
                vehicle_count: 0
            }
        });
    }
    
    try {
        const stats = {};
        
        // 传感器数据总数
        const [sensorCount] = await pool.query('SELECT COUNT(*) as count FROM sensor_data');
        stats.sensor_count = sensorCount[0].count;
        
        // 设备状态记录数
        const [deviceCount] = await pool.query('SELECT COUNT(*) as count FROM device_status_history');
        stats.device_count = deviceCount[0].count;
        
        // 登录记录数
        const [loginCount] = await pool.query('SELECT COUNT(*) as count FROM login_logs');
        stats.login_count = loginCount[0].count;
        
        // AI分析记录数
        const [aiCount] = await pool.query('SELECT COUNT(*) as count FROM ai_analysis_history');
        stats.ai_count = aiCount[0].count;
        
        // 车辆数据记录数
        const [vehicleCount] = await pool.query('SELECT COUNT(*) as count FROM vehicle_data');
        stats.vehicle_count = vehicleCount[0].count;
        
        // 图片记录数
        try {
            const [pictrueCount] = await pool.query('SELECT COUNT(*) as count FROM pictrue');
            stats.pictrue_count = pictrueCount[0].count;
        } catch (e) {
            stats.pictrue_count = 0;
        }
        
        // 区块链存证记录数
        try {
            const [bcCount] = await pool.query('SELECT COUNT(*) as count FROM blockchain_proof');
            stats.blockchain_count = bcCount[0].count;
        } catch (e) {
            stats.blockchain_count = 0;
        }
        
        // 区块记录数
        try {
            const [blockCount] = await pool.query('SELECT COUNT(*) as count FROM block');
            stats.block_count = blockCount[0].count;
        } catch (e) {
            stats.block_count = 0;
        }
        
        res.json({ success: true, data: stats });
    } catch (error) {
        console.error('获取统计数据失败:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// 静态文件服务 - 在 API 路由之后添加
app.use(express.static(path.join(__dirname, '..')));  // 服务 qjzl/ 目录
app.use(express.static(path.join(__dirname, '../..')));  // 服务项目根目录 (e:\1\)

// 启动服务器 - 绑定到所有网络接口（允许局域网访问）
app.listen(PORT, '0.0.0.0', () => {
    const os = require('os');
    const ifaces = os.networkInterfaces();
    let ipAddresses = [];
    
    Object.keys(ifaces).forEach(ifname => {
        ifaces[ifname].forEach(iface => {
            if (iface.family === 'IPv4' && !iface.internal) {
                ipAddresses.push(iface.address);
            }
        });
    });
    
    console.log(`
    ============================================
    🚀 辣椒智慧农业数据库服务已启动！
    📡 本地访问: http://localhost:${PORT}
    🌐 局域网访问:`);ipAddresses.forEach(ip => {
        console.log(`http://${ip}:${PORT}`);
    });
    
    console.log(`    
    🔍 健康检查:
    http://localhost:${PORT}/api/health
    ============================================
    `);
});

module.exports = app;