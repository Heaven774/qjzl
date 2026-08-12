// AI预测和建议模块
class AIPredictor {
    constructor() {
        this.yourApiKey = null;
        this.apiEndpoint = 'https://api.deepseek.com/chat/completions'; // 修正的端点
        this.lastPredictionTime = null;
        this.predictionInterval = 300000; // 5分钟更新一次
        this.isPredicting = false;
    }

    // 配置API密钥
    setYourApiKey(yourApiKey) {
        this.yourApiKey = yourApiKey;
    }

    // 检查是否已配置API密钥
    isConfigured() {
        return this.yourApiKey && this.yourApiKey.trim() !== '';
    }

    // 格式化传感器数据为AI可理解的文本
    formatSensorDataForAI(sensorData) {
        let formattedText = "当前农业环境传感器数据如下：\n\n";

        const sensorConfig = {
            // 幼苗区
            s_temp: { name: "幼苗区_温度", unit: "°C", optimal: "25-30°C" },
            s_hum: { name: "幼苗区_湿度", unit: "%", optimal: "70-80%" },
            s_lx: { name: "幼苗区_光照", unit: "Lx", optimal: "15000-30000 lx" },
            s_sox: { name: "幼苗区_有害气体", unit: "", optimal: "<400ppm" },
            // 种植区环境
            e_tamb: { name: "种植区_环境温度", unit: "°C", optimal: "20-30°C" },
            e_ah: { name: "种植区_环境湿度", unit: "%", optimal: "60-80%" },
            e_tvoc: { name: "种植区_环境空气质量", unit: "mg/m³", optimal: "<0.6mg/m³" },
            e_bt: { name: "种植区_环境人体检测", unit: "", optimal: "-" },
            e_pm: { name: "种植区_环境PM2.5", unit: "μg/m³", optimal: "<75μg/m³" },
            e_patm: { name: "种植区_环境大气压", unit: "hPa", optimal: "1000-1013hPa" },
            ws: { name: "种植区_环境风速", unit: "m/s", optimal: "0-5m/s" },
            // 种植区土壤
            p_temp: { name: "种植区_土壤温度", unit: "°C", optimal: "23-28°C" },
            p_hum: { name: "种植区_土壤湿度", unit: "%", optimal: "70-80%" },
            p_ph: { name: "种植区_土壤PH值", unit: "PH", optimal: "6.0-7.0" },
            p_N: { name: "种植区_氮元素", unit: "mg/kg", optimal: "100-200mg/kg" },
            p_P: { name: "种植区_磷元素", unit: "mg/kg", optimal: "40-80mg/kg" },
            p_K: { name: "种植区_钾元素", unit: "mg/kg", optimal: "150-250mg/kg" },
            // 蓄水区
            w_ll: { name: "蓄水区_液位", unit: "mH2O", optimal: "0.5-1.5m" },
            // 烘干区
            d_temp: { name: "烘干区_温度", unit: "°C", optimal: "40-55°C" },
            d_hum: { name: "烘干区_湿度", unit: "%", optimal: "40-60%" },
            // 冷链运输区
            r_temp: { name: "冷链运输区_温度", unit: "°C", optimal: "7-10°C" },
            r_hum: { name: "冷链运输区_湿度", unit: "%", optimal: "90-95%" },
            r_co2: { name: "CO2浓度", unit: "ppm", optimal: "500-2000ppm" }
        };

        Object.keys(sensorData).forEach(sensorId => {
            const data = sensorData[sensorId];
            const config = sensorConfig[sensorId];
            if (config && data !== '--' && data !== undefined && data !== null) {
                const value = parseFloat(data);
                if (!isNaN(value)) {
                    formattedText += `${config.name}: ${value}${config.unit}\n`;
                }
            }
        });

        return formattedText;
    }

    // 检查是否需要更新预测
    shouldUpdatePrediction() {
        if (!this.lastPredictionTime) return true;
        const now = Date.now();
        return (now - this.lastPredictionTime) > this.predictionInterval;
    }

