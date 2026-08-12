#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
辣椒智慧农业 - 产品溯源系统
=============================
基于 Flask 的动态溯源系统：
- 每个溯源码对应独立的溯源界面
- 传感器数据和图片从 MySQL 数据库实时获取
- 动态生成二维码，扫不同码进入不同界面
"""
import os
import re
import io
import json
import base64
import random
import socket
import datetime
import time
import hashlib
import pymysql
import requests
from flask import Flask, request, send_file, render_template_string, jsonify

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_NAME', 'qjzl'),
    'charset': 'utf8mb4'
}

QWEN_API_KEY = os.environ.get('QWEN_API_KEY', '')
CACHE_FILE = os.path.join(os.path.dirname(__file__), 'image_stage_cache.json')

def load_stage_cache():
    try:
        with open(CACHE_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except:
        return {}

def save_stage_cache(cache):
    try:
        with open(CACHE_FILE, 'w', encoding='utf-8') as f:
            json.dump(cache, f, ensure_ascii=False, indent=2)
    except:
        pass

def detect_image_mime(data):
    if not data or len(data) < 4:
        return 'image/jpeg'
    header = data[:4].hex().upper()
    if header.startswith('89504E47'):
        return 'image/png'
    if header.startswith('FFD8FF'):
        return 'image/jpeg'
    if header.startswith('474946'):
        return 'image/gif'
    if header.startswith('424D'):
        return 'image/bmp'
    if header.startswith('524946'):
        return 'image/webp'
    return 'image/jpeg'

def classify_image_stage(image_id, image_data):
    cache = load_stage_cache()
    if str(image_id) in cache:
        return cache[str(image_id)]
    mime = detect_image_mime(image_data)
    img_b64 = base64.b64encode(image_data).decode('utf-8')
    data_uri = f'data:{mime};base64,{img_b64}'
    if QWEN_API_KEY:
        api_url = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions'
        models_to_try = ['qwen-vl-plus', 'qwen3-vl-plus']
        for model_name in models_to_try:
            for retry in range(2):
                try:
                    print(f'  [Qwen-VL] trying model: {model_name} (attempt {retry+1})')
                    response = requests.post(
                        api_url,
                        headers={'Authorization': f'Bearer {QWEN_API_KEY}', 'Content-Type': 'application/json'},
                        json={
                            'model': model_name,
                            'messages': [
                                {'role': 'system', 'content': 'You are an agricultural expert. Judge the growth stage of pepper(Qinjiao) from images:\n- seedling: young plants/sprouts\n- grow: vegetative growth to flowering/fruiting\n- harvest: peppers are ripe or being harvested\n- other: no pepper plants\nReturn only the English category name.'},
                                {'role': 'user', 'content': [{'type': 'text', 'text': 'Which stage does this image belong to? Output only the English word.'}, {'type': 'image_url', 'image_url': {'url': data_uri}}]}
                            ],
                            'max_tokens': 20,
                            'temperature': 0
                        },
                        timeout=30
                    )
                    if response.status_code == 200:
                        result = response.json()
                        reply = result['choices'][0]['message']['content'].strip().lower()
                        print(f'  [OK] model {model_name} returned: {reply}')
                        for stage in ['seedling', 'grow', 'harvest']:
                            if stage in reply:
                                cache[str(image_id)] = stage
                                save_stage_cache(cache)
                                return stage
                        cache[str(image_id)] = 'unknown'
                        save_stage_cache(cache)
                        return 'unknown'
                    else:
                        error_text = response.text[:200]
                        print(f'  [WARN] model {model_name} failed: {response.status_code} - {error_text}')
                        if retry == 0:
                            print('  [RETRY] will retry...')
                            time.sleep(1)
                        continue
                except Exception as e:
                    print(f'  [WARN] model {model_name} error: {e}')
                    if retry == 0:
                        print('  [RETRY] will retry...')
                        time.sleep(1)
                    continue
                break
    else:
        print('  [WARN] QWEN_API_KEY not configured')
    print(f'  [FAIL] Image recognition failed (ID={image_id})')
    return None

def get_images_grouped_by_ai():
    groups = {'seedling': [], 'grow': [], 'harvest': []}
    try:
        conn = get_db()
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT id, filename, stage, created_at FROM pictrue WHERE stage IN ('seedling', 'grow', 'harvest') ORDER BY created_at DESC")
            all_images = list(cursor.fetchall() or [])
        conn.close()
        for img in all_images:
            stage = img.get('stage')
            if stage in groups and len(groups[stage]) < 3:
                groups[stage].append(img)
        total = sum(len(v) for v in groups.values())
        print(f'  [OK] Trace images: seedling={len(groups["seedling"])}, grow={len(groups["grow"])}, harvest={len(groups["harvest"])} (total={total})')
    except Exception as e:
        print(f'  [WARN] Query images failed: {e}')
    return groups

def get_local_ip():
    """获取本机IP，优先使用环境变量 SERVER_IP 或 HOST_IP"""
    env_ip = os.environ.get('SERVER_IP') or os.environ.get('HOST_IP')
    if env_ip:
        return env_ip
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"

IP = os.environ.get('SERVER_IP') or get_local_ip()
PORT = 5500
app = Flask(__name__)

# ===== CORS 支持（允许跨域请求）=====
@app.after_request
def add_cors_headers(response):
    response.headers['Access-Control-Allow-Origin'] = '*'
    response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
    return response

def get_db():
    return pymysql.connect(**DB_CONFIG)

def query_sensor_data(device_id=None, start_time=None, end_time=None, limit=50):
    conn = get_db()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            sql = "SELECT * FROM sensor_data WHERE 1=1"
            params = []
            if device_id:
                sql += " AND device_id = %s"
                params.append(device_id)
            if start_time:
                sql += " AND record_time >= %s"
                params.append(start_time)
            if end_time:
                sql += " AND record_time <= %s"
                params.append(end_time)
            sql += " ORDER BY record_time DESC LIMIT %s"
            params.append(limit)
            cursor.execute(sql, params)
            return cursor.fetchall()
    finally:
        conn.close()

def query_recent_sensor_data(location=None, limit=20):
    conn = get_db()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            sql = "SELECT s1.* FROM sensor_data s1 INNER JOIN (SELECT sensor_type, MAX(record_time) AS max_time FROM sensor_data"
            if location:
                sql += " WHERE location = %s"
            sql += " GROUP BY sensor_type) s2 ON s1.sensor_type = s2.sensor_type AND s1.record_time = s2.max_time"
            if location:
                sql += " WHERE s1.location = %s"
            sql += " ORDER BY s1.sensor_type"
            params = []
            if location:
                params = [location, location]
            cursor.execute(sql, params)
            return cursor.fetchall()
    finally:
        conn.close()

def get_image_data(image_id):
    conn = get_db()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT image_data, filename, created_at FROM pictrue WHERE id = %s", (image_id,))
            return cursor.fetchone()
    finally:
        conn.close()

def query_vehicle_data(vehicle_number=None, limit=5):
    conn = get_db()
    try:
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            sql = "SELECT * FROM vehicle_data WHERE 1=1"
            params = []
            if vehicle_number:
                sql += " AND vehicle_number = %s"
                params.append(vehicle_number)
            sql += " ORDER BY record_time DESC LIMIT %s"
            params.append(limit)
            cursor.execute(sql, params)
            return cursor.fetchall()
    finally:
        conn.close()

def parse_trace_code(code):
    code = code.strip().upper()
    if len(code) != 17:
        return None
    region = code[0:6]
    date_str = code[6:14]
    variety = code[14:15]
    serial = code[15:17]
    region_map = {
        '610113': '陕西省咸阳市秦都区',
        '610112': '陕西省咸阳市渭城区',
        '610104': '陕西省西安市莲湖区',
    }
    region_name = region_map.get(region, f'陕西省 (区域码:{region})')
    variety_map = {'A': '线椒', 'B': '朝天椒', 'C': '二荆条', 'D': '小米椒'}
    variety_name = variety_map.get(variety, '辣椒')
    try:
        dt = datetime.datetime.strptime(date_str, '%Y%m%d')
        date_formatted = dt.strftime('%Y年%m月%d日')
    except ValueError:
        return None
    return {
        'code': code, 'region': region, 'region_name': region_name,
        'date_str': date_str, 'date_formatted': date_formatted,
        'year': date_str[0:4], 'month': date_str[4:6], 'day': date_str[6:8],
        'variety': variety, 'variety_name': variety_name, 'serial': serial,
        'batch': f'{date_str}-{variety}'
    }

@app.route('/')
def index():
    return render_template_string(INDEX_HTML)

@app.route('/debug')
def debug():
    info = ['## 数据库连接信息']
    info.append(f'- 主机: {DB_CONFIG["host"]}')
    info.append(f'- 端口: {DB_CONFIG["port"]}')
    info.append(f'- 数据库: {DB_CONFIG["database"]}')
    info.append(f'- 用户: {DB_CONFIG["user"]}')
    try:
        conn = get_db()
        info.append('- 数据库连接成功')
        with conn.cursor() as cursor:
            cursor.execute("SHOW TABLES")
            tables = cursor.fetchall()
            info.append(f'- 共有 {len(tables)} 张表')
            for t in tables:
                info.append(f'  - {t[0]}')
            cursor.execute("SELECT COUNT(*) as cnt FROM pictrue")
            cnt = cursor.fetchone()
            row_count = cnt[0] if isinstance(cnt, tuple) else cnt['cnt']
            info.append(f'- pictrue 表共有 {row_count} 条记录')
        conn.close()
    except Exception as e:
        info.append(f'- 数据库错误: {str(e)}')
    html = '<html><body style="font-family:monospace;padding:20px;background:#1a1a2e;color:#e0e0e0;">'
    for line in info:
        html += f'<div style="margin:4px 0">{line}</div>'
    html += '</body></html>'
    return html

@app.route('/get_qr')
@app.route('/qr')
def generate_qr():
    import qrcode
    code = request.args.get('code', '61011320251001A15').strip().upper()
    qr_url = f"http://{IP}:{PORT}/trace?code={code}"
    qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=4)
    qr.add_data(qr_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#c62828", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    buf.seek(0)
    return send_file(buf, mimetype='image/png')

@app.route('/trace')
def trace():
    code = request.args.get('code', '61011320251001A15').strip().upper()
    parsed = parse_trace_code(code)
    if not parsed:
        return '<h2 style="color:red;text-align:center;padding:50px">无效的溯源码，请检查后重试</h2>'
    sensor_data_list = []
    vehicle_data_list = []
    cold_chain_info = None
    dt_base = datetime.datetime.strptime(parsed['date_str'], '%Y%m%d')
    start_range = (dt_base - datetime.timedelta(days=90)).strftime('%Y-%m-%d')
    end_range = (dt_base + datetime.timedelta(days=30)).strftime('%Y-%m-%d')
    raw_sensors = query_sensor_data(start_time=start_range, end_time=end_range, limit=100)
    seen_types = set()
    if raw_sensors:
        for row in raw_sensors:
            st = row.get('sensor_type', '')
            if st not in seen_types and len(seen_types) < 12:
                seen_types.add(st)
                sensor_data_list.append(row)
    if len(sensor_data_list) < 4:
        locations = ['幼苗区', '种植区', '烘干区', '冷链区']
        for loc in locations:
            recent = query_recent_sensor_data(location=loc, limit=5)
            for row in recent:
                if row['sensor_type'] not in seen_types:
                    seen_types.add(row['sensor_type'])
                    sensor_data_list.append(row)
    stage_image_map = get_images_grouped_by_ai()
    print(f'  [TRACE] Image allocation: seedling={len(stage_image_map["seedling"])}, grow={len(stage_image_map["grow"])}, harvest={len(stage_image_map["harvest"])}')
    vehicle_data_list = query_vehicle_data(limit=5)
    if vehicle_data_list:
        cold_chain_info = vehicle_data_list[0]
    year = parsed['year']
    sensor_groups = {'幼苗区': [], '种植区_环境': [], '种植区_土壤': [], '种植区_其他': [], '烘干区': [], '冷链': []}
    for s in sensor_data_list:
        st = s.get('sensor_type', '')
        name = s.get('sensor_name', st)
        val = s.get('value', 0)
        unit = s.get('unit', '')
        loc = s.get('location', '')
        item = {'name': name, 'value': float(val), 'unit': unit, 'type': st, 'location': loc}
        if loc == '幼苗区':
            sensor_groups['幼苗区'].append(item)
        elif loc == '种植区':
            if st.startswith('e_'):
                sensor_groups['种植区_环境'].append(item)
            elif st.startswith('p_'):
                sensor_groups['种植区_土壤'].append(item)
            else:
                sensor_groups['种植区_其他'].append(item)
        elif loc == '烘干区':
            sensor_groups['烘干区'].append(item)
        elif loc in ('冷链区', '冷链运输区'):
            sensor_groups['冷链'].append(item)
        elif st.startswith('s_'):
            sensor_groups['幼苗区'].append(item)
        elif st.startswith('d_'):
            sensor_groups['烘干区'].append(item)
        else:
            sensor_groups['种植区_其他'].append(item)
    def pick_random(items, count=3):
        valid = [x for x in items if '人体' not in x.get('name', '')]
        return random.sample(valid, min(count, len(valid))) if len(valid) >= count else valid
    seedling_sensors = pick_random(sensor_groups['幼苗区'])
    grow_env = pick_random(sensor_groups['种植区_环境'])
    grow_soil = pick_random(sensor_groups['种植区_土壤'])
    grow_other = pick_random(sensor_groups['种植区_其他'])
    cold_sensors = pick_random(sensor_groups['冷链'])
    dry_sensors = pick_random(sensor_groups['烘干区'])
    seedling_imgs = stage_image_map.get('seedling', [])
    grow_imgs = stage_image_map.get('grow', [])
    harvest_imgs = stage_image_map.get('harvest', [])
    stages = [
        {'icon': 'seedling', 'title': f'{year}年03月 - 育苗播种期', 'location': f'{parsed["region_name"]} · 幼苗培育基地', 'desc': '精选优质种子，采用有机育苗基质，温控催芽，确保苗齐苗壮。', 'sensors': seedling_sensors, 'images': seedling_imgs},
        {'icon': 'tint', 'title': f'{year}年05月-09月 - 生长开花期', 'location': f'{parsed["region_name"]} · 辣椒种植示范区', 'desc': '智能滴灌系统精准供水，充分日照促进营养生长和开花坐果。', 'sensors': grow_env if grow_env else (grow_soil if grow_soil else grow_other), 'images': grow_imgs},
        {'icon': 'harvest', 'title': f'{year}年10月 - 采收加工期', 'location': f'{parsed["region_name"]} · 辣椒加工车间', 'desc': f'严格筛选优质{parsed["variety_name"]}，品质检测合格后包装入库。', 'sensors': dry_sensors, 'images': harvest_imgs},
    ]
    cold_chain = None
    if cold_chain_info:
        cold_chain = {'temp': f'{float(cold_chain_info.get("temperature", 8.5)):.1f}°C', 'humidity': f'{float(cold_chain_info.get("humidity", 92)):.1f}%', 'co2': f'{float(cold_chain_info.get("co2_level", 12000)):.0f}ppm'}
    # 动态生成数据可信度评分
    trust_score = random.randint(85, 97)
    integrity_pct = random.randint(88, 98)
    authenticity_pct = random.randint(85, 96)
    coverage_pct = random.randint(82, 95)

    # 动态生成检测数据
    pesti_options = ['未检出超标', '未检出', '检出值 ≤ 0.01 mg/kg', '检出值 ≤ 0.005 mg/kg', '符合国标限量']
    heavy_metal_options = [f'Pb ≤ {random.choice(["0.01","0.02","0.03","0.05"])} mg/kg', f'Cd ≤ {random.choice(["0.005","0.01","0.02"])} mg/kg', f'As ≤ {random.choice(["0.01","0.02","0.05"])} mg/kg', f'Hg ≤ {random.choice(["0.001","0.002","0.005"])} mg/kg']
    capsaicin_options = [f'≥ {random.choice(["2.5","2.8","3.0","3.2","3.5"])} mg/g', f'{random.choice(["2.6","2.9","3.1","3.3"])} mg/g']
    moisture_options = [f'≤ {random.choice(["12.0","12.5","13.0","11.5"])}%', f'{random.choice(["11.2","11.8","12.2","10.5"])}%']
    inspect_data = {
        'pesticide': {'label': '农残检测', 'value': random.choice(pesti_options), 'status': '合格'},
        'heavy_metal': {'label': '重金属检测', 'value': random.choice(heavy_metal_options), 'status': '合格'},
        'capsaicin': {'label': '辣椒素含量', 'value': random.choice(capsaicin_options), 'status': '达标'},
        'moisture': {'label': '水分含量', 'value': random.choice(moisture_options), 'status': '合格'},
    }

    # 生成区块链存证MD5哈希
    block_tx_id = f"0x..."

    # 生成随机验证码（6位数字+字母）
    import string as _str
    verify_code = ''.join(random.choices(_str.ascii_uppercase + _str.digits, k=6))

    # 每次查询随机生成存证数据（批次号、品种码等）
    import random as _rd
    _rand_batch = str(_rd.randint(1, 99)).zfill(2)
    _rand_varieties = ['A','B','C','D','E']
    _rand_variety = _rd.choice(_rand_varieties)
    _rand_regions = ['610113','610112','610104','610102','610103','610111']
    _rand_region = _rd.choice(_rand_regions)
    _rand_dates = [str(datetime.datetime.now().year) + ('0'+str(_rd.randint(1,12)))[-2:] + ('0'+str(_rd.randint(1,28)))[-2:] for _ in range(1)][0]
    _rand_salt = 'qinjiao'
    _rand_raw = f"{code}|{_rand_dates}|{_rand_region}|{_rand_variety}|{_rand_batch}|{_rand_salt}"
    _rand_hash = hashlib.md5(_rand_raw.encode('utf-8')).hexdigest().upper()
    block_tx_id = f"0x{_rand_hash[:16]}...{_rand_hash[-16:]}"

    # 每次查询都新增一条区块链存证记录（历史记录）
    # 先写入存证记录表
    try:
        conn1 = get_db()
        with conn1.cursor() as cursor:
            sql = """INSERT INTO blockchain_proof 
                     (proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code)
                     VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)"""
            cursor.execute(sql, (code, _rand_dates, _rand_region, _rand_variety, _rand_batch, _rand_salt, _rand_raw, _rand_hash, verify_code))
            conn1.commit()
        conn1.close()
    except Exception:
        pass  # 存证入库失败不影响溯源页面展示
    # 再写入链式区块表（独立事务，互不影响）
    try:
        conn2 = get_db()
        with conn2.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT block_hash FROM block ORDER BY id DESC LIMIT 1")
            prev_row = cursor.fetchone()
            prev_hash = prev_row['block_hash'] if prev_row else '0'
            cursor.execute("""
                INSERT INTO block (block_hash, previous_hash, proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (_rand_hash, prev_hash, code, _rand_dates, _rand_region, _rand_variety, _rand_batch, _rand_salt, _rand_raw, _rand_hash, verify_code))
            conn2.commit()
        conn2.close()
    except Exception:
        pass  # 区块入库失败不影响溯源页面展示

    return render_template_string(TRACE_HTML, code=code, parsed=parsed, stages=stages, cold_chain=cold_chain, sensor_data_list=sensor_data_list, vehicle_data_list=vehicle_data_list, has_data=len(sensor_data_list) > 0, trust_score=trust_score, integrity_pct=integrity_pct, authenticity_pct=authenticity_pct, coverage_pct=coverage_pct, block_hash=_rand_hash, block_tx_id=block_tx_id, hash_input=_rand_raw, verify_code=verify_code, inspect_data=inspect_data, IP=IP, PORT=PORT, rand_proof={'batch_no':_rand_batch, 'region_code':_rand_region, 'variety_code':_rand_variety, 'prod_date':_rand_dates})

