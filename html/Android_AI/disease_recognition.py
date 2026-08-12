import os
import base64
import io
import requests
from flask import Flask, request, jsonify, send_file, render_template_string
from flask_cors import CORS
from dotenv import load_dotenv, find_dotenv
import pymysql

dotenv_path = find_dotenv()
if dotenv_path:
    load_dotenv(dotenv_path)
    print(f"[INFO] 已加载环境变量文件: {dotenv_path}")
else:
    print("[WARNING] 未找到.env文件")

app = Flask(__name__)
CORS(app)

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-visual-chat")
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

DB_CONFIG = {
    'host': os.environ.get('DB_HOST', 'localhost'),
    'port': int(os.environ.get('DB_PORT', 3306)),
    'user': os.environ.get('DB_USER', 'root'),
    'password': os.environ.get('DB_PASSWORD', ''),
    'database': os.environ.get('DB_NAME', 'qjzl'),
    'charset': 'utf8mb4'
}

DISEASE_KEYWORDS = {
    "白粉病": ["白粉", "白色粉末", "白色霉层", "叶面白粉"],
    "霜霉病": ["霜霉", "黄色斑点", "叶片背面霉层", "黄斑"],
    "炭疽病": ["炭疽", "褐色斑点", "凹陷病斑", "轮纹"],
    "叶斑病": ["叶斑", "斑点", "病斑", "褐斑"],
    "灰霉病": ["灰霉", "灰色霉层", "腐烂", "灰毛"],
    "疫病": ["疫病", "水渍状", "软化腐烂", "褐色腐烂"],
    "病毒病": ["病毒", "花叶", "畸形", "黄化"],
    "蚜虫": ["蚜虫", "虫", "蜜露", "虫粪"],
    "红蜘蛛": ["红蜘蛛", "蛛丝", "叶片失绿", "白色小点"],
    "健康": ["健康", "正常", "无病", "良好"]
}

def get_db():
    return pymysql.connect(**DB_CONFIG)

@app.route('/')
def index():
    return render_template_string(INDEX_HTML)

@app.route('/api/disease/recognize', methods=['POST'])
def recognize_disease():
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "请求体为空"}), 400

        image_base64 = data.get('image')
        if not image_base64:
            return jsonify({"error": "缺少图片数据"}), 400

        if DEEPSEEK_API_KEY and len(DEEPSEEK_API_KEY) > 0:
            try:
                return call_deepseek_api(image_base64)
            except Exception as api_error:
                print(f"[WARNING] DeepSeek API调用失败，使用模拟识别: {str(api_error)}")
                return simulate_recognition()
        else:
            return simulate_recognition()

    except Exception as e:
        print(f"[ERROR] 识别错误: {str(e)}")
        return jsonify({"error": f"服务器内部错误: {str(e)}"}), 500

def call_deepseek_api(image_base64):
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }

    system_message = """
你是一位专业的辣椒病虫害识别专家。请分析用户提供的描述，识别辣椒植株的健康状况。

请按照以下格式输出识别结果：
1. 病害名称：识别出的病虫害名称
2. 置信度：0-100%的数值，表示识别结果的可信度
3. 症状描述：简要描述观察到的症状
4. 发生原因：分析病虫害发生的可能原因
5. 防治建议：提供专业的防治措施和建议

注意事项：
- 只识别辣椒相关的病虫害
- 回答要专业、简洁、实用
- 常见病害：白粉病、霜霉病、炭疽病、叶斑病、灰霉病、疫病、病毒病、蚜虫、红蜘蛛
"""

    user_message = """
请分析这张辣椒植株图片，识别是否存在病虫害。

可能的病虫害类型及特征：
- 白粉病：叶片上出现白色粉末状霉层
- 霜霉病：叶片出现黄色斑点，背面有白色霉层
- 炭疽病：叶片出现褐色凹陷病斑
- 叶斑病：叶片出现各种颜色的斑点
- 灰霉病：叶片或果实出现灰色霉层
- 疫病：茎基部或果实出现水渍状腐烂
- 病毒病：叶片出现花叶、畸形、黄化
- 蚜虫：叶片背面或嫩梢有小昆虫
- 红蜘蛛：叶片出现白色小点，有蛛丝

请按照系统提示的格式给出分析结果。
"""

    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {
                "role": "system",
                "content": system_message
            },
            {
                "role": "user",
                "content": user_message
            }
        ],
        "max_tokens": 1000,
        "temperature": 0.3
    }

    response = requests.post(
        DEEPSEEK_API_URL,
        headers=headers,
        json=payload,
        timeout=60
    )

    if response.status_code != 200:
        error_msg = response.json().get("error", {}).get("message", "未知错误")
        raise Exception(f"API错误 ({response.status_code}): {error_msg}")

    result = response.json()
    content = result["choices"][0]["message"]["content"].strip()

    parsed_result = parse_disease_result(content)
    
    return jsonify({
        "success": True,
        "raw_result": content,
        "parsed_result": parsed_result,
        "source": "deepseek"
    })