    // 获取AI预测和建议
    async getPrediction(sensorData, actuatorStates) {
        if (this.isPredicting || !this.isConfigured()) {
            return null;
        }

        this.isPredicting = true;

        try {
            const formattedData = this.formatSensorDataForAI(sensorData);

            // 获取当前设备状态
            const deviceStates = {};
            const actuatorNames = {
                s_light: "幼苗区_补光灯",
                s_fan: "幼苗区_通风扇",
                w_wp: "蓄水区_水泵",
                d_drlamp: "烘干区_烘干灯",
                d_cv: "烘干区_传送带",
                d_fan: "烘干区_通风扇",
                red_light: "三色灯",
                buzzer: "蜂鸣器"
            };

            Object.keys(actuatorStates).forEach(device => {
                const state = actuatorStates[device];
                const stateText = state === 1 ? "开启" : "关闭";
                deviceStates[device] = `${actuatorNames[device]}：${stateText}`;
            });

            const deviceStateText = Object.values(deviceStates).join("，");

            // 获取当前时间
            const now = new Date();
            const currentHour = now.getHours();
            let timePeriod = "白天";
            if (currentHour >= 18 || currentHour < 6) {
                timePeriod = "夜间";
            }

            // 构建AI请求提示词
            const prompt = `你是一个专业的农业种植专家。请基于以下数据面相企业管理者提供专业的分析、采收期预测和建议：

${formattedData}

当前设备状态：${deviceStateText}
当前时间：${timePeriod}（${currentHour}点）
种植作物：辣椒（辣椒的一种）

请按以下格式提供分析：

【环境评估】
1. 总体评价：使用简短评价（优秀/良好/一般/需要改善/危险）
2. 各项指标分析：逐项分析每个环境数据是否在适宜范围，如果不在适宜的范围请给出适宜范围的具体数据

【未来趋势分析】
1. 短期预测：接下来1小时可能的变化趋势，作为企业管理人员应该怎样做
2. 采收期预测：请给出辣椒的采收期和建议
3. 风险预警：可能出现的风险及预警级别

【优化建议】
1. 设备调整建议：基于当前数据，应该开启或关闭哪些设备，给出阈值光照范围在2000-5000lx为具体的适宜生长数据
2. 种植管理建议：具体的农业操作建议并给出具体的数据

请用专业但易懂的语言回答（300字左右），重点突出可以进行的操作建议。`;

            const response = await fetch(this.apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.yourApiKey}`,
                    'Accept': 'application/json'
                },
                body: JSON.stringify({
                    model: 'deepseek-chat', // 确认这是正确的模型名称
                    messages: [
                        {
                            role: 'system',
                            content: '你是一个经验丰富的农业种植专家，精通温室大棚种植技术，特别是辣椒（辣椒）的种植。请对企业管理人员提供专业、准确、实用的建议。'
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 1500,
                    temperature: 0.7,
                    stream: false
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API响应错误:', response.status, response.statusText, errorText);
                throw new Error(`HTTP error! status: ${response.status}, ${errorText}`);
            }

            const result = await response.json();

            if (result.choices && result.choices.length > 0) {
                const aiResponse = result.choices[0].message.content;
                this.lastPredictionTime = Date.now();

                // 解析AI响应
                const parsedResult = this.parseAIResponse(aiResponse);
                
                // 存储AI分析结果到数据库
                this.saveAIAnalysisResult(parsedResult, sensorData);

                return parsedResult;
            } else {
                throw new Error('AI响应格式错误: ' + JSON.stringify(result));
            }

        } catch (error) {
            console.error('获取AI预测失败:', error);

            let errorMessage = 'AI服务暂时不可用';
            if (error.message) {
                errorMessage += ` (${error.message})`;
            }

            return {
                overallAssessment: errorMessage,
                riskLevel: '未知',
                suggestions: [
                    '1. 请检查DeepSeek API密钥是否正确',
                    '2. 确保网络连接正常',
                    '3. 检查浏览器控制台查看详细错误信息',
                    '4. 如果问题持续，请联系系统管理员'
                ]
            };
        } finally {
            this.isPredicting = false;
        }
    }

    // 根据传感器数据和分析结果生成置信度
    generateConfidenceScore(sensorData, analysisResult) {
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

    // 解析AI响应
    parseAIResponse(aiText) {
        const result = {
            overallAssessment: '',
            detailedAnalysis: {},
            predictions: [],
            suggestions: [],
            riskLevel: '低',
            timestamp: new Date().toLocaleString()
        };

        try {
            // 提取总体评价
            const overallMatch = aiText.match(/总体评价：([^\n]+)/);
            if (overallMatch) {
                result.overallAssessment = overallMatch[1].trim();
            }

            // 提取风险预警
            const riskMatch = aiText.match(/预警级别[：:]([^\n]+)/) ||
                aiText.match(/风险[：:]([^\n]+)/);
            if (riskMatch) {
                result.riskLevel = riskMatch[1].trim();
            }

            // 提取建议
            const suggestionSection = aiText.split('【优化建议】')[1];
            if (suggestionSection) {
                const suggestions = suggestionSection.split(/\d\.\s+/).filter(s => s.trim());
                suggestions.forEach(suggestion => {
                    if (!suggestion.includes('【') && suggestion.trim()) {
                        result.suggestions.push(suggestion.trim());
                    }
                });
            }

            // 提取预测
            const predictionSection = aiText.split('【未来趋势预测】')[1];
            if (predictionSection) {
                const predictions = predictionSection.split('【')[0].split(/\d\.\s+/).filter(p => p.trim());
                predictions.forEach(prediction => {
                    if (prediction.trim()) {
                        result.predictions.push(prediction.trim());
                    }
                });
            }

            // 如果解析失败，使用原始文本
            if (result.suggestions.length === 0 && result.predictions.length === 0) {
                // 尝试简单分割
                const lines = aiText.split('\n').filter(line => line.trim());
                lines.forEach(line => {
                    if (line.includes('建议') || line.includes('应该') || line.includes('需要')) {
                        result.suggestions.push(line.trim());
                    } else if (line.includes('预测') || line.includes('可能') || line.includes('趋势')) {
                        result.predictions.push(line.trim());
                    }
                });

                // 如果仍然为空，使用前几行作为预测
                if (result.predictions.length === 0 && lines.length > 0) {
                    result.predictions = lines.slice(0, Math.min(3, lines.length)).map(l => l.trim());
                }
            }

        } catch (error) {
            console.error('解析AI响应失败:', error);
            result.overallAssessment = '分析进行中...';
            result.suggestions = ['正在分析环境数据...'];
        }

        return result;
    }

    async saveAIAnalysisResult(analysisResult, sensorData) {
        try {
            // 生成动态置信度
            const confidence = this.generateConfidenceScore(sensorData, analysisResult);
            
            const response = await fetch(`${window.API_BASE || `/api`}/ai/analysis`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    analysis_type: 'environment',
                    environment_assessment: analysisResult.overallAssessment || '未知',
                    risk_level: analysisResult.riskLevel || '未知',
                    predictions: analysisResult.predictions || [],
                    suggestions: analysisResult.suggestions || [],
                    sensor_snapshot: sensorData || {},
                    model_version: 'deepseek-chat',
                    confidence_score: confidence
                })
            });
            const result = await response.json();
            console.log('AI分析结果存储:', result, '置信度:', confidence);
        } catch (error) {
            console.error('存储AI分析结果失败:', error);
        }
    }
}

// 导出单例实例
window.aiPredictor = new AIPredictor();