@app.route('/api/image/<int:image_id>')
def api_image(image_id):
    data = get_image_data(image_id)
    if data and data['image_data']:
        return send_file(io.BytesIO(data['image_data']), mimetype='image/jpeg')
    return '', 404

# ==========================================
# 区块链查询 API
# ==========================================
def init_blockchain_table():
    """初始化区块链存证记录表 和 区块表"""
    conn = None
    try:
        conn = get_db()
        with conn.cursor() as cursor:
            # 创建存证记录表
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS blockchain_proof (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    proof_code VARCHAR(17) NOT NULL COMMENT '溯源码',
                    prod_date VARCHAR(8) NOT NULL COMMENT '生产日期',
                    region_code VARCHAR(6) NOT NULL COMMENT '区域码',
                    variety_code VARCHAR(1) NOT NULL COMMENT '品种码',
                    batch_no VARCHAR(2) NOT NULL COMMENT '批次号',
                    salt_value VARCHAR(32) DEFAULT 'qinjiao' COMMENT '密钥盐值',
                    raw_material VARCHAR(200) NOT NULL COMMENT '拼接原文',
                    md5_hash VARCHAR(32) NOT NULL COMMENT 'MD5存证哈希',
                    verify_code VARCHAR(8) NOT NULL COMMENT '随机验证码',
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '存证时间',
                    INDEX idx_proof_code (proof_code),
                    INDEX idx_md5_hash (md5_hash),
                    INDEX idx_verify_code (verify_code)
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='区块链存证记录表'
            """)
            # 检查是否有verify_code列，没有则添加（兼容旧表）
            cursor.execute("SHOW COLUMNS FROM blockchain_proof LIKE 'verify_code'")
            if not cursor.fetchone():
                cursor.execute("ALTER TABLE blockchain_proof ADD COLUMN verify_code VARCHAR(8) NOT NULL DEFAULT '' COMMENT '随机验证码' AFTER md5_hash")

            # 创建区块表（链式存储），包含完整存证字段
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS block (
                    id INT AUTO_INCREMENT PRIMARY KEY,
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
                ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='区块链-区块记录表(链式)'
            """)
            # 给已有 block 表补充缺失的列（兼容旧表）
            for col in ['prod_date', 'region_code', 'variety_code', 'batch_no', 'salt_value', 'md5_hash']:
                cursor.execute(f"SHOW COLUMNS FROM block LIKE '{col}'")
                if not cursor.fetchone():
                    col_defs = {
                        'prod_date': "VARCHAR(8) NOT NULL DEFAULT '' COMMENT '生产日期(YYYYMMDD)' AFTER proof_code",
                        'region_code': "VARCHAR(6) NOT NULL DEFAULT '' COMMENT '区域码' AFTER prod_date",
                        'variety_code': "VARCHAR(1) NOT NULL DEFAULT '' COMMENT '品种码' AFTER region_code",
                        'batch_no': "VARCHAR(2) NOT NULL DEFAULT '' COMMENT '批次号' AFTER variety_code",
                        'salt_value': "VARCHAR(32) DEFAULT 'qinjiao' COMMENT '密钥盐值' AFTER batch_no",
                        'md5_hash': "VARCHAR(32) NOT NULL DEFAULT '' COMMENT 'MD5存证哈希' AFTER raw_material",
                    }
                    cursor.execute(f"ALTER TABLE block ADD COLUMN {col} {col_defs[col]}")
                    print(f"  [DB] block 表补充字段: {col}")

            # 插入创世区块
            cursor.execute("SELECT COUNT(*) as cnt FROM block")
            if cursor.fetchone()[0] == 0:
                _genesis_raw = "GENESIS|qinjiao|20250101|610113|A|01|0"
                _genesis_hash = hashlib.md5(_genesis_raw.encode('utf-8')).hexdigest().upper()
                cursor.execute("""
                    INSERT INTO block (block_hash, previous_hash, proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code, created_at)
                    VALUES (%s, '0', 'GENESIS', '20250101', '610113', 'A', '01', 'qinjiao', %s, %s, 'GENESIS', '2025-01-01 00:00:00')
                """, (_genesis_hash, _genesis_raw, _genesis_hash))
                print("  [DB] 创世区块已插入")

            # 将已有 blockchain_proof 数据迁移到 block 表（防止重复）
            cursor.execute("""
                INSERT IGNORE INTO block (block_hash, previous_hash, proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code, created_at)
                SELECT md5_hash, '0', proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code, created_at
                FROM blockchain_proof bp
                WHERE NOT EXISTS (SELECT 1 FROM block b WHERE b.verify_code = bp.verify_code AND b.proof_code = bp.proof_code)
            """)
            migrated = cursor.rowcount
            if migrated > 0:
                print(f"  [DB] 新迁移 {migrated} 条存证记录到 block 表")
            # 补充更新已有 block 记录缺失的字段（兼容旧数据）
            cursor.execute("""
                UPDATE block b
                JOIN blockchain_proof bp ON b.verify_code = bp.verify_code AND b.proof_code = bp.proof_code
                SET b.prod_date = bp.prod_date,
                    b.region_code = bp.region_code,
                    b.variety_code = bp.variety_code,
                    b.batch_no = bp.batch_no,
                    b.salt_value = bp.salt_value,
                    b.md5_hash = bp.md5_hash,
                    b.block_hash = bp.md5_hash
                WHERE (b.prod_date IS NULL OR b.prod_date = '')
                  AND bp.prod_date IS NOT NULL AND bp.prod_date != ''
            """)
            updated = cursor.rowcount
            if updated > 0:
                print(f"  [DB] 补充更新 {updated} 条已有 block 记录")

            conn.commit()
            print(f"  [DB] 区块链存证表 和 区块表已就绪")
    except Exception as e:
        print(f"  [DB] 创建表失败: {e}")
    finally:
        if conn:
            conn.close()

@app.route('/api/blockchain', methods=['GET'])
def api_blockchain_list():
    """获取区块链存证记录列表，支持时间筛选"""
    conn = None
    try:
        conn = get_db()
        start_date = request.args.get('start_date', '')
        end_date = request.args.get('end_date', '')

        sql = "SELECT id, proof_code, prod_date, region_code, variety_code, batch_no, salt_value, raw_material, md5_hash, verify_code, created_at FROM block"
        params = []
        conditions = []

        if start_date:
            conditions.append("created_at >= %s")
            params.append(start_date + ' 00:00:00')
        if end_date:
            conditions.append("created_at <= %s")
            params.append(end_date + ' 23:59:59')

        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
        sql += " ORDER BY created_at DESC LIMIT 200"

        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            for r in rows:
                if isinstance(r.get('created_at'), datetime.datetime):
                    r['created_at'] = r['created_at'].strftime('%Y-%m-%d %H:%M:%S')
            return jsonify({'success': True, 'data': rows, 'total': len(rows)})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        if conn:
            conn.close()

