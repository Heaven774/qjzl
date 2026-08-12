package com.example.smartfarm.device;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.ProgressBar;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.fragment.app.Fragment;

import com.example.smartfarm.MainActivity;
import com.example.smartfarm.R;

import org.json.JSONObject;

import java.io.IOException;
import java.net.SocketTimeoutException;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class AIAnalysisFragment extends Fragment {
    private static final String TAG = "AIAnalysisFragment";
    private static final String FLASK_BACKEND_URL = "http://YOUR_SERVER_IP/ai-service/ai/suggest";

    // 所有必需的传感器键（与后端一致，按固定顺序排列）
    private static final String[] ALL_REQUIRED_KEYS = {
            // 幼苗区
            "s_temp",
            "s_hum",
            "s_lx",
            "s_sox",
            // 种植区_环境
            "e_tamb",
            "e_ah",
            "e_tvoc",
            "e_bt",
            "e_pm",
            "e_patm",
            "ws",
            // 种植区_土壤
            "p_temp",
            "p_hum",
            "p_ph",
            "p_N",
            "p_P",
            "p_K",
            // 烘干区
            "d_temp",
            "d_hum"
    };

    private static final String[] YOUNG_ZONE_KEYS = {"s_temp", "s_hum", "s_lx", "s_sox"};
    private static final String[] ENV_ZONE_KEYS = {"e_tamb", "e_ah", "e_tvoc", "e_bt", "e_pm", "e_patm", "ws"};
    private static final String[] SOIL_ZONE_KEYS = {"p_temp", "p_hum", "p_ph", "p_N", "p_P", "p_K"};
    private static final String[] DRYING_ZONE_KEYS = {"d_temp", "d_hum"};
    
    // 传感器分类映射
    private static final Map<String, String> SENSOR_CATEGORY = new HashMap<>();
    static {
        // 幼苗区
        SENSOR_CATEGORY.put("s_temp", "幼苗区");
        SENSOR_CATEGORY.put("s_hum", "幼苗区");
        SENSOR_CATEGORY.put("s_lx", "幼苗区");
        SENSOR_CATEGORY.put("s_sox", "幼苗区");
        // 种植区_环境
        SENSOR_CATEGORY.put("e_tamb", "种植区_环境");
        SENSOR_CATEGORY.put("e_ah", "种植区_环境");
        SENSOR_CATEGORY.put("e_tvoc", "种植区_环境");
        SENSOR_CATEGORY.put("e_bt", "种植区_环境");
        SENSOR_CATEGORY.put("e_pm", "种植区_环境");
        SENSOR_CATEGORY.put("e_patm", "种植区_环境");
        SENSOR_CATEGORY.put("ws", "种植区_环境");
        // 种植区_土壤
        SENSOR_CATEGORY.put("p_temp", "种植区_土壤");
        SENSOR_CATEGORY.put("p_hum", "种植区_土壤");
        SENSOR_CATEGORY.put("p_ph", "种植区_土壤");
        SENSOR_CATEGORY.put("p_N", "种植区_土壤");
        SENSOR_CATEGORY.put("p_P", "种植区_土壤");
        SENSOR_CATEGORY.put("p_K", "种植区_土壤");
        // 烘干区
        SENSOR_CATEGORY.put("d_temp", "烘干区");
        SENSOR_CATEGORY.put("d_hum", "烘干区");
    }

    private TextView tvSuggestion;
    private TextView tvDataSummary;
    private Button btnRefresh;
    private ProgressBar progressBar;
    private Spinner spinnerMode;
    private Spinner spinnerTarget;
    private CheckBox checkboxPredictFuture;

    private OkHttpClient client;
    private Handler mainHandler;

    private String[] sensorKeys;
    private String[] sensorDisplayNames;
    private String[] zoneNames;

    public AIAnalysisFragment() {}

    public static AIAnalysisFragment newInstance(String userToken) {
        AIAnalysisFragment fragment = new AIAnalysisFragment();
        Bundle args = new Bundle();
        args.putString("user_token", userToken);
        fragment.setArguments(args);
        return fragment;
    }

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        View root = inflater.inflate(R.layout.fragment_ai_analysis, container, false);

        // 初始化 UI 组件
        tvSuggestion = root.findViewById(R.id.tv_suggestion);
        tvDataSummary = root.findViewById(R.id.tv_data_summary);
        btnRefresh = root.findViewById(R.id.btn_refresh);
        progressBar = root.findViewById(R.id.progress_bar);
        spinnerMode = root.findViewById(R.id.spinner_mode);
        spinnerTarget = root.findViewById(R.id.spinner_target);
        checkboxPredictFuture = root.findViewById(R.id.checkbox_predict_future); // 绑定 CheckBox

        // 配置 OkHttpClient，添加超时设置
        client = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(30, TimeUnit.SECONDS)
                .writeTimeout(10, TimeUnit.SECONDS)
                .build();
        mainHandler = new Handler(Looper.getMainLooper());

        // 加载资源
        sensorKeys = getResources().getStringArray(R.array.sensor_keys);
        sensorDisplayNames = getResources().getStringArray(R.array.sensor_display_names);
        zoneNames = getResources().getStringArray(R.array.zone_names);

        // 设置分析方式 Spinner
        ArrayAdapter<String> modeAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item,
                getResources().getStringArray(R.array.analysis_modes));
        modeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerMode.setAdapter(modeAdapter);

        spinnerMode.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String mode = (String) parent.getItemAtPosition(position);
                updateTargetSpinner(mode);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        btnRefresh.setOnClickListener(v -> fetchAISuggestionFromBackend());

        // 初始提示
        tvSuggestion.setText("点击“智能分析”获取种植建议");
        tvDataSummary.setText("📊 等待传感器数据...");

        return root;
    }

    // 根据分析方式更新目标 Spinner
    private void updateTargetSpinner(String mode) {
        if ("全部分析".equals(mode)) {
            spinnerTarget.setEnabled(false);
            ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(),
                    android.R.layout.simple_spinner_item, new String[]{"（自动包含所有区域）"});
            adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            spinnerTarget.setAdapter(adapter);
        } else if ("区域分析".equals(mode)) {
            spinnerTarget.setEnabled(true);
            ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(),
                    android.R.layout.simple_spinner_item, zoneNames);
            adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            spinnerTarget.setAdapter(adapter);
        } else if ("传感器分析".equals(mode)) {
            spinnerTarget.setEnabled(true);
            ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(),
                    android.R.layout.simple_spinner_item, sensorDisplayNames);
            adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
            spinnerTarget.setAdapter(adapter);
        }
    }

    // 获取最新的传感器数据
    private Map<String, Double> getLatestSensorData() {
        try {
            MainActivity mainActivity = (MainActivity) requireActivity();
            DeviceMonitorFragment monitorFragment = mainActivity.getDeviceMonitorFragment();
            if (monitorFragment == null) {
                Log.w(TAG, "DeviceMonitorFragment is null");
                return Collections.emptyMap();
            }
            if (!monitorFragment.hasSensorData()) {
                return Collections.emptyMap();
            }
            return monitorFragment.getLatestSensorValues();
        } catch (Exception e) {
            Log.e(TAG, "Failed to get sensor data", e);
            return Collections.emptyMap();
        }
    }

    // 检查网络连接状态
    private boolean isNetworkAvailable() {
        try {
            ConnectivityManager connectivityManager = 
                (ConnectivityManager) requireContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            NetworkInfo activeNetworkInfo = connectivityManager.getActiveNetworkInfo();
            return activeNetworkInfo != null && activeNetworkInfo.isConnected();
        } catch (Exception e) {
            Log.e(TAG, "检查网络连接失败", e);
            return false;
        }
    }

    // 从后端获取 AI 建议
    private void fetchAISuggestionFromBackend() {
        // 先检查网络连接
        if (!isNetworkAvailable()) {
            showError("网络不可用，请检查您的网络连接");
            return;
        }

        String mode, target;
        try {
            mode = spinnerMode.getSelectedItem().toString();
            target = spinnerTarget.getSelectedItem().toString();
        } catch (Exception e) {
            showError("请选择有效的分析方式和目标");
            return;
        }

        Map<String, Double> allData = getLatestSensorData();
        if (allData.isEmpty()) {
            showError("暂无传感器数据，请先在【环境监测】页面获取数据");
            return;
        }

        Map<String, Double> filteredData = new HashMap<>();

        if ("全部分析".equals(mode)) {
            for (String key : ALL_REQUIRED_KEYS) {
                if (allData.containsKey(key)) {
                    filteredData.put(key, allData.get(key));
                }
            }
        } else if ("区域分析".equals(mode)) {
            if ("幼苗区".equals(target)) {
                for (String key : YOUNG_ZONE_KEYS) {
                    if (allData.containsKey(key)) {
                        filteredData.put(key, allData.get(key));
                    }
                }
            } else if ("种植区_环境".equals(target)) {
                for (String key : ENV_ZONE_KEYS) {
                    if (allData.containsKey(key)) {
                        filteredData.put(key, allData.get(key));
                    }
                }
            } else if ("种植区_土壤".equals(target)) {
                for (String key : SOIL_ZONE_KEYS) {
                    if (allData.containsKey(key)) {
                        filteredData.put(key, allData.get(key));
                    }
                }
            } else if ("烘干区".equals(target)) {
                for (String key : DRYING_ZONE_KEYS) {
                    if (allData.containsKey(key)) {
                        filteredData.put(key, allData.get(key));
                    }
                }
            }
        } else if ("传感器分析".equals(mode)) {
            for (int i = 0; i < sensorDisplayNames.length; i++) {
                if (sensorDisplayNames[i].equals(target)) {
                    String key = sensorKeys[i];
                    if (allData.containsKey(key)) {
                        filteredData.put(key, allData.get(key));
                    }
                    break;
                }
            }
        }

        if (filteredData.isEmpty()) {
            showError("所选目标暂无有效数据");
            return;
        }

        showLoading(true);

        JSONObject requestBody = new JSONObject();
        try {
            JSONObject sensorJson = new JSONObject();
            // 按固定顺序添加传感器数据
            for (String key : ALL_REQUIRED_KEYS) {
                if (filteredData.containsKey(key)) {
                    sensorJson.put(key, filteredData.get(key));
                }
            }
            requestBody.put("sensor_data", sensorJson);

            // 新增：是否预测未来3小时
            boolean predictFuture = checkboxPredictFuture.isChecked();
            requestBody.put("predict_future", predictFuture);

            Log.d(TAG, "构建的请求体: " + requestBody.toString());

        } catch (Exception e) {
            Log.e(TAG, "构建请求体失败", e);
            showError("数据格式错误");
            showLoading(false);
            return;
        }

        RequestBody body = RequestBody.create(
                MediaType.parse("application/json; charset=utf-8"),
                requestBody.toString()
        );

        Request request = new Request.Builder()
                .url(FLASK_BACKEND_URL)
                .post(body)
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "请求失败", e);
                mainHandler.post(() -> {
                    String errorMsg;
                    if (e instanceof SocketTimeoutException) {
                        errorMsg = "连接超时！请检查：\n1. 后端服务是否已启动\n2. 手机和后端是否在同一局域网\n3. 后端IP地址: " + FLASK_BACKEND_URL;
                    } else if (e.getMessage() != null && e.getMessage().contains("Connection refused")) {
                        errorMsg = "连接被拒绝！后端服务可能未启动或端口错误\n后端地址: " + FLASK_BACKEND_URL;
                    } else if (e.getMessage() != null && e.getMessage().contains("No route to host")) {
                        errorMsg = "无法连接到主机！请检查：\n1. 后端IP地址是否正确\n2. 手机和后端是否在同一局域网\n后端地址: " + FLASK_BACKEND_URL;
                    } else {
                        errorMsg = "连接后端失败: " + e.getMessage() + "\n后端地址: " + FLASK_BACKEND_URL;
                    }
                    showError(errorMsg);
                    showLoading(false);
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                String responseBody = response.body().string();
                Log.d(TAG, "后端响应: " + responseBody);
                Log.d(TAG, "响应码: " + response.code());

                mainHandler.post(() -> {
                    try {
                        if (!response.isSuccessful()) {
                            showError("服务器返回错误: HTTP " + response.code() + "\n响应: " + responseBody);
                            showLoading(false);
                            return;
                        }
                        
                        JSONObject json = new JSONObject(responseBody);
                        if (json.has("error")) {
                            String errorMsg = json.getString("error");
                            showError("分析失败: " + errorMsg);
                        } else if (json.getBoolean("success")) {
                            String suggestion = json.getString("suggestion");
                            tvSuggestion.setText(suggestion);
                            tvDataSummary.setText(formatDataSummary(filteredData, mode, target));
                        } else {
                            showError("未知响应格式");
                        }
                    } catch (Exception e) {
                        Log.e(TAG, "解析响应失败", e);
                        showError("解析结果失败: " + e.getMessage() + "\n原始响应: " + responseBody);
                    }
                    showLoading(false);
                });
            }
        });
    }

    // 格式化数据摘要（按分类排序显示）
    private String formatDataSummary(Map<String, Double> data, String mode, String target) {
        StringBuilder sb = new StringBuilder("📊 ");
        if ("全部分析".equals(mode)) {
            sb.append("综合分析数据：\n");
        } else if ("区域分析".equals(mode)) {
            sb.append(target).append("数据：\n");
        } else {
            sb.append("单传感器「").append(target).append("」数据：\n");
        }

        // 按固定顺序遍历传感器
        String currentCategory = null;
        for (String key : ALL_REQUIRED_KEYS) {
            if (!data.containsKey(key)) continue;
            
            double value = data.get(key);
            String label = getSensorLabel(key);
            String category = SENSOR_CATEGORY.get(key);
            
            // 显示分类标题
            if ("全部分析".equals(mode) && category != null && !category.equals(currentCategory)) {
                currentCategory = category;
                sb.append("\n【").append(currentCategory).append("】\n");
            }
            
            if (key.endsWith("_lx")) {
                sb.append("• ").append(label).append(": ").append(String.format("%.0f lx", value)).append("\n");
            } else if (key.endsWith("_temp") || key.equals("p_temp")) {
                sb.append("• ").append(label).append(": ").append(String.format("%.1f℃", value)).append("\n");
            } else if (key.endsWith("_hum") || key.equals("p_hum")) {
                sb.append("• ").append(label).append(": ").append(String.format("%.1f%%", value)).append("\n");
            } else {
                sb.append("• ").append(label).append(": ").append(value).append("\n");
            }
        }
        return sb.toString().trim();
    }

    // 获取传感器标签
    private String getSensorLabel(String key) {
        for (int i = 0; i < sensorKeys.length; i++) {
            if (sensorKeys[i].equals(key)) {
                return sensorDisplayNames[i];
            }
        }
        // 兜底映射
        switch (key) {
            case "s_temp": return "幼苗区_温度";
            case "s_hum": return "幼苗区_湿度";
            case "s_lx": return "幼苗区_光照强度";
            case "s_sox": return "幼苗区_有害气体";
            case "e_tamb": return "种植区_环境温度";
            case "e_ah": return "种植区_环境湿度";
            case "e_tvoc": return "种植区_环境空气质量";
            case "e_bt": return "种植区_环境人体";
            case "e_pm": return "种植区_环境Pm2.5";
            case "e_patm": return "种植区_环境大气压";
            case "ws": return "种植区_环境风速";
            case "p_temp": return "种植区_土壤温度";
            case "p_hum": return "种植区_土壤湿度";
            case "p_ph": return "种植区_土壤PH值";
            case "p_N": return "种植区_土壤氮";
            case "p_P": return "种植区_土壤磷";
            case "p_K": return "种植区_土壤钾";
            case "d_temp": return "烘干区_温度";
            case "d_hum": return "烘干区_湿度";
            default: return key;
        }
    }

    // 显示错误消息
    private void showError(String message) {
        Toast.makeText(requireContext(), message, Toast.LENGTH_LONG).show();
        tvSuggestion.setText("分析失败，请重试");
    }

    // 显示加载进度条
    private void showLoading(boolean loading) {
        if (loading) {
            progressBar.setVisibility(View.VISIBLE);
            btnRefresh.setEnabled(false);
        } else {
            progressBar.setVisibility(View.GONE);
            btnRefresh.setEnabled(true);
        }
    }
}