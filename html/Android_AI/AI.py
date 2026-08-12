import os
from flask import Flask, request, jsonify
import requests
from dotenv import load_dotenv
from flask_cors import CORS

# 加载 .env 文件中的环境变量
load_dotenv()

# 创建Flask应用实例
app = Flask(__name__)

# 从环境变量读取 API Key 和模型
DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY")
DEEPSEEK_MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"

# 允许跨域请求（开发用，生产环境应限制来源）
CORS(app)

# 定义传感器映射，按分类排列
SENSOR_MAPPING = {
    "s_temp": {"name": "幼苗区_温度", "unit": "℃", "category": "幼苗区"},
    "s_hum": {"name": "幼苗区_湿度", "unit": "％", "category": "幼苗区"},
    "s_lx": {"name": "幼苗区_光照强度", "unit": "lx", "category": "幼苗区"},
    "s_sox": {"name": "幼苗区_有害气体", "unit": "", "category": "幼苗区"},

    "e_tamb": {"name": "种植区_环境温度", "unit": "℃", "category": "种植区_环境"},
    "e_ah": {"name": "种植区_环境湿度", "unit": "%", "category": "种植区_环境"},
    "e_tvoc": {"name": "种植区_环境空气质量", "unit": "", "category": "种植区_环境"},
    "e_bt": {"name": "种植区_环境人体", "unit": "μg/m³", "category": "种植区_环境"},
    "e_pm": {"name": "种植区_环境Pm2.5", "unit": "", "category": "种植区_环境"},
    "e_patm": {"name": "种植区_环境大气压", "unit": "pha", "category": "种植区_环境"},
    "ws": {"name": "种植区_环境风速", "unit": "m/s", "category": "种植区_环境"},

    "p_temp": {"name": "种植区_土壤温度", "unit": "℃", "category": "种植区_土壤"},
    "p_hum": {"name": "种植区_土壤湿度", "unit": "％", "category": "种植区_土壤"},
    "p_ph": {"name": "种植区_土壤PH值", "unit": "", "category": "种植区_土壤"},
    "p_N": {"name": "种植区_土壤氮", "unit": "mg/kg", "category": "种植区_土壤"},
    "p_P": {"name": "种植区_土壤磷", "unit": "mg/kg", "category": "种植区_土壤"},
    "p_K": {"name": "种植区_土壤钾", "unit": "mg/kg", "category": "种植区_土壤"},

    "d_temp": {"name": "烘干区_温度", "unit": "℃", "category": "烘干区"},
    "d_hum": {"name": "烘干区_湿度", "unit": "%", "category": "烘干区"}
}

# 定义传感器的固定排序顺序（按用户要求）
SENSOR_ORDER = [
    # 幼苗区
    "s_temp", "s_hum", "s_lx", "s_sox",
    # 种植区_环境
    "e_tamb", "e_ah", "e_tvoc", "e_bt", "e_pm", "e_patm", "ws",
    # 种植区_土壤
    "p_temp", "p_hum", "p_ph", "p_N", "p_P", "p_K",
    # 烘干区
    "d_temp", "d_hum"
]

# 定义区域分组
REGION_GROUPS = {
    "幼苗区": ["s_temp", "s_hum", "s_lx", "s_sox"],
    "种植区_环境": ["e_tamb", "e_ah", "e_tvoc", "e_bt", "e_pm", "e_patm", "ws"],
    "种植区_土壤": ["p_temp", "p_hum", "p_ph", "p_N", "p_P", "p_K"],
    "烘干区": ["d_temp", "d_hum"]
}