@app.route('/api/blockchain/verify-code', methods=['POST'])
def api_blockchain_verify_code():
    """通过验证码查询并验证区块链存证"""
    data = request.get_json()
    if not data or 'verify_code' not in data:
        return jsonify({'success': False, 'message': '缺少参数 verify_code'})
    code = data['verify_code'].strip().upper()
    conn = None
    try:
        conn = get_db()
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM block WHERE verify_code = %s", (code,))
            row = cursor.fetchone()
            if not row:
                return jsonify({'success': False, 'message': '验证码无效或记录不存在'})
            # 重新计算哈希验证
            expected_hash = hashlib.md5(row['raw_material'].encode('utf-8')).hexdigest().upper()
            match = (expected_hash == row['md5_hash'])
            return jsonify({
                'success': True,
                'data': {
                    'id': row['id'],
                    'proof_code': row['proof_code'],
                    'prod_date': row['prod_date'],
                    'region_code': row['region_code'],
                    'variety_code': row['variety_code'],
                    'batch_no': row['batch_no'],
                    'salt_value': row['salt_value'],
                    'raw_material': row['raw_material'],
                    'stored_hash': row['md5_hash'],
                    'computed_hash': expected_hash,
                    'match': match,
                    'verify_code': row['verify_code'],
                    'created_at': row['created_at'].strftime('%Y-%m-%d %H:%M:%S') if isinstance(row.get('created_at'), datetime.datetime) else str(row.get('created_at',''))
                }
            })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        if conn:
            conn.close()

@app.route('/api/blockchain/verify', methods=['POST'])
def api_blockchain_verify():
    """验证区块链存证哈希"""
    data = request.get_json()
    if not data or 'record_id' not in data:
        return jsonify({'success': False, 'message': '缺少参数 record_id'})
    conn = None
    try:
        conn = get_db()
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT * FROM block WHERE id = %s", (data['record_id'],))
            row = cursor.fetchone()
            if not row:
                return jsonify({'success': False, 'message': '记录不存在'})
            expected_hash = hashlib.md5(row['raw_material'].encode('utf-8')).hexdigest().upper()
            match = (expected_hash == row['md5_hash'])
            return jsonify({
                'success': True,
                'data': {
                    'id': row['id'],
                    'proof_code': row['proof_code'],
                    'raw_material': row['raw_material'],
                    'stored_hash': row['md5_hash'],
                    'computed_hash': expected_hash,
                    'match': match
                }
            })
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        if conn:
            conn.close()

# ==========================================
# Block 区块链区块 API
# ==========================================
@app.route('/api/blockchain/block', methods=['GET'])
def api_block_list():
    """获取区块列表（倒序，最新的在前）"""
    conn = None
    try:
        conn = get_db()
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT id, block_hash, previous_hash, proof_code, raw_material, verify_code, created_at FROM block ORDER BY id DESC LIMIT 200")
            rows = cursor.fetchall()
            for r in rows:
                if isinstance(r.get('created_at'), datetime.datetime):
                    r['created_at'] = r['created_at'].strftime('%Y-%m-%d %H:%M:%S')
            return jsonify({'success': True, 'data': rows, 'total': len(rows)})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        if conn:
            conn.close()

@app.route('/api/blockchain/block/chain', methods=['GET'])
def api_block_chain():
    """获取完整区块链（从创世块开始正序）"""
    conn = None
    try:
        conn = get_db()
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT id, block_hash, previous_hash, proof_code, raw_material, verify_code, created_at FROM block ORDER BY id ASC")
            rows = cursor.fetchall()
            for r in rows:
                if isinstance(r.get('created_at'), datetime.datetime):
                    r['created_at'] = r['created_at'].strftime('%Y-%m-%d %H:%M:%S')
            # 验证链完整性
            valid = True
            for i in range(1, len(rows)):
                if rows[i]['previous_hash'] != rows[i-1]['block_hash']:
                    valid = False
                    break
            return jsonify({'success': True, 'data': rows, 'total': len(rows), 'chain_valid': valid})
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)})
    finally:
        if conn:
            conn.close()

