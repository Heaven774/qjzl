package com.example.smartfarm.device;

import android.annotation.SuppressLint;
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
import android.widget.EditText;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;


import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;

import com.example.smartfarm.MainActivity;
import com.example.smartfarm.R;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import cn.com.newland.nle_sdk.responseEntity.SensorDataRecord;
import cn.com.newland.nle_sdk.responseEntity.base.BaseResponseEntity;
import cn.com.newland.nle_sdk.util.NCallBack;
import cn.com.newland.nle_sdk.util.NetWorkBusiness;

public class DeviceMonitorFragment extends Fragment {

    // --- UI组件声明 --
    private TextView s_Temp, s_Hum, s_Lx, s_sox;
    private TextView e_Tamb, e_Ah, e_Tvoc, e_Bt, e_Pm, e_Patm, Ws;
    private TextView p_Temp, p_Hum, p_Ph, p_N, p_P, p_K;
    private TextView d_Temp, d_Hum;
    private TextView r_Temp, r_Hum, r_Co2;
    

    // 阈值设置UI
    private Spinner spinnerSensor;        // 传感器选择下拉框
    private Spinner spinnerCompareMode;   // 比较模式下拉框（低于/高于阈值）
    private EditText etThresholdValue;    // 阈值输入框
    private Button btnSaveThreshold;      // 保存阈值按钮

    // 比较模式：true=低于阈值，false=高于阈值
    private boolean isCompareModeLow = true;

    // 存储每个传感器的比较模式
    private final Map<String, Boolean> sensorCompareMode = new HashMap<>();

    // 定时器相关，用于周期性获取数据
    private Handler handler;
    private Runnable runnable;

    private String TOKEN = "";
    private static final String ARG_TOKEN = "arg_token";
    private static final String gateway= "1522156";
    private static final String terminal = "1522178";

    // 设备离线检测计数器
    private int mainDeviceFailureCount = 0;      // 主设备连续失败次数
    private int coldDeviceFailureCount = 0;      // 冷链设备连续失败次数
    private static final int MAX_FAILURES_BEFORE_OFFLINE = 5;
    private static final int MAX_FAILURES_BEFORE_RETRY = 3;

    // 设备在线状态标志
    private boolean isMainDeviceActive = true;
    private boolean isColdDeviceActive = true;

    private final Map<String, Double> latestSensorValues = new HashMap<>();
    private final Map<String, Double> triggerStartValue = new HashMap<>();

    private boolean hasEverReceivedData = false;

    private final Map<String, double[]> THRESHOLDS = new HashMap<>();

    private final Map<String, String> sensorDisplayMap = new LinkedHashMap<>();
    {
        // 幼苗区
        sensorDisplayMap.put("幼苗区湿度", "s_hum");
        sensorDisplayMap.put("幼苗区光照", "s_lx");
        sensorDisplayMap.put("幼苗区有害气体", "s_sox");
        // 种植区
        sensorDisplayMap.put("种植区环境湿度", "e_ah");
        sensorDisplayMap.put("种植区土壤湿度", "p_hum");
        // 烘干区
        sensorDisplayMap.put("烘干区温度", "d_temp");
    }

    // 存储上一次的控制状态，用于避免重复控制
    private final Map<String, Boolean> lastControlState = new HashMap<>();
    // 存储下次检查时需要强制弹窗提醒的传感器集合
    private final Set<String> forceAlertOnNextCheck = new HashSet<>();

    // === 光照控制相关状态 ===
    private boolean isFillLightInDelay = false;
    private boolean isGlobalWarningLightOnForFill = false;
    private boolean isFillLightOnForFill = false;
    private boolean hasEverTriggeredFillLightForYgz = false;

    // === 湿度控制（水泵）相关状态 ===
    private boolean isPumpInDelay = false;
    private boolean isPumpOnForHumidity = false;
    private Runnable delayedPumpRunnable = null;

    // === 有害气体控制（通风扇）相关状态 ===
    private boolean isVentilationInDelay = false;
    private boolean isVentilationOnForAir = false;
    private Runnable delayedVentilationRunnable = null;

    // === 冷链预警状态 ===
    private boolean isColdChainAlertActive = false;

    // 延时执行动作的时长（毫秒）
    private static final long DELAY_BEFORE_ACTION_MS = 10_000; // 10秒
    // 主线程Handler，用于延时任务
    private Handler mainHandler = new Handler(Looper.getMainLooper());
    private Runnable delayedFillLightRunnable = null;

    // 弹窗去重相关变量，避免短时间内重复弹窗
    private String lastAlertMessage = "";
    private long lastAlertTime = 0;

    // 轮询间隔（毫秒），网络正常时3秒，异常时10秒
    private long POLL_INTERVAL_NORMAL = 3000;
    private long POLL_INTERVAL_ERROR = 10000;
    private long currentPollInterval = POLL_INTERVAL_NORMAL;

    // 日志TAG
    private static final String TAG = "DeviceMonitor";

    // 空构造方法
    public DeviceMonitorFragment() {}

    public static DeviceMonitorFragment newInstance(String token) {
        DeviceMonitorFragment fragment = new DeviceMonitorFragment();
        Bundle args = new Bundle();
        args.putString(ARG_TOKEN, token);
        fragment.setArguments(args);
        return fragment;
    }

    @SuppressLint("MissingInflatedId")
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        // 加载布局文件
        View root = inflater.inflate(R.layout.fragment_device_monitor, container, false);

        
        // --- 初始化所有UI组件 ---
        s_Temp = root.findViewById(R.id.tv_s_temp);
        s_Hum = root.findViewById(R.id.tv_s_hum);
        s_Lx = root.findViewById(R.id.tv_s_lx);
        s_sox = root.findViewById(R.id.tv_s_sox);