# ========== 获取AI建议 ==========
@app.route('/ai/suggest', methods=['POST'])
def get_ai_suggestion():
    try:
        # 获取请求的JSON数据
        data = request.get_json()
        if not data or 'sensor_data' not in data:
            return jsonify({"error": "缺少 sensor_data 字段"}), 400

        sensor_data = data['sensor_data']
        if not isinstance(sensor_data, dict):
            return jsonify({"error": "sensor_data 必须是对象"}), 400

        # 获取分析类型和目标
        analysis_type = data.get('analysis_type', 'all')  # 'all', 'region', 'single'
        target = data.get('target', None)  # 区域名称或传感器ID

        # 构建提示词
        prompt = build_prompt(sensor_data, analysis_type, target)

        # 调用 DeepSeek API
        headers = {
            "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
            "Content-Type": "application/json"
        }

        # 根据分析类型设置系统提示
        system_message = get_system_message(analysis_type, target)

        payload = {
            "model": DEEPSEEK_MODEL,
            "messages": [
                {
                    "role": "system",
                    "content": system_message
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "max_tokens": 300,
            "temperature": 0.7
        }

        response = requests.post(
            DEEPSEEK_API_URL,
            headers=headers,
            json=payload,
            timeout=15
        )

        if response.status_code != 200:
            error_msg = response.json().get("error", {}).get("message", "未知错误")
            return jsonify({
                "error": f"DeepSeek API 错误 ({response.status_code}): {error_msg}"
            }), 500

        result = response.json()
        suggestion = result["choices"][0]["message"]["content"].strip()

        return jsonify({
            "success": True,
            "suggestion": suggestion,
            "analysis_type": analysis_type,
            "target": target
        })

    except Exception as e:
        return jsonify({"error": f"服务器内部错误: {str(e)}"}), 500


# ========== 根据分析类型生成系统提示消息 ==========
def get_system_message(analysis_type, target):
    """根据分析类型生成系统提示消息"""
    if analysis_type == 'single' and target:
        sensor_info = SENSOR_MAPPING.get(target, {})
        sensor_name = sensor_info.get('name', target)
        return (f"你是一名农业专家，请专门针对{sensor_name}的实时数据给出简洁、实用的种植建议。"
                f"请结合该传感器的实时数据，重点分析其当前状态是否正常，并给出具体的调控建议。"
                f"回答要简洁明了，不超过100字。")

    elif analysis_type == 'region' and target:
        return (f"你是一名农业专家，请专门针对{target}的实时数据给出简洁、实用的种植建议。"
                f"请综合分析该区域内所有传感器的数据，评估整体环境状况，并给出具体的管理建议。"
                f"回答要简洁明了，不超过100字。")

    else:
        return ("你是一名农业专家，请根据传感器的实时数据给出种植户简洁、实用的种植建议和目标数据。"
                "请结合实时传感器数据和未来2小时天气趋势,重点判断光照是否满足幼苗生长并预测未来两小时内的空气质量")


# ========== 构建提示词，支持不同分析类型 ==========
def build_prompt(data, analysis_type='all', target=None):
    """构建提示词，支持不同分析类型，按指定顺序排列"""
    lines = ["当前农田传感器实时数据如下："]

    # 确定要包含的传感器
    sensors_to_include = []

    if analysis_type == 'single' and target:
        # 单个传感器分析
        if target in SENSOR_MAPPING:
            sensors_to_include = [target]
        else:
            sensors_to_include = list(data.keys())[:1] if data else []

    elif analysis_type == 'region' and target:
        # 区域分析
        if target in REGION_GROUPS:
            sensors_to_include = [sensor for sensor in REGION_GROUPS[target] if sensor in data]
        else:
            # 如果指定的区域不存在，使用所有相关传感器
            sensors_to_include = [k for k in data.keys() if k in SENSOR_MAPPING]
        # 按固定顺序排列
        sensors_to_include = [s for s in SENSOR_ORDER if s in sensors_to_include]

    else:
        # 全部分析，按固定顺序排列
        sensors_to_include = [s for s in SENSOR_ORDER if s in data and s in SENSOR_MAPPING]

    # 按分类添加传感器数据
    current_category = None
    for key in sensors_to_include:
        if key in data and key in SENSOR_MAPPING:
            value = data[key]
            sensor_info = SENSOR_MAPPING[key]
            sensor_name = sensor_info['name']
            unit = sensor_info['unit']
            category = sensor_info['category']

            # 显示分类标题
            if category != current_category:
                current_category = category
                lines.append(f"\n【{current_category}】")

            if value is not None:
                if unit == "lx":
                    lines.append(f"- {sensor_name}: {value:.0f} {unit}")
                elif unit in ["％", "%"]:
                    lines.append(f"- {sensor_name}: {value:.1f}{unit}")
                elif unit == "℃":
                    lines.append(f"- {sensor_name}: {value:.1f}{unit}")
                else:
                    lines.append(f"- {sensor_name}: {value:.1f} {unit}" if unit else f"- {sensor_name}: {value:.1f}")

    # 添加分析指令
    if analysis_type == 'single' and target:
        sensor_name = SENSOR_MAPPING.get(target, {}).get('name', target)
        lines.append(f"\n请专门针对{sensor_name}的数据，给出不超过100字的具体建议。")
    elif analysis_type == 'region' and target:
        lines.append(f"\n请专门针对{target}的数据，给出不超过100字的综合管理建议。")
    else:
        lines.append("\n请基于以上数据，给出不超过100字的种植建议，例如是否需要灌溉、补光、通风等。")

    return "\n".join(lines)


# ========== 获取所有可用的区域列表 ==========
@app.route('/ai/regions', methods=['GET'])
def get_regions():
    """获取所有可用的区域列表"""
    regions = list(REGION_GROUPS.keys())
    return jsonify({
        "success": True,
        "regions": regions
    })


# ========== 获取所有可用的传感器列表（只包含指定的6个） ==========
@app.route('/ai/sensors', methods=['GET'])
def get_sensors():
    """获取所有可用的传感器列表（只包含指定的6个）"""
    sensors = []
    for sensor_id, info in SENSOR_MAPPING.items():
        sensors.append({
            "id": sensor_id,
            "name": info["name"],
            "category": info["category"],
            "unit": info["unit"]
        })
    return jsonify({
        "success": True,
        "sensors": sensors
    })


# ========== 专门用于区域或单个传感器分析的端点 ==========
@app.route('/ai/analyze', methods=['POST'])
def analyze_specific_target():
    try:
        data = request.get_json()
        if not data or 'sensor_data' not in data:
            return jsonify({"error": "缺少 sensor_data 字段"}), 400

        if 'analysis_type' not in data or 'target' not in data:
            return jsonify({"error": "缺少 analysis_type 或 target 字段"}), 400

        analysis_type = data['analysis_type']
        target = data['target']

        if analysis_type not in ['region', 'single']:
            return jsonify({"error": "analysis_type 必须是 'region' 或 'single'"}), 400

        # 验证目标是否存在
        if analysis_type == 'region' and target not in REGION_GROUPS:
            return jsonify({"error": f"区域 '{target}' 不存在。可用区域: {list(REGION_GROUPS.keys())}"}), 400

        if analysis_type == 'single' and target not in SENSOR_MAPPING:
            return jsonify({"error": f"传感器 '{target}' 不存在。可用传感器: {list(SENSOR_MAPPING.keys())}"}), 400

        # 调用主分析函数
        return get_ai_suggestion()

    except Exception as e:
        return jsonify({"error": f"服务器内部错误: {str(e)}"}), 500


# ========== 启动服务 ==========
if __name__ == '__main__':
    print(f"\n✅ 服务启动成功！")
    print(f"🏠 API 地址: http://localhost:000")
    app.run(host='0.0.0.0', port=4000, debug=True)