-- 辣椒智慧农业数据库初始化脚本
-- 数据库: qjzl
-- 日期: 2026-05-17

-- 创建数据库
CREATE DATABASE IF NOT EXISTS qjzl DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE qjzl;

-- ============================================
-- 1. 传感器数据表 (sensor_data)
-- 存储所有传感器每秒的数据
-- ============================================
CREATE TABLE IF NOT EXISTS sensor_data (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    device_id VARCHAR(50) NOT NULL COMMENT '设备ID',
    sensor_type VARCHAR(50) NOT NULL COMMENT '传感器类型',
    sensor_name VARCHAR(100) NOT NULL COMMENT '传感器名称',
    value DECIMAL(10, 2) NOT NULL COMMENT '传感器数值',
    unit VARCHAR(20) DEFAULT NULL COMMENT '单位',
    location VARCHAR(50) NOT NULL COMMENT '位置（幼苗区/种植区/蓄水区/冷链区等）',
    record_time DATETIME NOT NULL COMMENT '记录时间',
    timestamp BIGINT NOT NULL COMMENT '时间戳',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_device_id (device_id),
    INDEX idx_sensor_type (sensor_type),
    INDEX idx_record_time (record_time),
    INDEX idx_location (location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='传感器数据表';

-- ============================================
-- 2. 设备状态历史表 (device_status_history)
-- 存储设备运行的历史状态
-- ============================================
CREATE TABLE IF NOT EXISTS device_status_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    device_id VARCHAR(50) NOT NULL COMMENT '设备ID',
    device_name VARCHAR(100) NOT NULL COMMENT '设备名称',
    status VARCHAR(20) NOT NULL COMMENT '状态（online/offline/error）',
    action VARCHAR(50) DEFAULT NULL COMMENT '操作（start/stop/error等）',
    location VARCHAR(50) NOT NULL COMMENT '位置',
    record_time DATETIME NOT NULL COMMENT '记录时间',
    timestamp BIGINT NOT NULL COMMENT '时间戳',
    details TEXT DEFAULT NULL COMMENT '详细信息',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_device_id (device_id),
    INDEX idx_status (status),
    INDEX idx_record_time (record_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='设备状态历史表';

-- ============================================
-- 3. 登录记录表 (login_logs)
-- 存储登录数据
-- ============================================
CREATE TABLE IF NOT EXISTS login_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    user_id VARCHAR(50) DEFAULT NULL COMMENT '用户ID',
    username VARCHAR(100) NOT NULL COMMENT '用户名',
    login_time DATETIME NOT NULL COMMENT '登录时间',
    logout_time DATETIME DEFAULT NULL COMMENT '退出时间',
    ip_address VARCHAR(50) DEFAULT NULL COMMENT 'IP地址',
    user_agent TEXT DEFAULT NULL COMMENT '浏览器信息',
    status VARCHAR(20) NOT NULL COMMENT '状态（success/failed）',
    failure_reason TEXT DEFAULT NULL COMMENT '失败原因',
    session_id VARCHAR(100) DEFAULT NULL COMMENT '会话ID',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_username (username),
    INDEX idx_login_time (login_time),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录记录表';

-- ============================================
-- 4. AI分析历史表 (ai_analysis_history)
-- 存储AI智能分析的历史数据
-- ============================================
CREATE TABLE IF NOT EXISTS ai_analysis_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    analysis_type VARCHAR(50) NOT NULL COMMENT '分析类型（prediction/optimization/risk等）',
    environment_assessment TEXT DEFAULT NULL COMMENT '环境评估',
    risk_level VARCHAR(20) DEFAULT NULL COMMENT '风险等级（low/medium/high）',
    predictions TEXT DEFAULT NULL COMMENT '趋势预测（JSON格式）',
    suggestions TEXT DEFAULT NULL COMMENT '优化建议（JSON格式）',
    sensor_snapshot TEXT DEFAULT NULL COMMENT '分析时的传感器数据快照（JSON）',
    analysis_time DATETIME NOT NULL COMMENT '分析时间',
    timestamp BIGINT NOT NULL COMMENT '时间戳',
    model_version VARCHAR(50) DEFAULT NULL COMMENT '模型版本',
    confidence_score DECIMAL(5, 2) DEFAULT NULL COMMENT '置信度',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_analysis_type (analysis_type),
    INDEX idx_analysis_time (analysis_time),
    INDEX idx_risk_level (risk_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='AI分析历史表';

-- ============================================
-- 5. 运输车辆数据表 (vehicle_data)
-- 存储辣椒运输车辆监控的每一辆车的历史数据
-- ============================================
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
    door_status VARCHAR(20) DEFAULT NULL COMMENT '车门状态（open/closed）',
    main_device_status VARCHAR(20) DEFAULT NULL COMMENT '主设备状态',
    coldchain_device_status VARCHAR(20) DEFAULT NULL COMMENT '冷链设备状态',
    record_time DATETIME NOT NULL COMMENT '记录时间',
    timestamp BIGINT NOT NULL COMMENT '时间戳',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX idx_vehicle_id (vehicle_id),
    INDEX idx_vehicle_number (vehicle_number),
    INDEX idx_record_time (record_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='运输车辆数据表';

-- ============================================
-- 6. 系统操作日志表 (system_logs)
-- 存储系统操作日志（可选）
-- ============================================
CREATE TABLE IF NOT EXISTS system_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY COMMENT '主键ID',
    log_type VARCHAR(50) NOT NULL COMMENT '日志类型（info/warning/error）',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='系统操作日志表';

-- ============================================
-- 7. 区块链存证记录表 (blockchain_proof)
-- 存储溯源页面的 MD5 存证记录
-- ============================================
CREATE TABLE IF NOT EXISTS blockchain_proof (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    proof_code VARCHAR(17) NOT NULL COMMENT '溯源码',
    prod_date VARCHAR(8) NOT NULL COMMENT '生产日期(YYYYMMDD)',
    region_code VARCHAR(6) NOT NULL COMMENT '区域码',
    variety_code VARCHAR(1) NOT NULL COMMENT '品种码',
    batch_no VARCHAR(2) NOT NULL COMMENT '批次号',
    salt_value VARCHAR(32) DEFAULT 'qinjiao' COMMENT '密钥盐值',
    raw_material VARCHAR(200) NOT NULL COMMENT '拼接原文(MD5输入)',
    md5_hash VARCHAR(32) NOT NULL COMMENT 'MD5存证哈希',
    verify_code VARCHAR(8) NOT NULL COMMENT '随机验证码',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '存证时间',
    INDEX idx_proof_code (proof_code),
    INDEX idx_md5_hash (md5_hash),
    INDEX idx_verify_code (verify_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区块链存证记录表';

-- ============================================
-- 8. 区块链区块记录表 (block)
-- 存储区块链存证的完整数据（链式哈希存储）
-- ============================================
CREATE TABLE IF NOT EXISTS block (
    id INT AUTO_INCREMENT PRIMARY KEY COMMENT '主键',
    block_hash VARCHAR(32) NOT NULL COMMENT '当前区块哈希(MD5)',
    previous_hash VARCHAR(32) DEFAULT '0' COMMENT '前一区块哈希(创世块为0)',
    proof_code VARCHAR(17) NOT NULL COMMENT '溯源码',
    prod_date VARCHAR(8) NOT NULL COMMENT '生产日期(YYYYMMDD)',
    region_code VARCHAR(6) NOT NULL COMMENT '区域码',
    variety_code VARCHAR(1) NOT NULL COMMENT '品种码',
    batch_no VARCHAR(2) NOT NULL COMMENT '批次号',
    salt_value VARCHAR(32) DEFAULT 'qinjiao' COMMENT '密钥盐值',
    raw_material VARCHAR(200) NOT NULL COMMENT '拼接原文',
    md5_hash VARCHAR(32) NOT NULL COMMENT 'MD5存证哈希',
    verify_code VARCHAR(8) NOT NULL COMMENT '验证码',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '区块时间',
    INDEX idx_block_hash (block_hash),
    INDEX idx_previous_hash (previous_hash),
    INDEX idx_proof_code (proof_code),
    INDEX idx_verify_code (verify_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='区块链-区块记录表(链式存证)';

-- 插入创世区块
INSERT INTO block (block_hash, previous_hash, proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code, created_at)
SELECT MD5('GENESIS|qinjiao|20250101|610113|A|01|0'), '0', 'GENESIS', '20250101', '610113', 'A', '01', 'qinjiao', 'GENESIS|qinjiao|20250101|610113|A|01|0', MD5('GENESIS|qinjiao|20250101|610113|A|01|0'), 'GENESIS', '2025-01-01 00:00:00'
WHERE NOT EXISTS (SELECT 1 FROM block WHERE proof_code = 'GENESIS');

-- 显示创建的表
SHOW TABLES;