        e_Tamb = root.findViewById(R.id.tv_e_tamb);
        e_Ah = root.findViewById(R.id.tv_e_ah);
        e_Tvoc = root.findViewById(R.id.tv_e_tvoc);
        e_Bt = root.findViewById(R.id.tv_e_bt);
        e_Pm = root.findViewById(R.id.tv_e_pm);
        e_Patm = root.findViewById(R.id.tv_e_patm);
        Ws = root.findViewById(R.id.tv_ws);

        p_Temp = root.findViewById(R.id.tv_p_temp);
        p_Hum = root.findViewById(R.id.tv_p_hum);
        p_Ph = root.findViewById(R.id.tv_p_ph);
        p_N = root.findViewById(R.id.tv_p_N);
        p_P = root.findViewById(R.id.tv_p_P);
        p_K = root.findViewById(R.id.tv_p_K);

        d_Temp = root.findViewById(R.id.tv_d_temp);
        d_Hum = root.findViewById(R.id.tv_d_hum);

        r_Temp = root.findViewById(R.id.tv_r_temp);
        r_Hum = root.findViewById(R.id.tv_r_hum);
        r_Co2 = root.findViewById(R.id.tv_r_co2);

        spinnerSensor = root.findViewById(R.id.spinner_sensor);
        spinnerCompareMode = root.findViewById(R.id.spinner_compare_mode);
        etThresholdValue = root.findViewById(R.id.et_threshold_value);
        btnSaveThreshold = root.findViewById(R.id.btn_save_threshold);

        // --- 获取传入的Token参数 ---
        if (getArguments() != null) {
            TOKEN = getArguments().getString(ARG_TOKEN);
        }
        // 如果没有Token，提示用户并关闭Activity
        if (TOKEN == null || TOKEN.isEmpty()) {
            Toast.makeText(requireContext(), "未获取到登录凭证，请重新登录", Toast.LENGTH_LONG).show();
            requireActivity().finish();
            return root;
        }
        Log.d(TAG, "初始化完成，Token: " + TOKEN.substring(0, Math.min(TOKEN.length(), 10)) + "...");