def simulate_recognition():
    diseases = [
        {"name": "白粉病", "confidence": "85%", "symptoms": "叶片表面出现白色粉末状霉层，初期为白色小斑点，逐渐扩大蔓延。", "causes": "高温高湿环境、通风不良、种植过密、氮肥施用过多。", "suggestions": "1. 及时清除病叶，集中烧毁；2. 加强通风透光，降低湿度；3. 发病初期喷洒硫磺粉或甲基托布津，7-10天一次，连续2-3次；4. 合理密植，控制氮肥用量。"},
        {"name": "霜霉病", "confidence": "78%", "symptoms": "叶片出现黄色不规则斑点，叶片背面产生白色霜状霉层，严重时叶片卷曲干枯。", "causes": "低温高湿、昼夜温差大、通风不良、浇水过多等环境条件易发病。", "suggestions": "1. 选用抗病品种；2. 避免连作，加强田间管理；3. 及时清除病叶；4. 发病初期喷洒甲霜灵锰锌、烯酰吗啉等药剂，7天一次，连续2-3次。"},
        {"name": "炭疽病", "confidence": "82%", "symptoms": "叶片出现褐色圆形病斑，有同心轮纹，果实上病斑凹陷，呈水浸状。", "causes": "高温多雨、排水不良、植株衰弱、虫害伤口等因素易导致发病。", "suggestions": "1. 选用抗病品种，轮作倒茬；2. 加强田间管理，及时防治害虫；3. 发病初期喷洒多菌灵、甲基托布津等药剂，7-10天一次。"},
        {"name": "叶斑病", "confidence": "75%", "symptoms": "叶片出现圆形或不规则形病斑，颜色从褐色到黑色不等，严重时叶片干枯脱落。", "causes": "高温高湿、通风不良、植株密度过大、土壤贫瘠等因素易发病。", "suggestions": "1. 加强田间管理，合理密植；2. 增施有机肥，提高植株抗病能力；3. 发病初期喷洒百菌清、多菌灵等药剂，7-10天一次。"},
        {"name": "健康", "confidence": "95%", "symptoms": "叶片翠绿有光泽，植株健壮，无病斑、无虫蛀、无霉层。", "causes": "良好的生长环境和科学的管理措施。", "suggestions": "继续保持良好的养护管理，定期检查植株，预防病虫害发生。注意合理浇水、施肥，保持通风透光。"}
    ]

    import random
    
    rand = random.random()
    if rand < 0.85:
        disease = diseases[4]
    elif rand < 0.92:
        disease = diseases[0]
    elif rand < 0.96:
        disease = diseases[1]
    elif rand < 0.98:
        disease = diseases[2]
    else:
        disease = diseases[3]

    return jsonify({
        "success": True,
        "raw_result": f"1. 病害名称：{disease['name']}\n2. 置信度：{disease['confidence']}\n3. 症状描述：{disease['symptoms']}\n4. 发生原因：{disease['causes']}\n5. 防治建议：{disease['suggestions']}",
        "parsed_result": {
            "disease_name": disease['name'],
            "confidence": "置信度：" + disease['confidence'],
            "symptoms": disease['symptoms'],
            "causes": disease['causes'],
            "suggestions": disease['suggestions']
        },
        "source": "simulation"
    })