# ==========================================
# 首页 HTML 模板
# ==========================================
INDEX_HTML = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>辣椒智慧农业 · 产品溯源系统</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background:
                radial-gradient(ellipse at 20% 50%, rgba(198,40,40,0.06) 0%, transparent 50%),
                radial-gradient(ellipse at 80% 50%, rgba(46,125,50,0.06) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 0%, rgba(198,40,40,0.04) 0%, transparent 40%),
                linear-gradient(135deg, #fff5f5 0%, #f0faf0 40%, #fef0f0 70%, #fff5f5 100%);
            position: relative;
            overflow-x: hidden;
        }
        /* ===== 动态网格背景 ===== */
        body::before {
            content: '';
            position: fixed;
            inset: 0;
            background-image:
                linear-gradient(rgba(198,40,40,0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(46,125,50,0.04) 1px, transparent 1px);
            background-size: 40px 40px;
            pointer-events: none;
            z-index: 0;
            animation: gridDrift 8s ease-in-out infinite;
            mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
            -webkit-mask-image: radial-gradient(ellipse at center, black 30%, transparent 70%);
        }
        @keyframes gridDrift {
            0%, 100% { opacity: 0.4; transform: translate(0, 0); }
            25% { opacity: 0.7; transform: translate(5px, 5px); }
            50% { opacity: 0.5; transform: translate(0, 8px); }
            75% { opacity: 0.7; transform: translate(-5px, 3px); }
        }
        /* ===== 浮动流光粒子 ===== */
        .glow-orb {
            position: fixed;
            border-radius: 50%;
            pointer-events: none;
            z-index: 0;
            filter: blur(40px);
            animation: orbFloat 14s ease-in-out infinite;
        }
        .glow-orb:nth-child(1) {
            width: 180px; height: 180px;
            background: rgba(198,40,40,0.06);
            top: -5%; left: -5%;
            animation-delay: 0s;
        }
        .glow-orb:nth-child(2) {
            width: 140px; height: 140px;
            background: rgba(46,125,50,0.05);
            bottom: -5%; right: -5%;
            animation-delay: 4s;
        }
        .glow-orb:nth-child(3) {
            width: 100px; height: 100px;
            background: rgba(198,40,40,0.04);
            bottom: 30%; right: 5%;
            animation-delay: 8s;
        }
        .glow-orb:nth-child(4) {
            width: 120px; height: 120px;
            background: rgba(46,125,50,0.04);
            top: 40%; left: 3%;
            animation-delay: 2s;
        }
        @keyframes orbFloat {
            0%, 100% { transform: translate(0, 0) scale(1); opacity: 0.6; }
            33% { transform: translate(30px, -20px) scale(1.1); opacity: 0.9; }
            66% { transform: translate(-20px, 15px) scale(0.9); opacity: 0.5; }
        }
        /* ===== 星光粒子 ===== */
        .star {
            position: fixed;
            width: 2px; height: 2px;
            background: #c62828;
            border-radius: 50%;
            pointer-events: none;
            z-index: 0;
            animation: twinkle 3s ease-in-out infinite;
        }
        .star:nth-child(5) { top: 12%; left: 8%; animation-delay: 0s; opacity: 0.3; }
        .star:nth-child(6) { top: 75%; left: 6%; animation-delay: 1s; opacity: 0.25; width: 3px; height: 3px; }
        .star:nth-child(7) { top: 30%; right: 10%; animation-delay: 2s; opacity: 0.2; }
        .star:nth-child(8) { bottom: 15%; right: 15%; animation-delay: 0.5s; opacity: 0.3; width: 3px; height: 3px; background: #2e7d32; }
        .star:nth-child(9) { top: 55%; left: 50%; animation-delay: 1.5s; opacity: 0.15; }
        .star:nth-child(10) { top: 85%; left: 30%; animation-delay: 2.5s; opacity: 0.2; }
        .star:nth-child(11) { top: 8%; right: 25%; animation-delay: 0.8s; opacity: 0.25; }
        .star:nth-child(12) { bottom: 40%; right: 8%; animation-delay: 1.8s; opacity: 0.15; width: 3px; height: 3px; background: #2e7d32; }
        @keyframes twinkle {
            0%, 100% { opacity: var(--star-op, 0.3); transform: scale(1); }
            50% { opacity: 0.8; transform: scale(1.8); }
        }
        @keyframes float {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-15px) rotate(5deg); }
        }
        .container {
            max-width: 420px;
            width: 100%;
            background: rgba(255,255,255,0.88);
            backdrop-filter: blur(28px);
            -webkit-backdrop-filter: blur(28px);
            border-radius: 28px;
            box-shadow:
                0 30px 100px rgba(0,0,0,0.06),
                0 0 0 1px rgba(255,255,255,0.7),
                inset 0 1px 0 rgba(255,255,255,0.8);
            padding: 40px 30px 30px;
            text-align: center;
            position: relative;
            z-index: 1;
            overflow: hidden;
            animation: fadeUp 0.7s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeUp {
            from { opacity: 0; transform: translateY(40px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        /* ===== 顶部流光装饰条 ===== */
        .container::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 4px;
            background: linear-gradient(90deg, #c62828, #ef5350, #66bb6a, #2e7d32, #c62828);
            background-size: 400% 100%;
            animation: shimmerBar 5s ease infinite;
            z-index: 2;
        }
        @keyframes shimmerBar {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }
        /* ===== 顶部光晕装饰 ===== */
        .container::after {
            content: '';
            position: absolute;
            top: -80px;
            left: 50%;
            transform: translateX(-50%);
            width: 300px;
            height: 120px;
            background: radial-gradient(ellipse, rgba(198,40,40,0.04) 0%, transparent 70%);
            pointer-events: none;
            z-index: 0;
        }
        /* ===== 品牌区域 ===== */
        .brand-area {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 14px;
            margin-bottom: 6px;
            position: relative;
            z-index: 1;
        }
        .brand-icon-wrap {
            width: 54px; height: 54px;
            background: linear-gradient(135deg, rgba(198,40,40,0.08), rgba(46,125,50,0.06));
            border-radius: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 28px;
            box-shadow: 0 4px 15px rgba(198,40,40,0.06);
            border: 1px solid rgba(198,40,40,0.08);
            animation: iconFloat 4s ease-in-out infinite;
            position: relative;
            overflow: hidden;
        }
        .brand-icon-wrap::after {
            content: '';
            position: absolute;
            inset: 0;
            border-radius: inherit;
            background: linear-gradient(135deg, rgba(198,40,40,0.06), transparent 50%);
            pointer-events: none;
        }
        @keyframes iconFloat {
            0%, 100% { transform: translateY(0) rotate(0deg); }
            50% { transform: translateY(-8px) rotate(3deg); }
        }
        .brand-text {
            text-align: left;
        }
        h1 {
            font-size: 27px;
            font-weight: 900;
            letter-spacing: 1.5px;
            line-height: 1.2;
            background: linear-gradient(135deg, #c62828 0%, #e53935 40%, #2e7d32 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .subtitle {
            color: #aaa;
            font-size: 11px;
            letter-spacing: 1.5px;
            margin-top: 2px;
        }
        /* ===== 二维码区域 ===== */
        .qr-section {
            position: relative;
            margin: 22px auto 16px;
            width: 200px;
        }
        .qr-wrapper {
            width: 200px;
            height: 200px;
            padding: 12px;
            background: white;
            border-radius: 18px;
            box-shadow:
                0 8px 30px rgba(198,40,40,0.08),
                inset 0 0 0 1px rgba(198,40,40,0.05);
            transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.35s ease;
            position: relative;
            z-index: 1;
            overflow: hidden;
        }
        .qr-wrapper:hover {
            transform: scale(1.04);
            box-shadow: 0 12px 40px rgba(46,125,50,0.12);
        }
        .qr-wrapper img {
            width: 100%;
            height: 100%;
            display: block;
            border-radius: 8px;
        }
        /* ===== 二维码扫描线动画 ===== */
        .scan-line {
            position: absolute;
            left: 10px;
            right: 10px;
            height: 2px;
            background: linear-gradient(90deg, transparent, rgba(198,40,40,0.3), rgba(46,125,50,0.3), transparent);
            z-index: 2;
            animation: scanMove 2.8s ease-in-out infinite;
            pointer-events: none;
            box-shadow: 0 0 8px rgba(198,40,40,0.08);
        }
        @keyframes scanMove {
            0%, 100% { top: 12px; opacity: 0.4; }
            50% { top: calc(100% - 12px); opacity: 1; }
        }
        /* ===== QR 装饰光环 ===== */
        .qr-ring {
            position: absolute;
            top: -8px; left: -8px;
            right: -8px; bottom: -8px;
            border-radius: 24px;
            border: 2px solid rgba(198,40,40,0.06);
            animation: ringPulse 2.5s ease-in-out infinite;
            pointer-events: none;
        }
        .qr-ring-2 {
            position: absolute;
            top: -16px; left: -16px;
            right: -16px; bottom: -16px;
            border-radius: 30px;
            border: 1px solid rgba(46,125,50,0.04);
            animation: ringPulse 2.5s ease-in-out infinite 0.5s;
            pointer-events: none;
        }
        @keyframes ringPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.03); opacity: 0.5; }
        }
        .qr-label {
            font-size: 12px;
            color: #bbb;
            margin-top: 8px;
            letter-spacing: 1.5px;
        }
        /* ===== 输入组 ===== */
        .input-group {
            display: flex;
            gap: 10px;
            margin: 18px 0 12px;
            position: relative;
            z-index: 1;
        }
        .input-group .input-wrap {
            flex: 1;
            position: relative;
        }
        .input-group .input-wrap .input-icon {
            position: absolute;
            left: 14px;
            top: 50%;
            transform: translateY(-50%);
            font-size: 15px;
            pointer-events: none;
            opacity: 0.35;
            transition: opacity 0.3s;
        }
        .input-group .input-wrap:focus-within .input-icon {
            opacity: 0.6;
        }
        .input-group input {
            width: 100%;
            padding: 14px 14px 14px 40px;
            border: 2px solid #eee;
            border-radius: 14px;
            font-size: 16px;
            transition: border-color 0.3s, box-shadow 0.3s, background 0.3s;
            outline: none;
            letter-spacing: 2px;
            font-family: 'Courier New', monospace;
            background: #fafcfa;
        }
        .input-group input:focus {
            border-color: #2e7d32;
            box-shadow: 0 0 0 4px rgba(46,125,50,0.08), 0 4px 12px rgba(46,125,50,0.04);
            background: white;
        }
        .input-group input::placeholder {
            letter-spacing: 1px;
            font-family: inherit;
            color: #ccc;
            font-weight: 300;
        }
        .input-group button {
            padding: 14px 26px;
            background: linear-gradient(135deg, #c62828, #e53935);
            color: white;
            border: none;
            border-radius: 14px;
            font-size: 15px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
            white-space: nowrap;
            box-shadow: 0 4px 15px rgba(198,40,40,0.2);
            display: flex;
            align-items: center;
            gap: 6px;
            letter-spacing: 1px;
            position: relative;
            overflow: hidden;
        }
        .input-group button::after {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, transparent 40%, rgba(255,255,255,0.1) 100%);
            pointer-events: none;
        }
        .input-group button:hover {
            transform: translateY(-2px);
            background: linear-gradient(135deg, #2e7d32, #43a047);
            box-shadow: 0 8px 25px rgba(46,125,50,0.3);
        }
        .input-group button:active {
            transform: translateY(0);
        }
        /* ===== 示例码 ===== */
        .examples-label {
            font-size: 10px;
            color: #ccc;
            margin-bottom: 6px;
            letter-spacing: 1px;
        }
        .examples {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            justify-content: center;
        }
        .examples span {
            display: inline-block;
            padding: 6px 14px;
            background: #f5f7f5;
            border-radius: 10px;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            font-family: 'Courier New', monospace;
            font-size: 12px;
            color: #888;
            border: 1px solid #eee;
            position: relative;
        }
        .examples span:hover {
            background: linear-gradient(135deg, #e8f5e9, #f1f8e9);
            border-color: #81c784;
            color: #2e7d32;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(46,125,50,0.08);
        }
        .examples span:active {
            transform: translateY(0) scale(0.97);
        }
        /* ===== 提示框 ===== */
        .hint {
            margin-top: 18px;
            padding: 14px 18px;
            background: linear-gradient(135deg, rgba(198,40,40,0.04), rgba(46,125,50,0.03));
            border-radius: 14px;
            font-size: 13px;
            color: #666;
            line-height: 1.7;
            border-left: 3px solid #ef5350;
            text-align: left;
            position: relative;
            z-index: 1;
        }
        .hint strong {
            display: block;
            font-size: 11px;
            color: #bbb;
            margin-bottom: 2px;
            letter-spacing: 1px;
        }
        /* ===== 底部信任行 ===== */
        .trust-row {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 20px;
            padding-top: 18px;
            border-top: 1px solid #f0f0f0;
            position: relative;
            z-index: 1;
        }
        .trust-row .tr-item {
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: #bbb;
            letter-spacing: 0.5px;
            padding: 4px 10px;
            border-radius: 20px;
            transition: all 0.3s;
            cursor: default;
        }
        .trust-row .tr-item:hover {
            background: rgba(0,0,0,0.02);
            color: #999;
        }
        .trust-row .tr-item .tr-dot {
            width: 5px; height: 5px;
            border-radius: 50%;
            display: inline-block;
            transition: transform 0.3s;
        }
        .trust-row .tr-item:hover .tr-dot {
            transform: scale(1.5);
        }
        .trust-row .tr-item .tr-dot.red {
            background: #c62828;
            box-shadow: 0 0 4px rgba(198,40,40,0.3);
        }
        .trust-row .tr-item .tr-dot.green {
            background: #2e7d32;
            box-shadow: 0 0 4px rgba(46,125,50,0.3);
        }
        .footer-text {
            margin-top: 12px;
            font-size: 10px;
            color: #ddd;
            letter-spacing: 1.5px;
            position: relative;
            z-index: 1;
        }
        @media (max-width: 480px) {
            .container { padding: 28px 18px 22px; }
            h1 { font-size: 22px; }
            .qr-section, .qr-wrapper { width: 160px; height: 160px; }
            .qr-wrapper { padding: 10px; }
            .qr-section { margin: 18px auto 12px; }
            .input-group { flex-direction: column; }
            .input-group button { width: 100%; justify-content: center; padding: 14px; }
            .brand-area { flex-direction: column; text-align: center; }
            .brand-text { text-align: center; }
            .examples span { font-size: 11px; padding: 5px 10px; }
            .trust-row { gap: 4px; }
            .trust-row .tr-item { font-size: 10px; padding: 3px 8px; }
        }
        @media (max-width: 360px) {
            .container { padding: 20px 14px 18px; border-radius: 20px; }
            .qr-section, .qr-wrapper { width: 130px; height: 130px; }
            .qr-wrapper { padding: 8px; border-radius: 14px; }
            .brand-icon-wrap { width: 44px; height: 44px; font-size: 22px; }
            h1 { font-size: 18px; }
        }
    </style>
</head>
<body>
    <!-- 发光大粒子 -->
    <div class="glow-orb"></div>
    <div class="glow-orb"></div>
    <div class="glow-orb"></div>
    <div class="glow-orb"></div>
    <!-- 星光粒子 -->
    <div class="star"></div>
    <div class="star"></div>
    <div class="star"></div>
    <div class="star"></div>
    <div class="star"></div>
    <div class="star"></div>
    <div class="star"></div>
    <div class="star"></div>

    <div class="container">
        <div class="brand-area">
            <div class="brand-icon-wrap">🌶️</div>
            <div class="brand-text">
                <h1>陕西辣椒精源</h1>
                <p class="subtitle">产品溯源系统 · 从田间到餐桌全程可追溯</p>
            </div>
        </div>

        <div class="qr-section">
            <div class="qr-ring"></div>
            <div class="qr-ring-2"></div>
            <div class="qr-wrapper">
                <div class="scan-line"></div>
                <img src="/qr?code=61011320251001A15" alt="溯源二维码">
            </div>
            <div class="qr-label">扫码查询产品溯源信息</div>
        </div>

        <div class="input-group">
            <div class="input-wrap">
                <span class="input-icon">🔍</span>
                <input type="text" id="codeInput" placeholder="输入17位溯源码" maxlength="17" style="text-transform:uppercase">
            </div>
            <button onclick="goTrace()">查询</button>
        </div>

        <div class="examples-label">— 示例溯源码（点击自动填入） —</div>
        <div class="examples">
            <span onclick="fillCode('61011320251001A15')">61011320251001A15</span>
            <span onclick="fillCode('61011320250915B20')">61011320250915B20</span>
            <span onclick="fillCode('61011320250820C30')">61011320250820C30</span>
        </div>

        <div class="hint">
            <strong>📋 关于溯源码</strong>
            产品溯源码为17位，包含区域码(6位)、生产日期(8位)、品种(1位)和批次(2位)信息
        </div>

        <div class="trust-row">
            <span class="tr-item"><span class="tr-dot red"></span> 区块链存证</span>
            <span class="tr-item"><span class="tr-dot green"></span> 质量可追溯</span>
            <span class="tr-item"><span class="tr-dot red"></span> 每批必检</span>
            <span class="tr-item"><span class="tr-dot green"></span> 品质保障</span>
        </div>

        <div class="footer-text">© 2025 陕西辣椒精源 · 品质可溯 安心可见</div>
    </div>

    <script>
        function goTrace() {
            const code = document.getElementById('codeInput').value.trim().toUpperCase();
            if (code.length === 17) {
                window.open('/trace?code=' + code, '_blank');
            } else {
                alert('请输入17位有效溯源码！');
            }
        }
        function fillCode(code) {
            document.getElementById('codeInput').value = code;
            document.getElementById('codeInput').focus();
        }
        document.getElementById('codeInput').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') goTrace();
        });
    </script>
</body>
</html>
'''

# ==========================================
# 溯源详情页 HTML 模板（蓝色科技主题）
# ==========================================
TRACE_HTML = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>辣椒智慧农业 · 产品溯源 | {{ code }}</title>
    <style>
        :root {
            --primary: #c62828;
            --primary-light: #ef5350;
            --primary-dark: #8e0000;
            --primary-glow: rgba(198,40,40,0.15);
            --accent: #2e7d32;
            --bg: #fef0ef;
            --card: rgba(255,255,255,0.92);
            --text: #2d3436;
            --text-light: #636e72;
            --border: #e8ece8;
            --shadow: 0 8px 30px rgba(0,0,0,0.06);
            --shadow-lg: 0 16px 50px rgba(0,0,0,0.1);
            --radius: 16px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            background: var(--bg);
            color: var(--text);
            line-height: 1.6;
            padding-bottom: 40px;
            position: relative;
        }
        /* ===== 科技网格背景 ===== */
        .tech-grid-bg {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: -1;
            background-image:
                linear-gradient(rgba(198,40,40,0.04) 1px, transparent 1px),
                linear-gradient(90deg, rgba(198,40,40,0.04) 1px, transparent 1px);
            background-size: 60px 60px;
            animation: gridPulse 6s ease-in-out infinite;
        }
        @keyframes gridPulse {
            0%, 100% { opacity: 0.4; }
            50% { opacity: 0.8; }
        }
        /* ===== 浮动粒子 ===== */
        .tech-particles {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: -1;
            overflow: hidden;
        }
        .tech-particles .dot {
            position: absolute;
            width: 3px; height: 3px;
            background: var(--primary);
            border-radius: 50%;
            opacity: 0.15;
            animation: floatDot 12s linear infinite;
        }
        .tech-particles .dot:nth-child(1) { left: 10%; top: 20%; animation-delay: 0s; animation-duration: 14s; }
        .tech-particles .dot:nth-child(2) { left: 25%; top: 60%; animation-delay: 2s; animation-duration: 10s; width: 4px; height: 4px; }
        .tech-particles .dot:nth-child(3) { left: 45%; top: 10%; animation-delay: 4s; animation-duration: 16s; }
        .tech-particles .dot:nth-child(4) { left: 65%; top: 80%; animation-delay: 1s; animation-duration: 12s; width: 2px; height: 2px; }
        .tech-particles .dot:nth-child(5) { left: 80%; top: 30%; animation-delay: 3s; animation-duration: 15s; }
        .tech-particles .dot:nth-child(6) { left: 15%; top: 90%; animation-delay: 5s; animation-duration: 11s; width: 4px; height: 4px; }
        .tech-particles .dot:nth-child(7) { left: 55%; top: 40%; animation-delay: 6s; animation-duration: 13s; }
        .tech-particles .dot:nth-child(8) { left: 90%; top: 70%; animation-delay: 2.5s; animation-duration: 9s; }
        .tech-particles .dot:nth-child(9) { left: 35%; top: 85%; animation-delay: 7s; animation-duration: 17s; width: 2px; height: 2px; }
        .tech-particles .dot:nth-child(10) { left: 70%; top: 15%; animation-delay: 4.5s; animation-duration: 11s; }
        .tech-particles .dot:nth-child(11) { left: 5%; top: 50%; animation-delay: 3.3s; animation-duration: 8s; }
        .tech-particles .dot:nth-child(12) { left: 50%; top: 95%; animation-delay: 6.5s; animation-duration: 10s; width: 3px; height: 3px; }
        @keyframes floatDot {
            0% { transform: translateY(0) scale(1); opacity: 0.15; }
            50% { transform: translateY(-120px) scale(1.5); opacity: 0.3; }
            100% { transform: translateY(0) scale(1); opacity: 0.15; }
        }
        /* ===== 防伪水印 ===== */
        .watermark {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: -1;
            background-image:
                repeating-linear-gradient(45deg, transparent, transparent 80px, rgba(198,40,40,0.015) 80px, rgba(198,40,40,0.015) 81px),
                repeating-linear-gradient(-45deg, transparent, transparent 80px, rgba(198,40,40,0.015) 80px, rgba(198,40,40,0.015) 81px);
        }
        /* ===== Header ===== */
        .header {
            background: linear-gradient(135deg, var(--primary-dark) 0%, var(--primary) 40%, #e53935 70%, #2e7d32 100%);
            color: white;
            padding: 40px 20px 65px;
            position: relative;
            overflow: hidden;
            box-shadow: 0 4px 30px rgba(198,40,40,0.25), inset 0 1px 0 rgba(255,255,255,0.1);
        }
        .header::before {
            content: '';
            position: absolute;
            inset: 0;
            background:
                radial-gradient(ellipse at 15% 50%, rgba(255,255,255,0.12) 0%, transparent 60%),
                radial-gradient(ellipse at 85% 20%, rgba(46,125,50,0.15) 0%, transparent 50%),
                radial-gradient(ellipse at 50% 80%, rgba(255,255,255,0.05) 0%, transparent 50%);
            pointer-events: none;
        }
        .header::after {
            content: '';
            position: absolute;
            bottom: -30px;
            left: -5%; right: -5%;
            height: 70px;
            background: var(--bg);
            border-radius: 50% 50% 0 0 / 35px 35px 0 0;
        }
        /* ===== Header 底部光晕 ===== */
        .header-glow {
            position: absolute;
            bottom: -80px;
            left: 50%;
            transform: translateX(-50%);
            width: 600px;
            height: 160px;
            background: radial-gradient(ellipse, rgba(46,125,50,0.12) 0%, transparent 70%);
            pointer-events: none;
            z-index: 0;
        }
        .header-pattern {
            position: absolute;
            inset: 0;
            opacity: 0.05;
            background-image:
                radial-gradient(circle at 25% 25%, white 1px, transparent 1px),
                radial-gradient(circle at 75% 75%, white 1px, transparent 1px);
            background-size: 40px 40px;
            pointer-events: none;
        }
        /* ===== Header 装饰粒子 ===== */
        .header-particle {
            position: absolute;
            width: 4px; height: 4px;
            background: rgba(255,255,255,0.15);
            border-radius: 50%;
            pointer-events: none;
            animation: hParticle 8s ease-in-out infinite;
        }
        .header-particle:nth-child(1) { top: 20%; left: 10%; animation-delay: 0s; }
        .header-particle:nth-child(2) { top: 30%; right: 15%; animation-delay: 2s; width: 3px; height: 3px; }
        .header-particle:nth-child(3) { bottom: 40%; left: 30%; animation-delay: 4s; }
        .header-particle:nth-child(4) { top: 50%; right: 25%; animation-delay: 6s; width: 5px; height: 5px; }
        .header-particle:nth-child(5) { bottom: 25%; left: 60%; animation-delay: 1s; width: 3px; height: 3px; }
        .header-particle:nth-child(6) { top: 60%; right: 5%; animation-delay: 3s; }
        @keyframes hParticle {
            0%, 100% { transform: translateY(0) scale(1); opacity: 0.15; }
            50% { transform: translateY(-30px) scale(1.8); opacity: 0.4; }
        }
        /* ===== Header 扫描线 ===== */
        .scan-line {
            position: absolute;
            left: 0; right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent);
            animation: scanMove 3s ease-in-out infinite;
            z-index: 3;
            pointer-events: none;
        }
        @keyframes scanMove {
            0% { top: -2px; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 100%; opacity: 0; }
        }
        .corner-tag {
            position: absolute;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            color: rgba(255,255,255,0.12);
            letter-spacing: 1px;
            pointer-events: none;
            z-index: 1;
        }
        .corner-tag.ct-tl { top: 12px; left: 16px; }
        .corner-tag.ct-br { bottom: 45px; right: 16px; }
        .header-inner {
            max-width: 1000px;
            margin: 0 auto;
            position: relative;
            z-index: 2;
        }
        .header-top {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .header-title {
            display: flex;
            align-items: center;
            gap: 14px;
        }
        .header-title .ht-icon {
            width: 48px; height: 48px;
            background: rgba(255,255,255,0.15);
            backdrop-filter: blur(8px);
            border-radius: 14px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 26px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            border: 1px solid rgba(255,255,255,0.15);
        }
        .header-title h1 {
            font-size: 26px;
            font-weight: 800;
            text-shadow: 0 2px 15px rgba(0,0,0,0.15);
            letter-spacing: 1px;
            background: linear-gradient(90deg, #fff, rgba(255,255,255,0.85));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .header-title .badge {
            background: rgba(255,255,255,0.15);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            padding: 4px 16px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.12);
            letter-spacing: 0.5px;
        }
        .header-badge {
            background: linear-gradient(135deg, #2e7d32, #43a047);
            color: white;
            padding: 8px 20px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 600;
            box-shadow: 0 4px 20px rgba(46,125,50,0.35);
            border: 1px solid rgba(255,255,255,0.1);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .header-info {
            display: flex;
            gap: 16px;
            margin-top: 22px;
            flex-wrap: wrap;
        }
        .header-info .hi-item {
            display: flex;
            align-items: center;
            gap: 8px;
            background: rgba(255,255,255,0.1);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            padding: 8px 18px 8px 14px;
            border-radius: 30px;
            font-size: 13px;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.08);
            transition: background 0.3s, transform 0.3s;
        }
        .header-info .hi-item:hover {
            background: rgba(255,255,255,0.18);
            transform: translateY(-2px);
        }
        .header-info .hi-item .hi-icon {
            font-size: 16px;
        }
        /* ===== Container ===== */
        .container { max-width: 1000px; margin: -20px auto 0; padding: 0 16px; position: relative; z-index: 2; }
        /* ===== 磨砂玻璃卡片 ===== */
        .card {
            background: var(--card);
            backdrop-filter: blur(10px);
            -webkit-backdrop-filter: blur(10px);
            border-radius: var(--radius);
            box-shadow: var(--shadow);
            padding: 24px;
            margin-bottom: 24px;
            transition: box-shadow 0.3s, transform 0.3s;
            animation: cardIn 0.5s ease both;
        }
        .card:hover {
            box-shadow: var(--shadow-lg);
        }
        @keyframes cardIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        /* ===== 发光卡片 ===== */
        .card.glow-card {
            position: relative;
            overflow: hidden;
        }
        .card.glow-card::before {
            content: '';
            position: absolute;
            top: -50%; left: -50%;
            width: 200%; height: 200%;
            background: conic-gradient(from 0deg, transparent, rgba(198,40,40,0.03), transparent, rgba(198,40,40,0.03), transparent);
            animation: glowSpin 8s linear infinite;
            pointer-events: none;
        }
        @keyframes glowSpin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
        .card.glow-card .card-content {
            position: relative;
            z-index: 1;
        }
        /* ===== 溯源码卡片 ===== */
        .code-card {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
        }
        .code-label { font-size: 13px; color: var(--text-light); }
        .code-value {
            font-size: 22px;
            font-weight: 700;
            color: var(--primary);
            letter-spacing: 2px;
            font-family: 'Courier New', monospace;
        }
        .code-qr {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .code-qr img {
            width: 60px;
            height: 60px;
            border-radius: 10px;
            box-shadow: 0 4px 12px rgba(198,40,40,0.15);
            transition: transform 0.3s;
        }
        .code-qr img:hover { transform: scale(1.08); }
        .code-copy {
            font-size: 12px;
            color: var(--primary);
            cursor: pointer;
            padding: 4px 10px;
            border-radius: 6px;
            background: rgba(198,40,40,0.06);
            border: 1px solid rgba(198,40,40,0.15);
            transition: all 0.2s;
        }
        .code-copy:hover {
            background: rgba(198,40,40,0.12);
        }
        /* ===== 认证徽章 ===== */
        .trust-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            margin-bottom: 24px;
            justify-content: center;
        }
        .trust-badge {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px 18px;
            background: white;
            border-radius: 12px;
            box-shadow: 0 2px 12px rgba(0,0,0,0.04);
            border: 1px solid var(--border);
            font-size: 13px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .trust-badge:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
        }
        .trust-badge .tb-icon {
            width: 36px; height: 36px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            flex-shrink: 0;
        }
        .trust-badge .tb-icon.gold { background: linear-gradient(135deg, #fff8e1, #ffecb3); }
        .trust-badge .tb-icon.green { background: linear-gradient(135deg, #ffebee, #e8f5e9); }
        .trust-badge .tb-icon.blue { background: linear-gradient(135deg, #ffebee, #e8f5e9); }
        .trust-badge .tb-icon.red { background: linear-gradient(135deg, #fce4ec, #f8bbd0); }
        .trust-badge .tb-text { line-height: 1.3; }
        .trust-badge .tb-text strong { display: block; font-size: 14px; color: var(--text); }
        .trust-badge .tb-text span { font-size: 11px; color: var(--text-light); }
        /* ===== 产品信息 ===== */
        .product-header {
            display: flex;
            align-items: center;
            gap: 16px;
            padding-bottom: 16px;
            border-bottom: 2px solid var(--border);
            margin-bottom: 20px;
        }
        .product-icon {
            width: 56px; height: 56px;
            background: linear-gradient(135deg, var(--primary-light), var(--primary));
            border-radius: 14px;
            display: flex; align-items: center; justify-content: center;
            font-size: 28px;
            flex-shrink: 0;
            box-shadow: 0 4px 12px rgba(198,40,40,0.2);
        }
        .product-meta h2 { font-size: 20px; font-weight: 700; }
        .product-meta p { font-size: 13px; color: var(--text-light); }
        .product-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
            gap: 12px;
        }
        .product-item {
            padding: 14px 16px;
            background: #f8faf8;
            border-radius: 12px;
            border-left: 3px solid var(--primary-light);
            transition: background 0.2s;
        }
        .product-item:hover { background: #f0f5f0; }
        .product-item .label { font-size: 12px; color: var(--text-light); }
        .product-item .value { font-size: 15px; font-weight: 600; margin-top: 2px; }
        /* ===== 可信度评分环 ===== */
        .trust-score-wrap {
            display: flex;
            align-items: center;
            gap: 24px;
            flex-wrap: wrap;
        }
        .trust-ring {
            position: relative;
            width: 88px; height: 88px;
            flex-shrink: 0;
        }
        .trust-ring svg {
            width: 100%; height: 100%;
            transform: rotate(-90deg);
        }
        .trust-ring .ring-bg {
            fill: none;
            stroke: #e8ece8;
            stroke-width: 6;
        }
        .trust-ring .ring-fg {
            fill: none;
            stroke: var(--primary);
            stroke-width: 6;
            stroke-linecap: round;
            stroke-dasharray: 251.2;
            stroke-dashoffset: calc(251.2 - (251.2 * {{ trust_score }}) / 100);
            animation: ringFill 1.5s ease-out forwards;
        }
        .trust-ring .ring-fg.glow {
            filter: drop-shadow(0 0 6px rgba(198,40,40,0.4));
        }
        @keyframes ringFill {
            from { stroke-dashoffset: 251.2; }
            to { stroke-dashoffset: calc(251.2 - (251.2 * {{ trust_score }}) / 100); }
        }
        .trust-ring .ring-center {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
        }
        .trust-ring .ring-center .rc-score {
            font-size: 22px;
            font-weight: 800;
            color: var(--primary-dark);
            line-height: 1;
        }
        .trust-ring .ring-center .rc-label {
            font-size: 9px;
            color: var(--text-light);
            margin-top: 2px;
        }
        .trust-details { flex: 1; min-width: 160px; }
        .trust-details .td-title {
            font-size: 15px;
            font-weight: 700;
            color: var(--primary-dark);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .trust-details .td-sub {
            font-size: 12px;
            color: var(--text-light);
            margin-top: 4px;
            line-height: 1.6;
        }
        .trust-details .td-bars { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
        .trust-details .td-bar-row {
            display: flex;
            align-items: center;
            gap: 10px;
            font-size: 11px;
        }
        .trust-details .td-bar-row .tdb-label { width: 60px; color: var(--text-light); flex-shrink: 0; }
        .trust-details .td-bar-row .tdb-track {
            flex: 1; height: 6px;
            background: #e8ece8;
            border-radius: 3px;
            overflow: hidden;
        }
        .trust-details .td-bar-row .tdb-fill {
            height: 100%;
            border-radius: 3px;
            background: linear-gradient(90deg, var(--primary-light), var(--primary));
            width: 0%;
            animation: barGrow 1.2s ease-out forwards;
        }
        .trust-details .td-bar-row .tdb-fill.delay1 { animation-delay: 0.3s; }
        .trust-details .td-bar-row .tdb-fill.delay2 { animation-delay: 0.6s; }
        .trust-details .td-bar-row .tdb-fill.delay3 { animation-delay: 0.9s; }
        @keyframes barGrow {
            from { width: 0%; }
        }
        .trust-details .td-bar-row .tdb-pct {
            width: 32px;
            text-align: right;
            font-weight: 600;
            color: var(--primary);
        }
        /* ===== 验证徽章 ===== */
        .verify-badge {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 5px 14px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 600;
            background: linear-gradient(135deg, #ffebee, #e8f5e9);
            color: #c62828;
            border: 1px solid rgba(198,40,40,0.15);
            box-shadow: 0 2px 8px rgba(198,40,40,0.08);
        }
        .verify-badge.verified {
            background: linear-gradient(135deg, #ffebee, #e8f5e9);
            color: #8e0000;
            border-color: rgba(142,0,0,0.15);
        }
        .verify-badge .vb-dot {
            width: 7px; height: 7px;
            border-radius: 50%;
            background: #c62828;
            animation: dotPulse 2s ease-in-out infinite;
        }
        @keyframes dotPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
        }
        /* ===== 全息标签 ===== */
        .hologram-tag {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 2px 10px;
            background: linear-gradient(135deg, rgba(198,40,40,0.06), rgba(46,125,50,0.04));
            border: 1px solid rgba(198,40,40,0.12);
            border-radius: 4px;
            font-family: 'Courier New', monospace;
            font-size: 10px;
            color: var(--primary);
            letter-spacing: 0.5px;
        }
        /* ===== 区块链徽章 ===== */
        .bc-badge {
            display: inline-flex;
            align-items: center;
            gap: 4px;
            padding: 3px 10px;
            background: linear-gradient(135deg, #ffebee, #fce4ec);
            color: #c62828;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 600;
            border: 1px solid rgba(198,40,40,0.15);
        }
        /* ===== 质检报告 ===== */
        .inspect-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 12px;
            padding-bottom: 16px;
            border-bottom: 2px dashed var(--border);
            margin-bottom: 16px;
        }
        .inspect-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--primary-dark);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .inspect-report-id {
            font-size: 12px;
            color: var(--text-light);
            font-family: monospace;
            padding: 4px 12px;
            background: #f5f7f5;
            border-radius: 6px;
        }
        .inspect-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
            gap: 10px;
        }
        .inspect-item {
            padding: 12px 14px;
            border-radius: 10px;
            background: #f8faf8;
            border-left: 3px solid var(--primary-light);
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .inspect-item .ii-label { font-size: 12px; color: var(--text-light); }
        .inspect-item .ii-value { font-size: 14px; font-weight: 600; margin-top: 2px; }
        .inspect-item .ii-status {
            font-size: 12px;
            padding: 3px 10px;
            border-radius: 20px;
            font-weight: 600;
        }
        .inspect-item .ii-status.pass {
            background: #ffebee;
            color: #2e7d32;
        }
        .inspect-item .ii-status.fail {
            background: #fce4ec;
            color: #c62828;
        }
        .inspect-footer {
            margin-top: 16px;
            padding-top: 12px;
            border-top: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 8px;
            font-size: 12px;
            color: var(--text-light);
        }
        .inspect-stamp {
            display: flex;
            align-items: center;
            gap: 16px;
        }
        .inspect-stamp .mini-seal {
            width: 48px; height: 48px;
            border-radius: 50%;
            border: 2px solid #c62828;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            font-size: 8px;
            font-weight: 700;
            color: #c62828;
            text-align: center;
            line-height: 1.1;
            transform: rotate(-8deg);
            background: rgba(255,255,255,0.9);
        }
        .inspect-stamp .mini-seal::before { content: '✓'; font-size: 14px; display: block; }
        /* ===== 区块链验证卡 ===== */
        .chain-verify-card {
            background: linear-gradient(135deg, rgba(198,40,40,0.02), rgba(46,125,50,0.02));
            border: 1px solid rgba(198,40,40,0.06);
            border-radius: var(--radius);
            padding: 20px;
            margin-top: 16px;
        }
        .chain-verify-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 14px;
            flex-wrap: wrap;
            gap: 8px;
        }
        .chain-verify-title {
            font-size: 15px;
            font-weight: 700;
            color: var(--primary);
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .chain-verify-status {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
            padding: 4px 12px;
            border-radius: 20px;
            background: rgba(46,125,50,0.08);
            color: #2e7d32;
            font-weight: 600;
        }
        .chain-verify-status .status-dot {
            width: 6px; height: 6px;
            border-radius: 50%;
            background: #2e7d32;
            animation: chainPulse 2s ease-in-out infinite;
        }
        @keyframes chainPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(1.3); }
        }
        .chain-hash-display {
            background: #0d1117;
            border-radius: 8px;
            padding: 14px 16px;
            font-family: 'Courier New', monospace;
            font-size: 13px;
            color: #58a6ff;
            word-break: break-all;
            letter-spacing: 0.5px;
            border: 1px solid rgba(88,166,255,0.1);
            margin-bottom: 12px;
            position: relative;
        }
        .chain-hash-display .hash-label {
            display: block;
            font-size: 9px;
            color: #8b949e;
            letter-spacing: 1px;
            text-transform: uppercase;
            margin-bottom: 6px;
            font-family: inherit;
        }
        .chain-hash-display .hash-value {
            display: block;
            word-break: break-all;
            line-height: 1.5;
        }
        .chain-detail-toggle {
            font-size: 12px;
            color: var(--text-light);
            cursor: pointer;
            user-select: none;
            display: flex;
            align-items: center;
            gap: 4px;
            transition: color 0.3s;
        }
        .chain-detail-toggle:hover { color: var(--primary); }
        .chain-detail-toggle .arrow { transition: transform 0.3s; display: inline-block; }
        .chain-detail-toggle .arrow.open { transform: rotate(90deg); }
        .chain-detail-body {
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.4s ease, opacity 0.3s ease;
            opacity: 0;
        }
        .chain-detail-body.open {
            max-height: 500px;
            opacity: 1;
        }
        .chain-input-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
            font-size: 12px;
        }
        .chain-input-table td {
            padding: 6px 10px;
            border-bottom: 1px solid rgba(0,0,0,0.04);
        }
        .chain-input-table td:first-child {
            color: var(--text-light);
            font-family: 'Courier New', monospace;
            font-size: 11px;
            width: 100px;
        }
        .chain-input-table td:last-child {
            font-weight: 500;
            word-break: break-all;
        }
        .chain-verify-action {
            margin-top: 14px;
            display: flex;
            gap: 10px;
            align-items: center;
            flex-wrap: wrap;
        }
        .chain-verify-btn {
            padding: 8px 20px;
            background: linear-gradient(135deg, #c62828, #e53935);
            color: white;
            border: none;
            border-radius: 8px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s;
            box-shadow: 0 2px 10px rgba(198,40,40,0.15);
        }
        .chain-verify-btn:hover {
            transform: translateY(-1px);
            box-shadow: 0 4px 16px rgba(198,40,40,0.25);
        }
        .chain-verify-btn:active { transform: translateY(0); }
        .chain-verify-result {
            font-size: 13px;
            font-weight: 600;
            padding: 6px 14px;
            border-radius: 8px;
            display: none;
        }
        .chain-verify-result.match {
            display: inline-block;
            background: rgba(46,125,50,0.08);
            color: #2e7d32;
        }
        .chain-verify-result.mismatch {
            display: inline-block;
            background: rgba(198,40,40,0.08);
            color: #c62828;
        }
        /* ===== 时间线 ===== */
        .timeline-section { animation-delay: 0.1s; }
        .section-title {
            font-size: 18px;
            font-weight: 700;
            margin-bottom: 20px;
            display: flex;
            align-items: center;
            gap: 8px;
            color: var(--primary-dark);
        }
        .timeline { position: relative; padding-left: 28px; }
        .timeline::before {
            content: '';
            position: absolute;
            left: 8px; top: 8px; bottom: 8px;
            width: 3px;
            background: linear-gradient(to bottom, var(--primary-light), var(--primary), var(--primary-dark));
            border-radius: 2px;
        }
        .tl-item {
            position: relative;
            margin-bottom: 32px;
            padding-left: 24px;
            animation: tlSlide 0.5s ease both;
        }
        .tl-item:nth-child(1) { animation-delay: 0.2s; }
        .tl-item:nth-child(2) { animation-delay: 0.35s; }
        .tl-item:nth-child(3) { animation-delay: 0.5s; }
        .tl-item:last-child { margin-bottom: 0; }
        @keyframes tlSlide {
            from { opacity: 0; transform: translateX(-15px); }
            to { opacity: 1; transform: translateX(0); }
        }
        .tl-item::before {
            content: '';
            position: absolute;
            left: -24px; top: 4px;
            width: 18px; height: 18px;
            border-radius: 50%;
            background: var(--primary);
            border: 4px solid #ffebee;
            box-shadow: 0 0 0 2px var(--primary-light), 0 2px 8px rgba(198,40,40,0.2);
        }
        .tl-content {
            background: #f8faf8;
            border-radius: 14px;
            padding: 20px 22px;
            border-left: 4px solid var(--primary-light);
            transition: box-shadow 0.3s;
        }
        .tl-content:hover {
            box-shadow: 0 4px 16px rgba(198,40,40,0.08);
        }
        .tl-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 8px;
            margin-bottom: 6px;
        }
        .tl-top .tl-title { margin-bottom: 0; }
        .tl-title {
            font-size: 16px;
            font-weight: 700;
            color: var(--primary-dark);
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .tl-location {
            font-size: 13px;
            color: var(--text-light);
            margin: 4px 0 8px;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .tl-desc { font-size: 14px; line-height: 1.7; margin-bottom: 12px; }
        /* ===== 传感器仪表卡片 ===== */
        .tl-sensors {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
            gap: 8px;
            margin-bottom: 12px;
        }
        .tl-sensor {
            text-align: center;
            padding: 10px 6px;
            background: white;
            border-radius: 10px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.04);
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .tl-sensor:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 16px rgba(0,0,0,0.08);
        }
        .tl-sensor .s-label { font-size: 11px; color: var(--text-light); }
        .tl-sensor .s-value { font-size: 17px; font-weight: 700; color: var(--primary); }
        /* ===== 科技仪表卡片 ===== */
        .tl-sensor.tech-gauge {
            background: linear-gradient(135deg, #f8faf8, #f0f5f0);
            border: 1px solid rgba(198,40,40,0.08);
            position: relative;
            overflow: hidden;
        }
        .tl-sensor.tech-gauge::after {
            content: '';
            position: absolute;
            bottom: 0; left: 0; right: 0;
            height: 3px;
            background: linear-gradient(90deg, var(--primary-light), var(--primary), var(--accent));
            border-radius: 0 0 10px 10px;
            opacity: 0.6;
        }
        .tl-sensor.tech-gauge .s-value {
            font-family: 'Courier New', monospace;
            letter-spacing: 0.5px;
        }
        .tl-sensor.tech-gauge .s-trend {
            font-size: 10px;
            margin-left: 2px;
        }
        .tl-sensor.tech-gauge .s-trend.up { color: #2e7d32; }
        .tl-sensor.tech-gauge .s-trend.stable { color: #f57f17; }
        /* ===== 图片容器 ===== */
        .tl-images {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 10px;
            margin-top: 12px;
        }
        .tl-image {
            border-radius: 12px;
            overflow: hidden;
            aspect-ratio: 4/3;
            background: #e8ece8;
            box-shadow: 0 2px 8px rgba(0,0,0,0.06);
            cursor: pointer;
            position: relative;
        }
        .tl-image img {
            width: 100%; height: 100%;
            object-fit: cover;
            display: block;
            transition: transform 0.4s;
        }
        .tl-image::after {
            content: '🔍';
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%) scale(0);
            font-size: 28px;
            opacity: 0;
            transition: all 0.3s;
            filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
        }
        .tl-image:hover::after {
            opacity: 1;
            transform: translate(-50%, -50%) scale(1);
        }
        .tl-image:hover img {
            transform: scale(1.08);
            filter: brightness(0.75);
        }
        /* ===== 冷链 ===== */
        .cold-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 16px;
            margin-top: 12px;
        }
        .cold-item {
            text-align: center;
            padding: 18px 12px;
            background: linear-gradient(135deg, #ffebee, #fce4ec);
            border-radius: 14px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .cold-item:hover {
            transform: translateY(-3px);
            box-shadow: 0 6px 20px rgba(198,40,40,0.1);
        }
        .cold-item .c-icon { font-size: 26px; }
        .cold-item .c-label { font-size: 12px; color: var(--text-light); margin-top: 4px; }
        .cold-item .c-value { font-size: 20px; font-weight: 700; color: var(--primary); margin-top: 4px; }
        /* ===== 运输 ===== */
        .vehicle-section { overflow-x: auto; }
        .vehicle-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
            font-size: 14px;
            border-radius: 10px;
            overflow: hidden;
        }
        .vehicle-table thead { background: linear-gradient(135deg, var(--primary-dark), var(--primary)); }
        .vehicle-table th {
            padding: 12px 14px;
            text-align: left;
            font-weight: 600;
            color: white;
            font-size: 13px;
        }
        .vehicle-table td {
            padding: 11px 14px;
            border-bottom: 1px solid var(--border);
            transition: background 0.2s;
        }
        .vehicle-table tbody tr:hover td { background: #f0f7f0; }
        .vehicle-table tbody tr:nth-child(even) td { background: #fafcfa; }
        .vehicle-table tbody tr:nth-child(even):hover td { background: #f0f7f0; }
        /* ===== 诚信承诺 + 印章 ===== */
        .commitment {
            display: flex;
            align-items: center;
            gap: 24px;
            flex-wrap: wrap;
        }
        .commitment-text { flex: 1; min-width: 200px; }
        .commitment-text h3 {
            font-size: 16px;
            font-weight: 700;
            color: var(--primary-dark);
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .commitment-text p {
            font-size: 13px;
            color: var(--text-light);
            line-height: 1.8;
        }
        .commitment-text .signature {
            margin-top: 12px;
            display: flex;
            align-items: center;
            gap: 20px;
            font-size: 13px;
            color: var(--text);
        }
        .commitment-text .signature .sig-line {
            width: 160px;
            border-bottom: 1px solid var(--text);
            margin-top: 4px;
        }
        .seal {
            width: 88px; height: 88px;
            border-radius: 50%;
            border: 3px solid #c62828;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
            color: #c62828;
            font-size: 10px;
            font-weight: 700;
            line-height: 1.2;
            text-align: center;
            transform: rotate(-12deg);
            flex-shrink: 0;
            background: rgba(255,255,255,0.9);
            box-shadow: 0 2px 12px rgba(198,40,40,0.15);
            position: relative;
        }
        .seal::before {
            content: '✓';
            font-size: 18px;
            margin-bottom: 2px;
        }
        .seal .s-main { font-size: 12px; font-weight: 800; letter-spacing: 2px; }
        .seal .s-sub { font-size: 8px; font-weight: 600; }
        /* ===== Lightbox ===== */
        .lightbox {
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.85);
            z-index: 9999;
            align-items: center;
            justify-content: center;
            cursor: zoom-out;
            animation: lbFade 0.25s ease;
        }
        .lightbox.show { display: flex; }
        @keyframes lbFade {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .lightbox img {
            max-width: 90vw;
            max-height: 85vh;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0,0,0,0.4);
            animation: lbZoom 0.3s ease;
        }
        @keyframes lbZoom {
            from { transform: scale(0.85); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }
        .lightbox-close {
            position: fixed;
            top: 20px; right: 30px;
            color: white;
            font-size: 36px;
            cursor: pointer;
            opacity: 0.7;
            transition: opacity 0.2s;
            width: 50px; height: 50px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255,255,255,0.1);
            border-radius: 50%;
            backdrop-filter: blur(4px);
        }
        .lightbox-close:hover { opacity: 1; }
        /* ===== 空状态 ===== */
        .empty-state {
            text-align: center;
            padding: 50px 20px;
            color: var(--text-light);
        }
        .empty-state .big-icon { font-size: 56px; margin-bottom: 16px; opacity: 0.5; }
        /* ===== 技术页脚栏 ===== */
        .tech-footer-line {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 16px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }
        .tech-footer-line .tfl-item {
            font-size: 11px;
            color: rgba(255,255,255,0.3);
            font-family: 'Courier New', monospace;
            letter-spacing: 0.5px;
        }
        .tech-footer-line .tfl-item em {
            font-style: normal;
            color: rgba(255,255,255,0.5);
        }
        /* ===== 可信页脚栏 ===== */
        .trust-footer-bar {
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 10px;
            margin: 0 0 20px;
            padding: 12px;
            background: rgba(255,255,255,0.5);
            border-radius: 16px;
        }
        .trust-footer-bar .tf-item {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 13px;
            font-weight: 600;
            color: var(--primary-dark);
            background: rgba(255,255,255,0.8);
            padding: 8px 16px;
            border-radius: 20px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.04);
            border: 1px solid rgba(198,40,40,0.1);
        }
        /* ===== Footer ===== */
        .footer {
            background: linear-gradient(135deg, var(--primary-dark), #8e0000);
            color: rgba(255,255,255,0.8);
            padding: 35px 24px;
            text-align: center;
            margin-top: 24px;
            border-radius: var(--radius);
        }
        .footer h3 { color: white; margin-bottom: 8px; font-size: 16px; }
        .footer p { font-size: 13px; margin-bottom: 4px; opacity: 0.85; }
        .footer .copyright { margin-top: 18px; padding-top: 16px; border-top: 1px solid rgba(255,255,255,0.08); font-size: 12px; opacity: 0.6; }
        /* ===== 响应式 ===== */
        @media (max-width: 768px) {
            .header-title h1 { font-size: 20px; }
            .header-info { gap: 12px; font-size: 13px; }
            .code-value { font-size: 18px; }
            .product-grid { grid-template-columns: repeat(2, 1fr); }
            .tl-sensors { grid-template-columns: repeat(3, 1fr); }
            .tl-images { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 480px) {
            .header { padding: 20px 16px 40px; }
            .product-grid { grid-template-columns: 1fr 1fr; }
            .tl-sensors { grid-template-columns: repeat(2, 1fr); }
            .tl-images { grid-template-columns: repeat(2, 1fr); }
            .code-card { flex-direction: column; align-items: flex-start; }
            .code-qr { align-self: flex-end; }
            .chain-hash-display { padding: 10px 12px; font-size: 11px; }
            .chain-hash-display .hash-value { font-size: 11px !important; letter-spacing: 1px !important; }
            .commitment-text .signature { flex-wrap: wrap; gap: 12px; justify-content: center; }
            .commitment-text .signature .sig-line { width: 100px; }
            .commitment-text .signature div { flex: 1 1 auto; min-width: 80px; }
        }
        @media print {
            body { background: white; }
            .header { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .tl-content, .card { break-inside: avoid; }
            .lightbox { display: none !important; }
            .card { animation: none !important; }
            .tl-item { animation: none !important; }
        }
    </style>
</head>
<body>
    <!-- ===== 防伪水印背景 ===== -->
    <div class="watermark"></div>
    <!-- ===== 科技网格背景 ===== -->
    <div class="tech-grid-bg"></div>
    <div class="tech-particles">
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
        <div class="dot"></div><div class="dot"></div><div class="dot"></div>
    </div>
    <!-- ========== Header ========== -->
    <div class="header">
    <div class="scan-line"></div>
    <div class="corner-tag ct-tl">SYS::QINJIAO_TRACE v2.4</div>
    <div class="corner-tag ct-br">ENC:AES-256 || HASH:MD5</div>
    <div class="header-glow"></div>
    <div class="header-pattern"></div>
    <div class="header-particle"></div>
    <div class="header-particle"></div>
    <div class="header-particle"></div>
    <div class="header-particle"></div>
    <div class="header-particle"></div>
    <div class="header-particle"></div>
    <div class="header-inner">
        <div class="header-top">
            <div class="header-title">
                <div class="ht-icon">🌶️</div>
                <h1>辣椒智慧农业溯源系统</h1>
                <span class="badge">⛓️ 区块链存证</span>
            </div>
            <div class="header-badge">✅ 国家农产品质量追溯认证</div>
        </div>
        <div class="header-info">
            <div class="hi-item"><span class="hi-icon">📅</span> 生产日期：{{ parsed["date_formatted"] }}</div>
            <div class="hi-item"><span class="hi-icon">🌶️</span> 品种：{{ parsed["variety_name"] }}</div>
            <div class="hi-item"><span class="hi-icon">📍</span> 产地：{{ parsed["region_name"] }}</div>
        </div>
    </div>
</div>
    <div class="container">
        <!-- ========== 溯源码卡片 ========== -->
        <div class="code-card">
            <div>
                <div class="code-label">🔗 产品溯源码</div>
                <div class="code-value">{{ code }}</div>
                <div style="display:flex;gap:8px;align-items:center;margin-top:6px;flex-wrap:wrap">
                    <span class="code-copy" onclick="copyCode('{{ code }}')">📋 复制溯源码</span>
                    <span class="verify-badge verified"><span class="vb-dot"></span> 区块链已存证</span>
                    <span class="hologram-tag">MD5:{{ block_hash }}</span>
                </div>
            </div>
            <div class="code-qr">
                <img src="/qr?code={{ code }}" alt="QR">
            </div>
        </div>
        <!-- ========== 认证徽章行 ========== -->
        <div class="trust-badges">
            <div class="trust-badge">
                <div class="tb-icon gold">🏆</div>
                <div class="tb-text">
                    <strong>国家地理标志产品</strong>
                    <span>陕西省辣椒地理标志保护产品 · OCS-24-0089</span>
                </div>
            </div>
            <div class="trust-badge">
                <div class="tb-icon green">✅</div>
                <div class="tb-text">
                    <strong>ISO 9001 质量认证</strong>
                    <span>质量管理体系认证 · 证书编号：QMS-0132</span>
                </div>
            </div>
            <div class="trust-badge">
                <div class="tb-icon blue">🔬</div>
                <div class="tb-text">
                    <strong>HACCP 食品安全</strong>
                    <span>食品安全管理体系认证 · 证书编号：HACCP-0067</span>
                </div>
            </div>
            <div class="trust-badge">
                <div class="tb-icon red">🛡️</div>
                <div class="tb-text">
                    <strong>有机农产品认证</strong>
                    <span>中国有机产品认证 · 证书编号：GI-610113</span>
                </div>
            </div>
        </div>
        <!-- ========== 产品信息 ========== -->
        <div class="card">
            <div class="product-header">
                <div class="product-icon">🌶️</div>
                <div class="product-meta">
                    <h2>陕西辣椒 · {{ parsed["variety_name"] }}</h2>
                    <p>来自陕西秦岭北麓优质辣椒产区 · 批次号 {{ parsed["batch"] }}</p>
                </div>
            </div>
            <div class="product-grid">
                <div class="product-item">
                    <div class="label">产品名称</div>
                    <div class="value">陕西辣椒（干辣椒）</div>
                </div>
                <div class="product-item">
                    <div class="label">产品品种</div>
                    <div class="value">{{ parsed["variety_name"] }}</div>
                </div>
                <div class="product-item">
                    <div class="label">质量等级</div>
                    <div class="value">一级 · 特级精选</div>
                </div>
                <div class="product-item">
                    <div class="label">批次编号</div>
                    <div class="value">{{ parsed["batch"] }}</div>
                </div>
                <div class="product-item">
                    <div class="label">产地</div>
                    <div class="value">{{ parsed["region_name"] }}</div>
                </div>
                <div class="product-item">
                    <div class="label">生产日期</div>
                    <div class="value">{{ parsed["date_formatted"] }}</div>
                </div>
            </div>
        </div>
        <!-- ========== 数据可信度评分 ========== -->
        <div class="card glow-card">
            <div class="card-content">
                <div class="trust-score-wrap">
                    <div class="trust-ring">
                        <svg viewBox="0 0 84 84">
                            <circle class="ring-bg" cx="42" cy="42" r="40"/>
                            <circle class="ring-fg glow" cx="42" cy="42" r="40"/>
                        </svg>
                        <div class="ring-center">
                            <span class="rc-score">{{ trust_score }}</span>
                            <span class="rc-label">可信度</span>
                        </div>
                    </div>
                    <div class="trust-details">
                        <div class="td-title">🔒 数据可信度评估 <span class="verify-badge"><span class="vb-dot"></span> 实时动态评分</span></div>
                        <div class="td-sub">基于数据完整性、真实性、覆盖度等多维度动态评估，确保溯源信息可信可靠</div>
                        <div class="td-bars">
                            <div class="td-bar-row">
                                <span class="tdb-label">完整性</span>
                                <div class="tdb-track"><div class="tdb-fill" style="width:{{ integrity_pct }}%"></div></div>
                                <span class="tdb-pct">{{ integrity_pct }}%</span>
                            </div>
                            <div class="td-bar-row">
                                <span class="tdb-label">真实性</span>
                                <div class="tdb-track"><div class="tdb-fill delay1" style="width:{{ authenticity_pct }}%"></div></div>
                                <span class="tdb-pct">{{ authenticity_pct }}%</span>
                            </div>
                            <div class="td-bar-row">
                                <span class="tdb-label">覆盖度</span>
                                <div class="tdb-track"><div class="tdb-fill delay2" style="width:{{ coverage_pct }}%"></div></div>
                                <span class="tdb-pct">{{ coverage_pct }}%</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- ========== 质检报告 ========== -->
        <div class="card">
            <div class="inspect-header">
                <div class="inspect-title">🔬 产品质量检测报告</div>
                <span class="inspect-report-id">报告编号：SX-QJ-2025-{{ parsed["batch"] }}</span>
            </div>
            <div class="inspect-grid">
                <div class="inspect-item">
                    <div>
                        <div class="ii-label">{{ inspect_data['pesticide'].label }}</div>
                        <div class="ii-value">{{ inspect_data['pesticide'].value }}</div>
                    </div>
                    <span class="ii-status pass">✅ {{ inspect_data['pesticide'].status }}</span>
                </div>
                <div class="inspect-item">
                    <div>
                        <div class="ii-label">{{ inspect_data['heavy_metal'].label }}</div>
                        <div class="ii-value">{{ inspect_data['heavy_metal'].value }}</div>
                    </div>
                    <span class="ii-status pass">✅ {{ inspect_data['heavy_metal'].status }}</span>
                </div>

                <div class="inspect-item">
                    <div>
                        <div class="ii-label">{{ inspect_data['capsaicin'].label }}</div>
                        <div class="ii-value">{{ inspect_data['capsaicin'].value }}</div>
                    </div>
                    <span class="ii-status pass">✅ {{ inspect_data['capsaicin'].status }}</span>
                </div>
                <div class="inspect-item">
                    <div>
                        <div class="ii-label">{{ inspect_data['moisture'].label }}</div>
                        <div class="ii-value">{{ inspect_data['moisture'].value }}</div>
                    </div>
                    <span class="ii-status pass">✅ {{ inspect_data['moisture'].status }}</span>
                </div>
            </div>
            <div class="inspect-footer">
                <span>检测机构：陕西省农产品质量安全检测中心（CMA认证）</span>
                <div class="inspect-stamp">
                    <span>检测日期：2025-08-15</span>
                    <div class="mini-seal">检测<br>专用章</div>
                </div>
            </div>
        </div>
        <!-- ========== 区块链存证验证 ========== -->
        <div class="card" style="animation-delay:0.05s">
            <div class="chain-verify-card">
                <div class="chain-verify-header">
                    <div class="chain-verify-title">⛓️ 区块链存证验证</div>
                    <div class="chain-verify-status">
                        <span class="status-dot"></span>
                        已存证
                    </div>
                </div>
                <div class="chain-hash-display">
                    <span class="hash-label">存证验证码（唯一标识）</span>
                    <span class="hash-value" style="font-size:18px;letter-spacing:3px;color:#7ee787">{{ verify_code }}</span>
                </div>
                <div class="chain-hash-display" style="background:#0d1117;margin-top:8px">
                    <span class="hash-label">BLOCK HASH (MD5)</span>
                    <span class="hash-value">{{ block_hash }}</span>
                </div>
                <div class="chain-detail-toggle" onclick="toggleChainDetail()">
                    <span class="arrow">▶</span> 查看存证原始数据
                </div>
                <div class="chain-detail-body" id="chainDetailBody">
                    <table class="chain-input-table">
                        <tr><td>溯源码</td><td>{{ code }}</td></tr>
                        <tr><td>生产日期</td><td>{{ rand_proof.prod_date }}</td></tr>
                        <tr><td>区域码</td><td>{{ rand_proof.region_code }}</td></tr>
                        <tr><td>品种码</td><td>{{ rand_proof.variety_code }}</td></tr>
                        <tr><td>批次号</td><td>{{ rand_proof.batch_no }}</td></tr>
                        <tr><td>密钥盐值</td><td>qinjiao</td></tr>
                        <tr><td>验证码</td><td style="font-family:'Courier New',monospace;font-weight:700;color:#2e7d32">{{ verify_code }}</td></tr>
                        <tr style="border-top:1px solid rgba(0,0,0,0.06)">
                            <td style="font-weight:600">拼接原文</td>
                            <td style="font-family:'Courier New',monospace;font-size:11px;color:var(--primary);word-break:break-all">{{ hash_input }}</td>
                        </tr>
                    </table>
                    <div class="chain-verify-action">
                        <button class="chain-verify-btn" onclick="verifyWithDB()">🔐 数据库验证</button>
                        <span class="chain-verify-result" id="chainResult"></span>
                    </div>
                </div>
            </div>
        </div>
        <!-- ========== 溯源时间线 ========== -->
        <div class="card timeline-section">
            <div class="section-title">📋 产品全生命周期溯源</div>
            <p style="font-size:14px;color:var(--text-light);margin-bottom:20px">
                从育苗、种植到采收加工，全程记录关键数据，区块链存证确保不可篡改。
            </p>
            {% if stages %}
            <div class="timeline">
                {% for stage in stages %}
                <div class="tl-item">
                    <div class="tl-content">
                        <div class="tl-top">
                            <div class="tl-title">{{ stage.title }}</div>
                            <span class="bc-badge">🔗 区块链存证</span>
                        </div>
                        <div class="tl-location">📍 {{ stage.location }}</div>
                        <div class="tl-desc">{{ stage.desc }}</div>
                        {% if stage.sensors and stage.sensors|length > 0 %}
                        <div class="tl-sensors">
                            {% for s in stage.sensors %}
                            <div class="tl-sensor tech-gauge">
                                <div class="s-label">{{ s.name }}</div>
                                <div class="s-value">{{ "%.1f"|format(s.value) }}{{ s.unit }} <span class="s-trend up">↑</span></div>
                            </div>
                            {% endfor %}
                        </div>
                        {% endif %}
                        {% if stage.images and stage.images|length > 0 %}
                        <div class="tl-images">
                            {% for img in stage.images %}
                            <div class="tl-image" onclick="openLightbox(this.querySelector('img').src)">
                                <img src="/api/image/{{ img.id }}" alt="{{ img.filename or '溯源图片' }}" loading="lazy">
                            </div>
                            {% endfor %}
                        </div>
                        {% endif %}
                    </div>
                </div>
                {% endfor %}
            </div>
            {% else %}
            <div class="empty-state">
                <div class="big-icon">📷</div>
                <p>暂无溯源阶段数据，请稍后再查看。</p>
            </div>
            {% endif %}
        </div>
        <!-- ========== 冷链物流 ========== -->
        {% if cold_chain %}
        <div class="card">
            <div class="section-title">🚛 冷链物流监控</div>
            <p style="font-size:14px;color:var(--text-light);margin-bottom:4px">
                全程冷链运输，实时监控温度、湿度、二氧化碳浓度，确保产品新鲜度。
            </p>
            <div class="cold-grid">
                <div class="cold-item">
                    <div class="c-icon">🌡️</div>
                    <div class="c-label">运输温度</div>
                    <div class="c-value">{{ cold_chain.temp }}</div>
                </div>
                <div class="cold-item">
                    <div class="c-icon">💧</div>
                    <div class="c-label">运输湿度</div>
                    <div class="c-value">{{ cold_chain.humidity }}</div>
                </div>
                <div class="cold-item">
                    <div class="c-icon">🫧</div>
                    <div class="c-label">CO₂浓度</div>
                    <div class="c-value">{{ cold_chain.co2 }}</div>
                </div>
            </div>
        </div>
        {% endif %}
        <!-- ========== 车辆运输记录 ========== -->
        {% if vehicle_data_list and vehicle_data_list|length > 0 %}
        <div class="card vehicle-section">
            <div class="section-title">🚚 运输车辆记录</div>
            <table class="vehicle-table">
                <thead>
                    <tr>
                        <th>车牌号码</th>
                        <th>车厢温度</th>
                        <th>车厢湿度</th>
                        <th>CO₂浓度</th>
                        <th>记录时间</th>
                    </tr>
                </thead>
                <tbody>
                    {% for v in vehicle_data_list %}
                    <tr>
                        <td><strong>{{ v.vehicle_number or '未知' }}</strong></td>
                        <td>{{ "%.1f"|format(v.temperature|float) if v.temperature else '未知' }}°C</td>
                        <td>{{ "%.1f"|format(v.humidity|float) if v.humidity else '未知' }}%</td>
                        <td>{{ "%.0f"|format(v.co2_level|float) if v.co2_level else '未知' }}ppm</td>
                        <td>{{ v.record_time.strftime('%Y年%m月%d日') if v.record_time else '未知' }}</td>
                    </tr>
                    {% endfor %}
                </tbody>
            </table>
        </div>
        {% endif %}
        <!-- ========== 品质承诺 ========== -->
        <div class="card">
            <div class="section-title">📜 品质承诺</div>
            <div class="commitment">
                <div class="commitment-text">
                    <h3>✅ 辣椒品质 · 诚信为本</h3>
                    <p>
                        本产品由陕西省辣椒产业协会全程监督，从种植、采收、加工到销售全链条追溯。<br>
                        所有产品均通过国家农产品质量安全检测，确保无农残超标、无重金属污染、无非法添加。<br>
                        我们郑重承诺：每一颗辣椒都来自秦岭北麓优质产区，传统工艺制作，品质保证。
                    </p>
                    <div class="signature">
                        <div style="text-align:center">
                            <div class="sig-line"></div>
                            <span style="font-size:12px;color:var(--text-light)">辣椒产业协会（盖章）</span>
                        </div>
                        <div style="text-align:center">
                            <div class="sig-line"></div>
                            <span style="font-size:12px;color:var(--text-light)">质量检测负责人</span>
                        </div>
                        <div style="text-align:center">
                            <span style="font-size:12px;color:var(--text-light)">承诺日期</span>
                            <div style="font-size:13px;font-weight:600;margin-top:2px">{{ parsed["date_formatted"] }}</div>
                        </div>
                    </div>
                </div>
                <div class="seal">
                    <div class="s-main">品质保证</div>
                    <div class="s-sub">诚信经营</div>
                </div>
            </div>
        </div>
        <!-- ========== Lightbox ========== -->
        <div class="lightbox" id="lightbox" onclick="closeLightbox()">
            <div class="lightbox-close" onclick="closeLightbox()">✕</div>
            <img id="lightboxImg" src="" alt="溯源图片放大查看">
        </div>
        <!-- ========== 技术页脚 ========== -->
        <div class="tech-footer-line">
            <span class="tfl-item">SYS::<em>QINJIAO_TRACE</em></span>
            <span class="tfl-item">PROTO::<em>v2.4.1</em></span>
            <span class="tfl-item">DATA::<em>AES-256+SHA-3</em></span>
            <span class="tfl-item">NODE::<em>0x{{ code[:4] }}..{{ code[-2:] }}</em></span>
            <span class="tfl-item">SYNC::<em>2025-10-15T08:42:37+08:00</em></span>
        </div>
        <!-- ========== 可信页脚栏 ========== -->
        <div class="trust-footer-bar">
            <span class="tf-item">🔒 区块链存证不可篡改</span>
            <span class="tf-item">✅ 国家农产品质量追溯</span>
            <span class="tf-item">🌱 绿色有机无公害</span>
            <span class="tf-item">📋 全程透明可追溯</span>
            <span class="tf-item">🛡️ 数据加密传输</span>
            <span class="tf-item">🏆 地理标志保护产品</span>
        </div>
        <!-- ========== Footer ========== -->
        <div class="footer">
            <h3>🌶️ 辣椒智慧农业 · 产品溯源系统</h3>
            <p>📌 {{ parsed["region_name"] }} · 辣椒产业协会监制</p>
            <p>📞 029-8888 8888 &nbsp;|&nbsp; ✉️ qinjiao@shaanxi.gov.cn</p>
            <p style="margin-top:8px;font-size:12px;opacity:0.7">本系统已接入国家农产品质量追溯平台 · 数据采用区块链技术存证 · 全程防伪追溯</p>
            <div class="copyright">© 2025 辣椒智慧农业科技有限公司 · 区块链溯源平台 · 溯源码：{{ code }}</div>
        </div>
    </div>
    <script>
        // 传感器数值动画
        document.querySelectorAll('.s-value').forEach(el => {
            const raw = el.textContent;
            const num = parseFloat(raw);
            if (isNaN(num)) return;
            const suffix = raw.replace(/[\d.-]/g, '');
            el.textContent = '0' + suffix;
            let cur = 0, step = num / 20;
            function animate() {
                cur += step;
                if (cur < num) {
                    el.textContent = cur.toFixed(1) + suffix;
                    requestAnimationFrame(animate);
                } else {
                    el.textContent = raw;
                }
            }
            const obs = new IntersectionObserver(entries => {
                if (entries[0].isIntersecting) { animate(); obs.disconnect(); }
            });
            obs.observe(el);
        });
        // 图片放大
        function openLightbox(src) {
            document.getElementById('lightboxImg').src = src;
            document.getElementById('lightbox').classList.add('show');
            document.body.style.overflow = 'hidden';
        }
        function closeLightbox() {
            document.getElementById('lightbox').classList.remove('show');
            document.body.style.overflow = '';
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') closeLightbox();
        });
        // 复制溯源码
        function copyCode(code) {
            navigator.clipboard.writeText(code).then(() => {
                const btn = document.querySelector('.code-copy');
                if (btn) { btn.textContent = '✅ 已复制'; setTimeout(() => { btn.textContent = '📋 复制溯源码'; }, 1500); }
            }).catch(() => {
                prompt('手动复制溯源码：', code);
            });
        }
        // 卡片可见性动画
        const observer = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.animationPlayState = 'running';
                }
            });
        });
        document.querySelectorAll('.card').forEach(el => {
            observer.observe(el);
        });
        // 图片懒加载
        document.querySelectorAll('.tl-image img').forEach(img => {
            img.loading = 'lazy';
        });
        // 区块链验证
        function toggleChainDetail() {
            const body = document.getElementById('chainDetailBody');
            const arrow = document.querySelector('.chain-detail-toggle .arrow');
            body.classList.toggle('open');
            arrow.classList.toggle('open');
        }
        function verifyWithDB() {
            const result = document.getElementById('chainResult');
            result.className = 'chain-verify-result';
            result.textContent = '⏳ 正在连接数据库验证...';
            result.style.display = 'inline-block';
            result.style.background = 'rgba(0,0,0,0.04)';
            result.style.color = '#666';

            const verifyCode = '{{ verify_code }}';
            fetch('/api/blockchain/verify-code', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ verify_code: verifyCode })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    const d = data.data;
                    if (d.match) {
                        result.textContent = '✅ 验证通过 · 与数据库哈希一致，数据完整未被篡改';
                        result.className = 'chain-verify-result match';
                    } else {
                        result.textContent = '❌ 验证失败 · 数据库哈希不匹配，数据可能已被篡改';
                        result.className = 'chain-verify-result mismatch';
                    }
                } else {
                    result.textContent = '❌ ' + (data.message || '验证失败');
                    result.className = 'chain-verify-result mismatch';
                }
            })
            .catch(err => {
                result.textContent = '❌ 网络错误，无法连接到数据库';
                result.className = 'chain-verify-result mismatch';
                console.error(err);
            });
        }
    </script>
</body>
</html>
'''

# ==========================================
# 启动入口
# ==========================================
if __name__ == '__main__':
    init_blockchain_table()
    print(f"\n{'='*50}")
    print(f"  辣椒智慧农业 - 产品溯源系统")
    print(f"{'='*50}")
    if QWEN_API_KEY:
        print(f"  [OK] Qwen-VL AI 视觉识别已开启")
    else:
        print(f"  [ERR] 未配置 QWEN_API_KEY")
        print(f"  [INFO] 获取方式: https://help.aliyun.com/zh/model-studio/get-api-key")
    print(f"  [WEB] 首页:   http://{IP}:{PORT}")
    print(f"  [WEB] 溯源:   http://{IP}:{PORT}/trace?code=61011320251001A15")
    print(f"{'='*50}\n")
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)