        // --- 设置传感器选择下拉框的适配器 ---
        List<String> names = new ArrayList<>(sensorDisplayMap.keySet());
        ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, names);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerSensor.setAdapter(adapter);

        // 设置比较模式下拉框的适配器
        String[] compareModes = {"低于阈值", "高于阈值"};
        ArrayAdapter<String> compareModeAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, compareModes);
        compareModeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spinnerCompareMode.setAdapter(compareModeAdapter);

        spinnerCompareMode.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                isCompareModeLow = (position == 0);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        // 设置保存阈值按钮的点击事件 ---
        btnSaveThreshold.setOnClickListener(v -> saveThreshold());

        // 传感器选择变化时，恢复该传感器的比较模式
        spinnerSensor.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String selectedName = parent.getItemAtPosition(position).toString();
                String tag = sensorDisplayMap.get(selectedName);
                if (tag != null && sensorCompareMode.containsKey(tag)) {
                    isCompareModeLow = sensorCompareMode.get(tag);
                    spinnerCompareMode.setSelection(isCompareModeLow ? 0 : 1);
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {}
        });

        // --- 设置清空阈值按钮的点击事件 ---
        Button btnClearThreshold = root.findViewById(R.id.btn_clear_threshold);
        btnClearThreshold.setOnClickListener(v -> {
            // 清空所有阈值数据
            THRESHOLDS.clear();
            lastControlState.clear();
            forceAlertOnNextCheck.clear();
            // 取消并重置补光相关状态
            cancelDelayedFillLight();
            resetFillLightState();
            hasEverTriggeredFillLightForYgz = false; // 清空补光触发标志

            // 重置水泵相关状态
            isPumpInDelay = false;
            isPumpOnForHumidity = false;
            cancelDelayedPump();

            // 重置通风扇相关状态
            isVentilationInDelay = false;
            isVentilationOnForAir = false;
            cancelDelayedVentilation();

            // 关闭冷链预警和全局预警灯
            isColdChainAlertActive = false;
            controlGlobalWarningLight(false, "cleanup");

            // 清空输入框
            etThresholdValue.setText("");

            // 通知主Activity更新控制模式状态
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).updateControlMode(false);
            }

            Toast.makeText(requireContext(), "所有阈值已清空", Toast.LENGTH_SHORT).show();
        });

        // 初始化设备状态标志
        isMainDeviceActive = true;
        isColdDeviceActive = true;
        mainDeviceFailureCount = 0;
        coldDeviceFailureCount = 0;
        currentPollInterval = POLL_INTERVAL_NORMAL;

        // 创建Handler用于定时任务
        handler = new Handler(Looper.getMainLooper());
        // 开始首次获取数据
        fetchMainDeviceData();
        fetchColdChainData();
        // 启动周期性数据获取
        startSensorDataPolling();

        return root;
    }

    private void fetchColdChainData() {
    }

    private void fetchMainDeviceData() {
        fetchData(gateway, "s_temp", s_Temp, "℃", "\uD83C\uDF21 温度");
        fetchData(gateway, "s_hum", s_Hum, "%", "\uD83D\uDCA7 湿度");
        fetchData(gateway, "s_lx", s_Lx, "lx", "☀\uFE0F 光照");
        fetchData(gateway, "s_sox", s_sox, " ", "\uD83D\uDCA8 有害气体");
        fetchData(gateway, "e_tamb", e_Tamb, "℃", "\uD83C\uDF21 温度");
        fetchData(gateway, "e_ah", e_Ah, "%", "\uD83D\uDCA7 湿度");
        fetchData(gateway, "e_tvoc", e_Tvoc, " ", "\uD83D\uDCA8 空气质量");
        fetchData(gateway, "e_bt", e_Bt, "℃", "\uD83D\uDC64 人体");
        fetchData(gateway, "e_pm", e_Pm, "μg/m³", "\uD83C\uDF2B\uFE0F Pm2.5");
        fetchData(gateway, "e_patm", e_Patm, "hpa", "⛅\uFE0F 大气压");
        fetchData(gateway, "ws", Ws, "m/s", "\uD83C\uDF2C\uFE0F 风速");
        fetchData(gateway, "p_temp", p_Temp, "℃", "\uD83C\uDF21 土壤温度  ");
        fetchData(gateway, "p_hum", p_Hum, "%", "\uD83D\uDCA7 土壤湿度  ");
        fetchData(gateway, "p_ph", p_Ph, "PH", "\uD83E\uDDEA 土壤PH值  ");
        fetchData(gateway, "p_N", p_N, "mg/kg", "\uD83E\uDDEA 土壤氮含量  ");
        fetchData(gateway, "p_P", p_P, "mg/kg", "\uD83E\uDDEA 土壤磷含量  ");
        fetchData(gateway, "p_K", p_K, "mg/kg", "\uD83E\uDDEA 土壤钾含量  ");
        fetchData(gateway, "d_temp", d_Temp, "℃", "\uD83C\uDF21 温度");
        fetchData(gateway, "d_hum", d_Hum, "%", "\uD83D\uDCA7 湿度");
        fetchData(gateway, "r_temp", r_Temp, "℃", "\uD83C\uDF21 温度");
        fetchData(gateway, "r_hum", r_Hum, "%", "\uD83D\uDCA7 湿度");
        fetchData(terminal, "r_co2", r_Co2, "ppm", "\uD83C\uDF2B\uFE0F CO₂浓度");
    }

    private void fetchData(String devId, String tag, TextView view, String unit, String label) {
        if (!isAdded() || view == null) {
            Log.w(TAG, "fetchData跳过：Fragment未附着或view为空，dev=" + devId + ", tag=" + tag);
            return;
        }

        try {
            Log.d(TAG, "发起数据请求：dev=" + devId + ", tag=" + tag);
            // 使用NetWorkBusiness发起请求，获取最新一条传感器数据
            NetWorkBusiness business = new NetWorkBusiness(TOKEN, "https://api.nlecloud.com/");
            // 增加超时时间（15秒），避免连接超时
            business.getSensorData(devId, tag, "", "", "", "", "DESC", "1", "0",
                    new NCallBack<BaseResponseEntity<SensorDataRecord>>(requireContext()) {
                        @Override
                        protected void onResponse(BaseResponseEntity<SensorDataRecord> resp) {
                            // 检查Fragment和Activity状态
                            if (!isAdded() || getActivity() == null || getActivity().isFinishing()) {
                                return;
                            }

                            boolean hasValidData = false;
                            try {
                                // 打印响应状态，方便调试
                                Log.d(TAG, "请求响应：dev=" + devId + ", tag=" + tag + ", status=" + resp.getStatus());

                                // 如果请求成功且返回结果不为空
                                if (resp.getStatus() == 0 && resp.getResultObj() != null) {
                                    var points = resp.getResultObj().DataPoints;
                                    if (points != null && !points.isEmpty()) {
                                        var dros = points.get(0).PointDTO;
                                        if (dros != null && !dros.isEmpty()) {
                                            String valStr = dros.get(0).Value;
                                            if (valStr != null && !valStr.trim().isEmpty()) {
                                                double val = Double.parseDouble(valStr.trim());
                                                // 组装显示文本
                                                String text = valStr + (unit.isEmpty() ? "" : " " + unit);

                                                // 在主线程更新UI（修复：简化判断，避免UI不刷新）
                                                getActivity().runOnUiThread(() -> {
                                                    if (view != null && !getActivity().isFinishing()) {
                                                        view.setText(text);
                                                    }
                                                });

                                                // 存储最新值，并通知控制面板和自动控制逻辑
                                                latestSensorValues.put(tag, val);
                                                notifyControlFragment(tag, val);
                                                checkAutoControl(tag, val);
                                                hasValidData = true;
                                                Log.d(TAG, "数据获取成功：dev=" + devId + ", tag=" + tag + ", value=" + val);
                                            }
                                        }
                                    }
                                } else {
                                    Log.w(TAG, "请求失败：dev=" + devId + ", tag=" + tag + ", status=" + resp.getStatus() + ", msg=" + resp.getMsg());
                                }
                            } catch (Exception e) {
                                Log.e(TAG, "解析传感器数据失败: dev=" + devId + ", tag=" + tag, e);
                            }

                            // 根据设备ID重置失败计数，并处理首次接收到数据的标志
                            if (gateway.equals(devId)) {
                                if (hasValidData) {
                                    mainDeviceFailureCount = 0;
                                    if (!hasEverReceivedData) {
                                        hasEverReceivedData = true;
                                        if (getActivity() instanceof MainActivity) {
                                            ((MainActivity) getActivity()).updateSystemStatus(true, false);
                                        }
                                    }
                                } else {
                                    mainDeviceFailureCount++;
                                    Log.w(TAG, "主设备失败计数+1：" + mainDeviceFailureCount);
                                }
                            } else if (terminal.equals(devId)) {
                                if (hasValidData) {
                                    coldDeviceFailureCount = 0;
                                } else {
                                    coldDeviceFailureCount++;
                                    Log.w(TAG, "冷链设备失败计数+1：" + coldDeviceFailureCount);
                                }
                            }
                        }

                        //增加错误回调，处理网络超时、连接失败等异常

                        public void onFailure(Throwable t) {

                            Log.e(TAG, "网络请求失败: dev=" + devId + ", tag=" + tag, t);
                            if (!isAdded()) return;

                            // 网络异常时，增加对应设备的失败计数
                            if (gateway.equals(devId)) {
                                mainDeviceFailureCount++;
                                Log.w(TAG, "主设备失败计数+1（网络异常）：" + mainDeviceFailureCount);
                            } else if (terminal.equals(devId)) {
                                coldDeviceFailureCount++;
                                Log.w(TAG, "冷链设备失败计数+1（网络异常）：" + coldDeviceFailureCount);
                            }
                        }
                    });
        } catch (Exception e) {
            Log.e(TAG, "发起请求异常: dev=" + devId + ", tag=" + tag, e);
            // 请求异常时，增加对应设备的失败计数
            if (gateway.equals(devId)) {
                mainDeviceFailureCount++;
            } else if (terminal.equals(devId)) {
                coldDeviceFailureCount++;
            }
        }
    }

    private void saveThreshold() {
        if (!isAdded()) return; // 检查Fragment是否已附着到Activity

        // 获取选中的传感器名称和输入的阈值文本
        String selectedName = spinnerSensor.getSelectedItem().toString();
        String input = etThresholdValue.getText().toString().trim();

        if (input.isEmpty()) {
            Toast.makeText(requireContext(), "请输入阈值", Toast.LENGTH_SHORT).show();
            return;
        }

        // 通过显示名称获取传感器标签(tag)
        String tag = sensorDisplayMap.get(selectedName);
        if (tag == null) {
            Toast.makeText(requireContext(), "传感器标签不存在", Toast.LENGTH_SHORT).show();
            return;
        }

        // 解析输入的阈值字符串，返回阈值数组（单值或区间）
        double[] range = parseThreshold(input);
        if (range == null) {
            Toast.makeText(requireContext(), "格式错误！例：30 或 20-30", Toast.LENGTH_SHORT).show();
            return;
        }

        // 存储阈值
        THRESHOLDS.put(tag, range);
        // 存储该传感器的比较模式
        sensorCompareMode.put(tag, isCompareModeLow);
        // 标记该传感器下次检查时需要强制弹窗提醒
        forceAlertOnNextCheck.add(tag);

        // 如果已有该传感器的实时数据，立即进行一次自动控制检查
        if (latestSensorValues.containsKey(tag)) {
            checkAutoControl(tag, latestSensorValues.get(tag));
        }

        // 通知主Activity有阈值被设置，更新控制模式UI
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).updateControlMode(true);
        }

        Toast.makeText(requireContext(), "阈值已保存", Toast.LENGTH_SHORT).show();
    }

    private double[] parseThreshold(String input) {
        if (input.contains("-")) {
            // 处理区间格式，如 "20-30"
            String[] parts = input.split("-");
            if (parts.length == 2) {
                try {
                    double a = Double.parseDouble(parts[0].trim());
                    double b = Double.parseDouble(parts[1].trim());
                    if (a <= b) return new double[]{a, b};
                } catch (Exception ignored) {}
            }
        } else {
            // 处理单值格式
            try {
                double v = Double.parseDouble(input);
                return new double[]{v};
            } catch (Exception ignored) {}
        }
        return null; // 解析失败
    }

    /**
     * 根据传感器标签返回对应的单位字符串
     */
    private String getUnit(String tag) {
        switch (tag) {
            case "s_temp":
            case "p_temp":
            case "r_temp":
            case "e_tamb":
            case "d_temp": return "℃";
            case "s_hum":
            case "p_hum":
            case "r_hum":
            case "e_ah":
            case "d_hum": return "%";
            case "s_lx": return "lx";
            case "e_tvoc":
            case "s_sox": return "";
            case "r_co2": return "ppm";
            case "p_ph": return "";
            case "p_N":
            case "p_P":
            case "p_K": return "mg/kg";
            case "e_bt":
            case "e_pm":
            case "e_patm": return "hpa";
            case "ws": return "m/s";
            default: return "";
        }
    }

    /**
     * 显示自动控制的提醒弹窗（带去重逻辑）
     * @param message 弹窗消息
     */
    private void showAlert(String message) {
        // 检查Fragment是否有效，Activity是否有效且未销毁
        if (!isAdded() || getActivity() == null || getActivity().isFinishing() || getActivity().isDestroyed()) {
            return;
        }

        // 去重：如果5秒内消息相同，则不重复弹窗
        if (message.equals(lastAlertMessage) && System.currentTimeMillis() - lastAlertTime < 5000) {
            return;
        }
        lastAlertMessage = message;
        lastAlertTime = System.currentTimeMillis();

        try {
            // 创建并显示对话框
            new AlertDialog.Builder(requireContext())
                    .setTitle("🤖 系统自动响应")
                    .setMessage(message)
                    .setPositiveButton("确定", null)
                    .show();
        } catch (Exception e) {
            Log.e(TAG, "弹窗失败", e);
        }
    }

    /**
     * 通知IntegratedControlFragment更新传感器数值
     * @param tag 传感器标签
     * @param value 数值
     */
    private void notifyControlFragment(String tag, double value) {
        if (!isAdded() || getActivity() == null) return;
        try {
            Fragment f = getActivity().getSupportFragmentManager().findFragmentByTag("control");
            if (f instanceof IntegratedControlFragment) {
                ((IntegratedControlFragment) f).updateSensorValue(tag, value);
            }
        } catch (Exception e) {
            Log.w(TAG, "通知控制面板失败", e);
        }
    }

    private void checkAutoControl(String tag, double currentValue) {
        if (!isAdded()) return;

        double[] threshold = THRESHOLDS.get(tag);
        if (threshold == null) return; // 没有设置阈值则退出

        String unit = getUnit(tag);
        String sensorName = getSensorDisplayName(tag);

        // === 1. 幼苗区湿度、种植区环境湿度 或 种植区土壤湿度 的自动控制（低于阈值时启动水泵）===
        if ("s_hum".equals(tag) || "e_ah".equals(tag) || "p_hum".equals(tag)) {
            double minThreshold = threshold[0]; // 湿度阈值（低于此值启动）
            String displayName;
            if ("s_hum".equals(tag)) {
                displayName = "幼苗区_湿度";
            } else if ("e_ah".equals(tag)) {
                displayName = "种植区_环境湿度";
            } else {
                displayName = "种植区_土壤湿度";
            }
            String deviceName = "水泵";

            // 如果当前值低于阈值，需要开启水泵
            if (currentValue < minThreshold) {
                // 如果不在延时等待中且水泵未开启
                if (!isPumpInDelay && !isPumpOnForHumidity) {
                    // 开启全局预警灯
                    controlGlobalWarningLight(true, "auto");
                    isPumpInDelay = true;
                    triggerStartValue.put(tag, currentValue);

                    // 取消之前的延时任务，重新开始计时
                    cancelDelayedPump();
                    delayedPumpRunnable = () -> {
                        if (!isAdded()) return;
                        Double currentNow = latestSensorValues.get(tag);
                        double[] thNow = THRESHOLDS.get(tag);
                        double thVal = (thNow != null && thNow.length > 0) ? thNow[0] : -1;

                        // 延时结束后再次检查，如果仍然低于阈值，则真正开启水泵
                        if (currentNow != null && thVal > 0 && currentNow < thVal) {
                            Fragment f = getActivity() != null ?
                                    getActivity().getSupportFragmentManager().findFragmentByTag("control") : null;
                            if (f instanceof IntegratedControlFragment) {
                                ((IntegratedControlFragment) f).ensureAndSendPump(true, "auto");
                            }
                            isPumpOnForHumidity = true;
                            controlGlobalWarningLight(false, "auto"); // 开启水泵后关闭预警灯

                            showAlert(String.format(
                                    "系统检测到%s异常（%.1f%%），低于设定阈值（%.1f%%），系统已自动响应，并开启%s",
                                    displayName, currentNow, thVal, deviceName
                            ));
                        } else {
                            controlGlobalWarningLight(false, "auto"); // 条件不满足，关闭预警灯
                        }
                        isPumpInDelay = false;
                    };
                    mainHandler.postDelayed(delayedPumpRunnable, DELAY_BEFORE_ACTION_MS);

                    // 立即触发预警提醒
                    showAlert(String.format(
                            "系统检测到%s异常（%.1f%%），低于设定阈值（%.1f%%），干旱预警已触发!",
                            displayName, currentValue, minThreshold
                    ));
                }
            } else {
                // 当前值已恢复正常（高于或等于阈值），如果水泵处于开启或延时状态，则关闭
                if (isPumpInDelay || isPumpOnForHumidity) {
                    cancelDelayedPump(); // 取消延时

                    // 通过IntegratedControlFragment发送关闭水泵指令
                    Fragment f = getActivity() != null ?
                            getActivity().getSupportFragmentManager().findFragmentByTag("control") : null;
                    if (f instanceof IntegratedControlFragment) {
                        ((IntegratedControlFragment) f).ensureAndSendPump(false, "auto");
                    }

                    // 如果没有其他需要预警灯的状态，则关闭全局预警灯
                    if (!isGlobalWarningLightOnForFill && !isColdChainAlertActive && !isVentilationInDelay) {
                        controlGlobalWarningLight(false, "auto");
                    }

                    isPumpInDelay = false;
                    isPumpOnForHumidity = false;

                    showAlert(String.format(
                            "系统检测到%s已达到设定最低阈值（%.1f%%），系统已自动响应并关闭%s",
                            displayName, minThreshold, deviceName
                    ));

                    // 自动关闭后，移除该传感器的阈值（一次性控制）
                    THRESHOLDS.remove(tag);
                    lastControlState.remove(tag);
                    forceAlertOnNextCheck.remove(tag);
                    triggerStartValue.remove(tag);

                    // 通知主Activity更新控制模式状态（可能不再有激活的阈值）
                    if (getActivity() instanceof MainActivity) {
                        ((MainActivity) getActivity()).updateControlMode(false);
                    }
                }
            }
        }
        // === 2. 幼苗区有害气体自动控制（高于阈值时启动通风扇）===
        else if ("s_sox".equals(tag)) {
            double maxThreshold = threshold[0]; // 气体浓度阈值（高于此值启动）
            String displayName = "幼苗区_有害气体";
            String deviceName = "通风扇";

            if (currentValue > maxThreshold) {
                if (!isVentilationInDelay && !isVentilationOnForAir) {
                    controlGlobalWarningLight(true, "auto");
                    isVentilationInDelay = true;
                    triggerStartValue.put(tag, currentValue);

                    cancelDelayedVentilation();
                    delayedVentilationRunnable = () -> {
                        if (!isAdded()) return;
                        Double currentNow = latestSensorValues.get("s_sox");
                        double[] thNow = THRESHOLDS.get("s_sox");
                        double thVal = (thNow != null && thNow.length > 0) ? thNow[0] : -1;

                        if (currentNow != null && thVal > 0 && currentNow > thVal) {
                            controlVentilationSeedling(true, "auto");
                            controlGlobalWarningLight(false, "auto");
                            isVentilationOnForAir = true;

                            showAlert(String.format(
                                    "系统检测到%s异常（%.2f），高于设定阈值（%.2f），系统已自动响应，并开启%s",
                                    displayName, currentNow, thVal, deviceName
                            ));
                        } else {
                            controlGlobalWarningLight(false, "auto");
                        }
                        isVentilationInDelay = false;
                    };
                    mainHandler.postDelayed(delayedVentilationRunnable, DELAY_BEFORE_ACTION_MS);

                    showAlert(String.format(
                            "系统检测到%s异常（%.2f），有害气体浓度超标（%.2f）已触发一级预警",
                            displayName, currentValue, maxThreshold
                    ));
                }
            } else {
                // 气体浓度恢复正常，关闭通风扇
                if (isVentilationInDelay || isVentilationOnForAir) {
                    cancelDelayedVentilation();
                    controlVentilationSeedling(false, "auto");

                    if (!isGlobalWarningLightOnForFill && !isColdChainAlertActive && !isPumpInDelay) {
                        controlGlobalWarningLight(false, "auto");
                    }

                    isVentilationInDelay = false;
                    isVentilationOnForAir = false;

                    showAlert(String.format(
                            "系统检测到%s已降至设定阈值（%.2f）以下，系统已自动响应并关闭%s",
                            displayName, maxThreshold, deviceName
                    ));

                    THRESHOLDS.remove(tag);
                    lastControlState.remove(tag);
                    forceAlertOnNextCheck.remove(tag);
                    triggerStartValue.remove(tag);

                    if (getActivity() instanceof MainActivity) {
                        ((MainActivity) getActivity()).updateControlMode(false);
                    }
                }
            }
        }
        // === 3. 冷链运输区温度或 湿度自动控制（低于阈值时触发预警）===
        else if ("r_temp".equals(tag) || "r_hum".equals(tag)) {
            double minThreshold = threshold[0];
            String displayName = "r_temp".equals(tag) ? "冷链_温度" : "冷链_湿度";

            if (currentValue < minThreshold) {
                // 触发冷链预警
                if (!isColdChainAlertActive) {
                    controlGlobalWarningLight(true, "auto");
                    isColdChainAlertActive = true;
                    showAlert(String.format(
                            "系统检测到%s异常（%.1f%s），低于设定阈值（%.1f%s,已触发冷链二级预警）",
                            displayName, currentValue, unit, minThreshold, unit
                    ));
                }
            } else {
                // 恢复正常，关闭冷链预警
                if (isColdChainAlertActive) {
                    if (!isGlobalWarningLightOnForFill && !isPumpInDelay && !isVentilationInDelay) {
                        controlGlobalWarningLight(false, "auto");
                    }
                    isColdChainAlertActive = false;

                    showAlert(String.format(
                            "系统检测到%s已达到设定最低阈值（%.1f%s），环境已恢复正常！",
                            displayName, minThreshold, unit
                    ));

                    THRESHOLDS.remove(tag);
                    lastControlState.remove(tag);
                    forceAlertOnNextCheck.remove(tag);
                    triggerStartValue.remove(tag);

                    if (getActivity() instanceof MainActivity) {
                        ((MainActivity) getActivity()).updateControlMode(false);
                    }
                }
            }
        }
        // === 4. 幼苗区光照 自动控制（低于阈值时启动补光灯）===
        else if ("s_lx".equals(tag)) {
            double minThreshold = threshold[0];
            String displayName = "幼苗区_光照";
            String deviceName = "补光灯";

            if (currentValue < minThreshold) {
                if (!isFillLightInDelay && !isFillLightOnForFill) {
                    // 首次触发时开启预警灯，之后不再开启
                    if (!hasEverTriggeredFillLightForYgz) {
                        controlGlobalWarningLight(true, "auto");
                        isGlobalWarningLightOnForFill = true;
                    } else {
                        isGlobalWarningLightOnForFill = false;
                    }

                    isFillLightInDelay = true;
                    triggerStartValue.put("s_lx", currentValue);

                    cancelDelayedFillLight();
                    delayedFillLightRunnable = () -> {
                        if (!isAdded()) return;
                        Double currentNow = latestSensorValues.get("s_lx");
                        double[] thNow = THRESHOLDS.get("s_lx");
                        double thVal = (thNow != null && thNow.length > 0) ? thNow[0] : -1;
                        if (currentNow != null && thVal > 0 && currentNow < thVal) {
                            controlGlobalWarningLight(false, "auto");
                            controlFillLight(true, "auto");
                            isGlobalWarningLightOnForFill = false;
                            isFillLightOnForFill = true;
                            isFillLightInDelay = false;
                            hasEverTriggeredFillLightForYgz = true; // 标记已触发过补光灯

                            showAlert(String.format(
                                    "系统检测到%s异常（%.1f lx），低于设定阈值（%.1f lx），系统已自动响应，并开启%s",
                                    displayName, currentNow, thVal, deviceName
                            ));
                        } else {
                            controlGlobalWarningLight(false, "auto");
                            isGlobalWarningLightOnForFill = false;
                            isFillLightInDelay = false;
                        }
                    };
                    mainHandler.postDelayed(delayedFillLightRunnable, DELAY_BEFORE_ACTION_MS);

                    // 如果需要强制弹窗（刚设置阈值时），则立即提醒
                    if (forceAlertOnNextCheck.contains("s_lx")) {
                        String alertMsg = String.format(
                                "系统检测到%s异常（%.1f lx），低于设定阈值（%.1f lx）光照严重不足",
                                displayName, currentValue, minThreshold
                        );
                        showAlert(alertMsg);
                        forceAlertOnNextCheck.remove("s_lx");
                        if (!hasEverTriggeredFillLightForYgz) {
                            hasEverTriggeredFillLightForYgz = true;
                        }
                    }
                }
            } else {
                // 光照恢复正常，关闭补光灯
                if (isGlobalWarningLightOnForFill || isFillLightOnForFill || isFillLightInDelay) {
                    cancelDelayedFillLight();
                    controlGlobalWarningLight(false, "auto");
                    controlFillLight(false, "auto");
                    resetFillLightState();
                    // 注意：不清除 hasEverTriggeredFillLightForYgz，保留记忆，下次不会再有预警灯

                    showAlert(String.format(
                            "系统检测到%s已达到设定最低阈值（%.1f lx），系统已自动响应并关闭%s",
                            displayName, minThreshold, deviceName
                    ));

                    triggerStartValue.remove("s_lx");
                    forceAlertOnNextCheck.remove("s_lx");
                }
            }
        }
        // === 5. 烘干区温度自动控制 ===
        else if ("d_temp".equals(tag)) {
            double thresholdValue = threshold[0];
            String displayName = "烘干区_温度";
            String deviceName;
            boolean shouldTurnOn;

            // 获取该传感器的比较模式，默认为低于阈值
            boolean compareModeLow = sensorCompareMode.getOrDefault(tag, true);

            if (compareModeLow) {
                // 模式1：低于阈值开启烘干灯
                deviceName = "烘干灯";
                shouldTurnOn = currentValue < thresholdValue;
            } else {
                // 模式2：高于阈值开启通风扇
                deviceName = "通风扇";
                shouldTurnOn = currentValue > thresholdValue;
            }

            Boolean lastState = lastControlState.get(tag);

            if (shouldTurnOn) {
                // 需要开启设备，且状态变化或需要强制提醒
                if (lastState == null || !lastState || forceAlertOnNextCheck.contains(tag)) {
                    String compareText = compareModeLow ? "低于" : "高于";
                    String msg = String.format(
                            "系统检测到%s异常（%.1f%s），%s设定阈值（%.1f%s），系统已自动响应，并开启%s",
                            displayName, currentValue, unit, compareText, thresholdValue, unit, deviceName
                    );
                    showAlert(msg);
                    forceAlertOnNextCheck.remove(tag);
                    triggerStartValue.put(tag, currentValue);
                }
            } else {
                // 温度恢复正常，关闭设备
                if (lastState != null && lastState) {
                    String compareText = compareModeLow ? "升至" : "降至";
                    showAlert(String.format(
                            "系统检测到%s已%s设定阈值（%.1f%s），系统已自动响应并关闭%s",
                            displayName, compareText, thresholdValue, unit, deviceName
                    ));

                    THRESHOLDS.remove(tag);
                    lastControlState.remove(tag);
                    forceAlertOnNextCheck.remove(tag);
                    triggerStartValue.remove(tag);

                    if (getActivity() instanceof MainActivity) {
                        ((MainActivity) getActivity()).updateControlMode(false);
                    }
                }
            }

            // 如果状态发生变化，则通过IntegratedControlFragment发送控制指令
            if (shouldTurnOn != Boolean.TRUE.equals(lastState)) {
                Fragment f = getActivity() != null ?
                        getActivity().getSupportFragmentManager().findFragmentByTag("control") : null;
                if (f instanceof IntegratedControlFragment) {
                    if (compareModeLow) {
                        ((IntegratedControlFragment) f).controlDryingLamp(shouldTurnOn, "auto");
                    } else {
                        ((IntegratedControlFragment) f).ensureAndSendVentilation(shouldTurnOn, "auto");
                    }
                }
                lastControlState.put(tag, shouldTurnOn);
            }
        }
        }

    /**
     * 根据传感器标签获取用于显示的名称
     */
    private String getSensorDisplayName(String tag) {
        switch (tag) {
            case "s_temp": return "幼苗区_温度";
            case "s_hum": return "幼苗区_湿度";
            case "s_lx": return "幼苗区_光照";
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
            case "p_N": return "种植区_土壤氮含量";
            case "p_P": return "种植区_土壤磷含量";
            case "p_K": return "种植区_土壤钾含量";
            case "r_co2": return "CO₂浓度";
            case "d_temp": return "烘干区_温度";
            case "r_temp": return "冷链_温度";
            case "r_hum": return "冷链_湿度";
            default: return "未知传感器";
        }
    }

    private void controlGlobalWarningLight(boolean on, String triggerType) {
        if (!isAdded()) return;
        try {
            Fragment f = getActivity() != null ?
                    getActivity().getSupportFragmentManager().findFragmentByTag("control") : null;
            if (f instanceof IntegratedControlFragment) {
                ((IntegratedControlFragment) f).controlRedLight(on, triggerType);
                ((IntegratedControlFragment) f).controlBuzzer(on, triggerType);
            }
        } catch (Exception e) {
            Log.e(TAG, "控制预警设备失败", e);
        }
    }

    private void controlRedLight(boolean on, String triggerType) {
        if (!isAdded()) return;
        try {
            Fragment f = getActivity() != null ?
                    getActivity().getSupportFragmentManager().findFragmentByTag("control") : null;
            if (f instanceof IntegratedControlFragment) {
                ((IntegratedControlFragment) f).controlRedLight(on, triggerType);
            }
        } catch (Exception e) {
            Log.e(TAG, "控制红灯失败", e);
        }
    }

    private void controlBuzzer(boolean on, String triggerType) {
        if (!isAdded()) return;
        try {
            Fragment f = getActivity() != null ?
                    getActivity().getSupportFragmentManager().findFragmentByTag("control") : null;
            if (f instanceof IntegratedControlFragment) {
                ((IntegratedControlFragment) f).controlBuzzer(on, triggerType);
            }
        } catch (Exception e) {
            Log.e(TAG, "控制蜂鸣器失败", e);
        }
    }


    private void controlVentilationSeedling(boolean on, String triggerType) {
        if (!isAdded()) return;
        try {
            Fragment f = getActivity() != null ?
                    getActivity().getSupportFragmentManager().findFragmentByTag("control") : null;
            if (f instanceof IntegratedControlFragment) {
                ((IntegratedControlFragment) f).controlVentilationSeedling(on, triggerType);
            }
        } catch (Exception e) {
            Log.e(TAG, "控制幼苗区通风扇失败", e);
        }
    }

    private void controlFillLight(boolean on, String triggerType) {
        if (!isAdded()) return;
        try {
            Fragment f = getActivity() != null ?
                    getActivity().getSupportFragmentManager().findFragmentByTag("control") : null;
            if (f instanceof IntegratedControlFragment) {
                ((IntegratedControlFragment) f).controlFillLight(on, triggerType);
            }
        } catch (Exception e) {
            Log.e(TAG, "控制补光灯失败", e);
        }
    }

    // === 延时任务取消方法 ===
    private void cancelDelayedFillLight() {
        if (delayedFillLightRunnable != null) {
            mainHandler.removeCallbacks(delayedFillLightRunnable);
            delayedFillLightRunnable = null;
        }
    }

    private void cancelDelayedPump() {
        if (delayedPumpRunnable != null) {
            mainHandler.removeCallbacks(delayedPumpRunnable);
            delayedPumpRunnable = null;
        }
    }

    private void cancelDelayedVentilation() {
        if (delayedVentilationRunnable != null) {
            mainHandler.removeCallbacks(delayedVentilationRunnable);
            delayedVentilationRunnable = null;
        }
    }

    /**
     * 重置补光灯相关状态
     */
    private void resetFillLightState() {
        isFillLightInDelay = false;
        isGlobalWarningLightOnForFill = false;
        isFillLightOnForFill = false;
        cancelDelayedFillLight();
    }

    private void startSensorDataPolling() {
        runnable = () -> {
            // 获取主设备和冷链设备的数据
            fetchMainDeviceData();
            fetchColdChainData();

            // 动态调整轮询间隔：连续失败超过3次，延长轮询间隔
            if (mainDeviceFailureCount >= MAX_FAILURES_BEFORE_RETRY || coldDeviceFailureCount >= MAX_FAILURES_BEFORE_RETRY) {
                currentPollInterval = POLL_INTERVAL_ERROR;
            } else {
                currentPollInterval = POLL_INTERVAL_NORMAL;
            }

            // 设备离线判定与自动恢复逻辑
            // 主设备离线判定
            if (isMainDeviceActive && mainDeviceFailureCount >= MAX_FAILURES_BEFORE_OFFLINE) {
                isMainDeviceActive = false;
                showToast("幼苗区/种植区设备已离线");
                if (getActivity() instanceof MainActivity) {
                    ((MainActivity) getActivity()).updateSystemStatus(false, false);
                }
            }
            // 主设备离线自动恢复：连续2次成功，恢复在线状态
            else if (!isMainDeviceActive && mainDeviceFailureCount == 0) {
                isMainDeviceActive = true;
                showToast("幼苗区/种植区设备已恢复在线");
                if (getActivity() instanceof MainActivity) {
                    ((MainActivity) getActivity()).updateSystemStatus(true, false);
                }
            }

            // 冷链设备离线判定
            if (isColdDeviceActive && coldDeviceFailureCount >= MAX_FAILURES_BEFORE_OFFLINE) {
                isColdDeviceActive = false;
                showToast("冷链运输区设备已离线");
            }
            // 冷链设备离线自动恢复
            else if (!isColdDeviceActive && coldDeviceFailureCount == 0) {
                isColdDeviceActive = true;
                showToast("冷链运输区设备已恢复在线");
            }

            // 如果Fragment仍存在，则按当前间隔再次执行
            if (isAdded()) {
                handler.postDelayed(runnable, currentPollInterval);
            }
        };
        if (isAdded()) {
            handler.post(runnable);
        }
    }

    private void showToast(String msg) {
        if (!isAdded() || getContext() == null) return;
        Toast.makeText(getContext(), msg, Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (handler != null) {
            handler.removeCallbacksAndMessages(null);
        }
        if (mainHandler != null) {
            mainHandler.removeCallbacksAndMessages(null);
        }
        resetFillLightState();
        hasEverTriggeredFillLightForYgz = false;
        isPumpInDelay = false;
        isPumpOnForHumidity = false;
        cancelDelayedPump();
        isVentilationInDelay = false;
        isVentilationOnForAir = false;
        cancelDelayedVentilation();
        controlGlobalWarningLight(false, "cleanup");
    }

    public boolean hasSensorData() {
        return !latestSensorValues.isEmpty();
    }

    public Map<String, Double> getLatestSensorValues() {
        return new HashMap<>(latestSensorValues);
    }
}