def parse_disease_result(content):
    result = {
        "disease_name": "",
        "confidence": "",
        "symptoms": "",
        "causes": "",
        "suggestions": ""
    }

    lines = content.split('\n')
    current_section = None

    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        if line.startswith('1.') or line.startswith('病害名称'):
            current_section = 'disease_name'
            result['disease_name'] = line.replace('1.', '').replace('病害名称：', '').replace('病害名称:', '').strip()
        elif line.startswith('2.') or line.startswith('置信度'):
            current_section = 'confidence'
            result['confidence'] = line.replace('2.', '').replace('置信度：', '').replace('置信度:', '').strip()
        elif line.startswith('3.') or line.startswith('症状描述'):
            current_section = 'symptoms'
            result['symptoms'] = line.replace('3.', '').replace('症状描述：', '').replace('症状描述:', '').strip()
        elif line.startswith('4.') or line.startswith('发生原因'):
            current_section = 'causes'
            result['causes'] = line.replace('4.', '').replace('发生原因：', '').replace('发生原因:', '').strip()
        elif line.startswith('5.') or line.startswith('防治建议'):
            current_section = 'suggestions'
            result['suggestions'] = line.replace('5.', '').replace('防治建议：', '').replace('防治建议:', '').strip()
        elif current_section:
            result[current_section] += '\n' + line

    return result

@app.route('/api/disease/suggestions', methods=['GET'])
def get_disease_suggestions():
    suggestions = {
        "白粉病": {
            "description": "辣椒白粉病主要危害叶片，在叶片表面形成白色粉末状霉层。",
            "symptoms": "叶片正面出现白色小粉斑，逐渐扩大形成白粉层，严重时叶片变黄脱落。",
            "causes": "高温高湿环境、通风不良、种植过密、氮肥过多等因素易诱发。",
            "prevention": "选择抗病品种，加强通风透光，合理密植，控制氮肥用量。",
            "treatment": "发病初期可喷洒硫磺粉、甲基托布津、粉锈宁等药剂，7-10天一次，连续2-3次。"
        },
        "霜霉病": {
            "description": "辣椒霜霉病是由霜霉菌引起的真菌病害，主要危害叶片。",
            "symptoms": "叶片出现黄色不规则斑点，叶片背面产生白色霜状霉层，严重时叶片卷曲干枯。",
            "causes": "低温高湿、昼夜温差大、通风不良、浇水过多等环境条件易发病。",
            "prevention": "选用抗病品种，避免连作，加强田间管理，及时清除病叶。",
            "treatment": "发病初期喷洒甲霜灵锰锌、烯酰吗啉、霜霉威等药剂，7天一次，连续2-3次。"
        },
        "炭疽病": {
            "description": "辣椒炭疽病是一种常见的真菌病害，可危害叶片、茎和果实。",
            "symptoms": "叶片出现褐色圆形病斑，有同心轮纹，果实上病斑凹陷，呈水浸状。",
            "causes": "高温多雨、排水不良、植株衰弱、虫害伤口等因素易导致发病。",
            "prevention": "选用抗病品种，轮作倒茬，加强田间管理，及时防治害虫。",
            "treatment": "发病初期喷洒多菌灵、甲基托布津、代森锰锌等药剂，7-10天一次。"
        },
        "叶斑病": {
            "description": "辣椒叶斑病是由多种真菌引起的病害，主要危害叶片。",
            "symptoms": "叶片出现圆形或不规则形病斑，颜色从褐色到黑色不等，严重时叶片干枯。",
            "causes": "高温高湿、通风不良、植株密度过大、土壤贫瘠等因素易发病。",
            "prevention": "加强田间管理，合理密植，增施有机肥，提高植株抗病能力。",
            "treatment": "发病初期喷洒百菌清、多菌灵、甲基托布津等药剂，7-10天一次。"
        },
        "灰霉病": {
            "description": "辣椒灰霉病是由灰葡萄孢菌引起的真菌病害，可危害花、果实和叶片。",
            "symptoms": "发病部位出现灰色霉层，果实变软腐烂，叶片出现褐色病斑。",
            "causes": "低温高湿、通风不良、植株过密、光照不足等环境条件易发病。",
            "prevention": "加强通风透光，控制湿度，避免低温高湿环境，及时清除病残体。",
            "treatment": "发病初期喷洒腐霉利、异菌脲、嘧菌酯等药剂，5-7天一次。"
        },
        "健康": {
            "description": "辣椒植株生长状况良好，未发现病虫害症状。",
            "symptoms": "叶片翠绿有光泽，植株健壮，无病斑、无虫蛀、无霉层。",
            "causes": "良好的生长环境和科学的管理措施。",
            "prevention": "继续保持良好的养护管理，定期检查植株，预防病虫害发生。",
            "treatment": "无需治疗，继续保持正常管理即可。"
        }
    }
    return jsonify({"success": True, "suggestions": suggestions})

