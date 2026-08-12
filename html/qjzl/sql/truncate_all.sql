-- ============================================
-- 辣椒智慧农业 - 清空所有数据并重置ID
-- 说明：执行后所有表数据被清空，ID从1重新开始
-- 用法: mysql -u root -p qjzl < truncate_all.sql
-- ============================================

-- 禁用外键检查（防止 truncate 时报错）
SET FOREIGN_KEY_CHECKS = 0;

-- 清空所有表并重置 AUTO_INCREMENT
TRUNCATE TABLE sensor_data;
TRUNCATE TABLE device_status_history;
TRUNCATE TABLE login_logs;
TRUNCATE TABLE ai_analysis_history;
TRUNCATE TABLE vehicle_data;
TRUNCATE TABLE vehicle_config;
TRUNCATE TABLE system_logs;
TRUNCATE TABLE pictrue;
TRUNCATE TABLE blockchain_proof;
TRUNCATE TABLE blockchain_records;
TRUNCATE TABLE block;

-- 重新启用外键检查
SET FOREIGN_KEY_CHECKS = 1;

-- 重新插入创世区块
INSERT INTO block (block_hash, previous_hash, proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code, created_at)
SELECT MD5('GENESIS|qinjiao|20250101|610113|A|01|0'), '0', 'GENESIS', '20250101', '610113', 'A', '01', 'qinjiao', 'GENESIS|qinjiao|20250101|610113|A|01|0', MD5('GENESIS|qinjiao|20250101|610113|A|01|0'), 'GENESIS', '2025-01-01 00:00:00'
WHERE NOT EXISTS (SELECT 1 FROM block WHERE proof_code = 'GENESIS');

SELECT '所有数据已清空，ID 已重置' AS result;