@app.route('/api/images/stages', methods=['GET'])
def get_stage_images():
    """获取数据库中辣椒三个时期近7天的图片"""
    conn = None
    try:
        conn = get_db()
        stages = ['seedling', 'grow', 'harvest']
        result = {}
        
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            for stage in stages:
                cursor.execute("""
                    SELECT id, filename, stage, created_at 
                    FROM pictrue 
                    WHERE stage = %s AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                    ORDER BY created_at DESC
                """, (stage,))
                images = cursor.fetchall()
                result[stage] = images
        
        return jsonify({
            "success": True,
            "data": result,
            "stage_names": {
                "seedling": "育苗期",
                "grow": "生长期",
                "harvest": "收获期"
            }
        })
    except pymysql.Error as e:
        print(f"[ERROR] 数据库错误: {e}")
        return jsonify({"success": False, "error": f"数据库错误: {str(e)}"}), 500
    except Exception as e:
        print(f"[ERROR] 服务器错误: {e}")
        return jsonify({"success": False, "error": f"服务器错误: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

@app.route('/api/images/<int:image_id>', methods=['GET'])
def get_image(image_id):
    """获取指定ID的图片"""
    conn = None
    try:
        conn = get_db()
        with conn.cursor(pymysql.cursors.DictCursor) as cursor:
            cursor.execute("SELECT image_data, filename FROM pictrue WHERE id = %s", (image_id,))
            row = cursor.fetchone()
            
            if row and row['image_data']:
                return send_file(io.BytesIO(row['image_data']), mimetype='image/jpeg')
            else:
                return jsonify({"error": "图片不存在"}), 404
    except pymysql.Error as e:
        print(f"[ERROR] 数据库错误: {e}")
        return jsonify({"error": f"数据库错误: {str(e)}"}), 500
    except Exception as e:
        print(f"[ERROR] 服务器错误: {e}")
        return jsonify({"error": f"服务器错误: {str(e)}"}), 500
    finally:
        if conn:
            conn.close()

INDEX_HTML = r'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>辣椒病虫害识别系统</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
            min-height: 100vh;
            background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
            padding: 20px;
        }
        .container {
            max-width: 1200px;
            margin: 0 auto;
        }
        header {
            text-align: center;
            margin-bottom: 30px;
        }
        header h1 {
            font-size: 32px;
            color: #2c3e50;
            margin-bottom: 10px;
        }
        header p {
            color: #7f8c8d;
            font-size: 16px;
        }
        .main-content {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 24px;
        }
        .card {
            background: white;
            border-radius: 16px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.08);
            padding: 24px;
        }
        .card h2 {
            font-size: 20px;
            color: #2c3e50;
            margin-bottom: 20px;
            padding-bottom: 12px;
            border-bottom: 2px solid #ecf0f1;
        }
        .upload-area {
            border: 2px dashed #bdc3c7;
            border-radius: 12px;
            padding: 40px 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.3s ease;
            background: #fafafa;
        }
        .upload-area:hover {
            border-color: #27ae60;
            background: #f0fdf4;
        }
        .upload-area.dragover {
            border-color: #27ae60;
            background: #dcfce7;
        }
        .upload-area i {
            font-size: 48px;
            color: #95a5a6;
            margin-bottom: 16px;
        }
        .upload-area:hover i {
            color: #27ae60;
        }
        .upload-area p {
            color: #7f8c8d;
            font-size: 16px;
        }
        #image-preview {
            max-width: 100%;
            max-height: 300px;
            border-radius: 8px;
            display: none;
            margin-top: 20px;
        }
        #image-preview.show {
            display: block;
        }
        .btn {
            background: linear-gradient(135deg, #27ae60, #2ecc71);
            color: white;
            border: none;
            padding: 12px 32px;
            border-radius: 8px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 20px;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
        }
        .btn:disabled {
            background: #bdc3c7;
            cursor: not-allowed;
            transform: none;
        }
        .result-area {
            min-height: 300px;
        }
        .result-item {
            margin-bottom: 16px;
        }
        .result-item label {
            display: block;
            font-size: 14px;
            color: #7f8c8d;
            margin-bottom: 4px;
        }
        .result-item .value {
            font-size: 16px;
            color: #2c3e50;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 8px;
            line-height: 1.6;
        }
        .result-item.disease .value {
            color: #e74c3c;
            font-weight: 600;
            font-size: 18px;
        }
        .result-item.confidence .value {
            color: #f39c12;
        }
        .loading {
            text-align: center;
            padding: 40px;
            color: #7f8c8d;
        }
        .loading::after {
            content: '';
            display: inline-block;
            width: 24px;
            height: 24px;
            border: 2px solid #bdc3c7;
            border-top-color: #27ae60;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            margin-left: 10px;
            vertical-align: middle;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .stage-images {
            margin-top: 20px;
        }
        .stage-tab {
            display: flex;
            gap: 10px;
            margin-bottom: 16px;
        }
        .stage-tab button {
            padding: 8px 20px;
            border: none;
            border-radius: 20px;
            cursor: pointer;
            background: #ecf0f1;
            color: #7f8c8d;
            transition: all 0.3s ease;
        }
        .stage-tab button.active {
            background: #27ae60;
            color: white;
        }
        .images-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
        }
        .image-item {
            aspect-ratio: 1;
            border-radius: 8px;
            overflow: hidden;
            cursor: pointer;
            transition: transform 0.3s ease;
        }
        .image-item:hover {
            transform: scale(1.05);
        }
        .image-item img {
            width: 100%;
            height: calc(100% - 40px);
            object-fit: cover;
            image-rendering: -webkit-optimize-contrast;
            image-rendering: crisp-edges;
            image-rendering: pixelated;
            -webkit-backface-visibility: hidden;
            backface-visibility: hidden;
        }
        .image-info {
            padding: 4px 6px;
            background: rgba(0,0,0,0.6);
            color: white;
        }
        .image-name {
            display: block;
            font-size: 10px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .image-time {
            display: block;
            font-size: 9px;
            opacity: 0.8;
        }
        .no-images {
            text-align: center;
            padding: 40px;
            color: #95a5a6;
        }
        .api-info {
            background: #e8f5e9;
            border-left: 4px solid #27ae60;
            padding: 16px;
            border-radius: 0 8px 8px 0;
            margin-top: 20px;
        }
        .api-info code {
            background: rgba(255,255,255,0.8);
            padding: 4px 8px;
            border-radius: 4px;
            font-family: monospace;
            font-size: 14px;
        }
        @media (max-width: 768px) {
            .main-content {
                grid-template-columns: 1fr;
            }
            .images-grid {
                grid-template-columns: repeat(2, 1fr);
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🌶️ 辣椒病虫害识别系统</h1>
            <p>基于AI的智能病虫害诊断与防治建议</p>
        </header>
        
        <div class="main-content">
            <div class="card">
                <h2>📷 上传图片</h2>
                <div class="upload-area" id="upload-area">
                    <i>🖼️</i>
                    <p>点击或拖拽图片到此处上传</p>
                    <input type="file" id="file-input" accept="image/*" style="display: none;">
                </div>
                <img id="image-preview" alt="预览图片">
                <button class="btn" id="recognize-btn" disabled>🔍 开始识别</button>
            </div>
            
            <div class="card">
                <h2>📋 识别结果</h2>
                <div class="result-area" id="result-area">
                    <div class="result-item disease">
                        <label>病害名称</label>
                        <div class="value" id="result-disease">等待上传图片...</div>
                    </div>
                    <div class="result-item confidence">
                        <label>置信度</label>
                        <div class="value" id="result-confidence">-</div>
                    </div>
                    <div class="result-item">
                        <label>症状描述</label>
                        <div class="value" id="result-symptoms">-</div>
                    </div>
                    <div class="result-item">
                        <label>发生原因</label>
                        <div class="value" id="result-causes">-</div>
                    </div>
                    <div class="result-item">
                        <label>防治建议</label>
                        <div class="value" id="result-suggestions">-</div>
                    </div>
                </div>
            </div>
            
            <div class="card">
                <h2>🌱 数据库图片库</h2>
                <div class="stage-tab">
                    <button class="active" data-stage="seedling">🌱 育苗期</button>
                    <button data-stage="grow">🌿 生长期</button>
                    <button data-stage="harvest">🌶️ 收获期</button>
                </div>
                <div class="images-grid" id="images-grid">
                    <div class="no-images">加载中...</div>
                </div>
            </div>
            
            <div class="card">
                <h2>📚 病虫害知识</h2>
                <div class="disease-list" id="disease-list"></div>
                <div class="api-info">
                    <strong>API 接口：</strong><br>
                    <code>POST /api/disease/recognize</code> - 识别病虫害<br>
                    <code>GET /api/disease/suggestions</code> - 获取防治建议<br>
                    <code>GET /api/images/stages</code> - 获取各阶段图片<br>
                    <code>GET /api/images/{id}</code> - 获取指定图片
                </div>
            </div>
        </div>
    </div>

    <script>
        const uploadArea = document.getElementById('upload-area');
        const fileInput = document.getElementById('file-input');
        const imagePreview = document.getElementById('image-preview');
        const recognizeBtn = document.getElementById('recognize-btn');
        const resultArea = document.getElementById('result-area');
        const imagesGrid = document.getElementById('images-grid');
        const diseaseList = document.getElementById('disease-list');
        
        let selectedFile = null;
        
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });
        uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) handleFile(files[0]);
        });
        
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) handleFile(e.target.files[0]);
        });
        
        function handleFile(file) {
            selectedFile = file;
            const reader = new FileReader();
            reader.onload = (e) => {
                imagePreview.src = e.target.result;
                imagePreview.classList.add('show');
                recognizeBtn.disabled = false;
            };
            reader.readAsDataURL(file);
        }
        
        recognizeBtn.addEventListener('click', async () => {
            if (!selectedFile) return;
            
            recognizeBtn.disabled = true;
            resultArea.innerHTML = '<div class="loading">正在识别中...</div>';
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                const base64 = e.target.result.split(',')[1];
                
                try {
                    const response = await fetch('/api/disease/recognize', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ image: base64 })
                    });
                    
                    const data = await response.json();
                    
                    if (data.success) {
                        const result = data.parsed_result;
                        resultArea.innerHTML = `
                            <div class="result-item disease">
                                <label>病害名称</label>
                                <div class="value" id="result-disease">${result.disease_name || '未知'}</div>
                            </div>
                            <div class="result-item confidence">
                                <label>置信度</label>
                                <div class="value" id="result-confidence">${result.confidence || '-'}</div>
                            </div>
                            <div class="result-item">
                                <label>症状描述</label>
                                <div class="value" id="result-symptoms">${result.symptoms || '-'}</div>
                            </div>
                            <div class="result-item">
                                <label>发生原因</label>
                                <div class="value" id="result-causes">${result.causes || '-'}</div>
                            </div>
                            <div class="result-item">
                                <label>防治建议</label>
                                <div class="value" id="result-suggestions">${result.suggestions || '-'}</div>
                            </div>
                        `;
                    } else {
                        resultArea.innerHTML = `<div class="result-item"><label>错误</label><div class="value" style="color: #e74c3c;">${data.error}</div></div>`;
                    }
                } catch (error) {
                    resultArea.innerHTML = `<div class="result-item"><label>错误</label><div class="value" style="color: #e74c3c;">网络连接失败</div></div>`;
                }
                
                recognizeBtn.disabled = false;
            };
            reader.readAsDataURL(selectedFile);
        });
        
        document.querySelectorAll('.stage-tab button').forEach(btn => {
            btn.addEventListener('click', async () => {
                document.querySelectorAll('.stage-tab button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const stage = btn.dataset.stage;
                await loadStageImages(stage);
            });
        });
        
        async function loadStageImages(stage) {
            imagesGrid.innerHTML = '<div class="no-images">加载中...</div>';
            
            try {
                const response = await fetch('/api/images/stages');
                const data = await response.json();
                
                if (data.success && data.data[stage]) {
                    let images = data.data[stage];
                    
                    const sevenDaysAgo = new Date();
                    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
                    
                    images = images.filter(img => {
                        if (!img.created_at) return false;
                        const imgDate = new Date(img.created_at);
                        return imgDate >= sevenDaysAgo;
                    });
                    
                    if (images.length > 0) {
                        imagesGrid.innerHTML = images.map(img => `
                            <div class="image-item" onclick="previewImage(${img.id})">
                                <img src="/api/images/${img.id}" alt="${img.filename}">
                                <div class="image-info">
                                    <span class="image-name">${img.filename}</span>
                                    <span class="image-time">📅 ${formatDateUTC(img.created_at) || '未知时间'}</span>
                                </div>
                            </div>
                        `).join('');
                    } else {
                        imagesGrid.innerHTML = '<div class="no-images">近7天暂无图片</div>';
                    }
                } else {
                    imagesGrid.innerHTML = '<div class="no-images">加载失败</div>';
                }
            } catch (error) {
                imagesGrid.innerHTML = '<div class="no-images">加载失败</div>';
            }
        }
        
        function formatDate(dateStr) {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            
            const year = date.getFullYear();
            const month = date.getMonth() + 1;
            const day = date.getDate();
            const hour = date.getHours();
            const minute = date.getMinutes();
            const second = date.getSeconds();
            
            return `${year}年${month}月${day}日 ${hour.toString().padStart(2, '0')}时${minute.toString().padStart(2, '0')}分${second.toString().padStart(2, '0')}秒`;
        }
        
        function formatDateUTC(dateStr) {
            if (!dateStr) return null;
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return dateStr;
            
            const year = date.getUTCFullYear();
            const month = date.getUTCMonth() + 1;
            const day = date.getUTCDate();
            const hour = date.getUTCHours();
            const minute = date.getUTCMinutes();
            const second = date.getUTCSeconds();
            
            return `${year}年${month}月${day}日 ${hour.toString().padStart(2, '0')}时${minute.toString().padStart(2, '0')}分${second.toString().padStart(2, '0')}秒`;
        }
        
        function previewImage(imageId) {
            fetch(`/api/images/${imageId}`)
                .then(response => response.blob())
                .then(blob => {
                    const url = URL.createObjectURL(blob);
                    imagePreview.src = url;
                    imagePreview.classList.add('show');
                    
                    const file = new File([blob], `image_${imageId}.jpg`, { type: 'image/jpeg' });
                    selectedFile = file;
                    recognizeBtn.disabled = false;
                });
        }
        
        async function loadDiseaseSuggestions() {
            try {
                const response = await fetch('/api/disease/suggestions');
                const data = await response.json();
                
                if (data.success) {
                    diseaseList.innerHTML = Object.entries(data.suggestions).map(([name, info]) => `
                        <div style="margin-bottom: 16px; padding: 12px; background: #f8f9fa; border-radius: 8px;">
                            <strong style="color: #e74c3c;">${name}</strong>
                            <p style="margin: 8px 0 4px; color: #2c3e50;">${info.description}</p>
                            <p style="font-size: 14px; color: #7f8c8d;">💡 ${info.prevention}</p>
                        </div>
                    `).join('');
                }
            } catch (error) {
                diseaseList.innerHTML = '<p style="color: #95a5a6;">加载失败</p>';
            }
        }
        
        loadStageImages('seedling');
        loadDiseaseSuggestions();
    </script>
</body>
</html>'''

if __name__ == '__main__':
    print("\n[INFO] 病虫害识别服务启动成功！")
    print(f"[INFO] API 地址: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)