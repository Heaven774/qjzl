package com.example.smartfarm.device;

import android.annotation.SuppressLint;
import android.app.AlertDialog;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.CompoundButton;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;

import com.example.smartfarm.R;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import cn.com.newland.nle_sdk.responseEntity.base.BaseResponseEntity;
import cn.com.newland.nle_sdk.util.NCallBack;
import cn.com.newland.nle_sdk.util.NetWorkBusiness;

public class IntegratedControlFragment extends Fragment {
    // 定义各个开关控件
    @SuppressLint("UseSwitchCompatOrMaterialCode")
    private Switch sw_s_light, sw_s_fan, sw_w_wp,
            sw_d_cv, sw_d_fan, sw_d_drlamp, sw_red_light, sw_buzzer;

    // ===== 新增：顶部控制组件 =====
    private Spinner spnMode, spnTarget;
    private Button btnApply;

    private NetWorkBusiness netWorkBusiness;
    private String token = "";
    public static final String gateway = "1522156";
    private static final String BASE_URL = "http://api.nlecloud.com";

    // 存储传感器值
    private final Map<String, Double> sensorValues = new HashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean isInit = false;
    private boolean isReady = false;

    // 存储待应用的自动状态
    private final Map<String, Boolean> pendingAutoStates = new HashMap<>();

    // === 设备标签定义（与云端一致）===
    private static final String TAG_s_light = "s_light";
    private static final String TAG_s_fan = "s_fan";
    private static final String TAG_w_wp = "w_wp";
    private static final String TAG_d_cv = "d_cv";
    private static final String TAG_d_fan = "d_fan";
    private static final String TAG_d_drlamp = "d_drlamp";
    private static final String TAG_red_light = "red_light";
    private static final String TAG_buzzer = "buzzer";

    // 标签到开关控件的映射
    private final Map<String, Switch> tagToSwitchMap = new HashMap<>();

    // 操作日志列表
    private final List<LogEntry> operationLogs = new ArrayList<>();
    private static final int MAX_LOGS = 500;

    // 自动更新标志
    private boolean isAutoUpdating = false;

    // 上次手动操作时间
    private final Map<String, Long> lastManualOpTime = new HashMap<>();

    // ===== 模式常量 =====
    private static final int MODE_ALL_AREAS = 0;      // 全部区域
    private static final int MODE_AREA_CONTROL = 1;   // 区域控制
    private static final int MODE_ACTUATOR_CONTROL = 2; // 执行器控制

    // ===== 区域常量（带 emoji，与 UI 显示完全一致）=====
    private static final String AREA_SEEDLING = "🌱 幼苗区";
    private static final String AREA_WATER = "💧 蓄水区";
    private static final String AREA_DRYING = "🔥 烘干区";
    private static final String AREA_WARNING = "⚠️ 预警设备";

    // 执行器名称映射
    private static final Map<String, String> ACTUATOR_NAME_TO_TAG = new HashMap<>();
    private static final Map<String, String> ACTUATOR_NAME_TO_DEVICE_NAME = new HashMap<>();

    static {
        ACTUATOR_NAME_TO_TAG.put("💡 幼苗区_补光灯", TAG_s_light);
        ACTUATOR_NAME_TO_DEVICE_NAME.put("💡 幼苗区_补光灯", "幼苗区_补光灯");

        ACTUATOR_NAME_TO_TAG.put("💨 幼苗区_通风扇", TAG_s_fan);
        ACTUATOR_NAME_TO_DEVICE_NAME.put("💨 幼苗区_通风扇", "幼苗区_通风扇");

        ACTUATOR_NAME_TO_TAG.put("🚰 蓄水区_水泵", TAG_w_wp);
        ACTUATOR_NAME_TO_DEVICE_NAME.put("🚰 蓄水区_水泵", "蓄水区_水泵");

        ACTUATOR_NAME_TO_TAG.put("🔄 烘干区_传送带", TAG_d_cv);
        ACTUATOR_NAME_TO_DEVICE_NAME.put("🔄 烘干区_传送带", "烘干区_传送带");

        ACTUATOR_NAME_TO_TAG.put("💨 烘干区_通风扇", TAG_d_fan);
        ACTUATOR_NAME_TO_DEVICE_NAME.put("💨 烘干区_通风扇", "烘干区_通风扇");

        ACTUATOR_NAME_TO_TAG.put("💡 烘干区_烘干灯", TAG_d_drlamp);
        ACTUATOR_NAME_TO_DEVICE_NAME.put("💡 烘干区_烘干灯", "烘干区_烘干灯");

        ACTUATOR_NAME_TO_TAG.put("🚨 预警设备_预警灯", TAG_red_light);
        ACTUATOR_NAME_TO_DEVICE_NAME.put("🚨 预警设备_预警灯", "预警灯");

        ACTUATOR_NAME_TO_TAG.put("🔔 预警设备_蜂鸣器", TAG_buzzer);
        ACTUATOR_NAME_TO_DEVICE_NAME.put("🔔 预警设备_蜂鸣器", "蜂鸣器");
    }

    // 操作日志类
    public static class LogEntry {
        private String deviceId;
        private String deviceName;
        private String dataTag;
        private boolean isOn;
        private String triggerType;
        private long timestamp;

        public LogEntry(String deviceId, String deviceName, String dataTag, boolean isOn, String triggerType, long timestamp) {
            this.deviceId = deviceId;
            this.deviceName = deviceName;
            this.dataTag = dataTag;
            this.isOn = isOn;
            this.triggerType = triggerType;
            this.timestamp = timestamp;
        }

        public String getDeviceName() { return deviceName; }
        public String getTriggerType() { return triggerType; }
        public long getTimestamp() { return timestamp; }

        @Override
        public String toString() {
            return String.format("[%s] %s → %s (%s)",
                    new SimpleDateFormat("MM-dd HH:mm:ss").format(new Date(timestamp)),
                    deviceName,
                    isOn ? "ON" : "OFF",
                    triggerType.equals("manual") ? "手动" : "自动"
            );
        }

        public boolean isOn() {
            return isOn;
        }
    }

    public IntegratedControlFragment() {}

    // 创建 IntegratedControlFragment 实例并传递 Token
    public static IntegratedControlFragment newInstance(String token) {
        IntegratedControlFragment fragment = new IntegratedControlFragment();
        Bundle args = new Bundle();
        args.putString("USER_TOKEN", token);
        fragment.setArguments(args);
        return fragment;
    }

    @Override
    public void onAttach(@NonNull Context context) {
        super.onAttach(context);
        if (getArguments() != null && getArguments().containsKey("USER_TOKEN")) {
            token = getArguments().getString("USER_TOKEN");
        }
    }

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_integrated_control, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        try {
            initViews(view);
            initNetwork();
            setListeners();
            isInit = true;
            applyPendingAutoStates();
            isReady = true;
        } catch (Exception e) {
            Log.e("IntegratedControl", "初始化失败", e);
            showToast("控制面板初始化失败");
        }
    }

    // 初始化视图组件
    private void initViews(View view) {
        // 幼苗区
        sw_s_light = view.findViewById(R.id.sw_s_light);
        sw_s_fan = view.findViewById(R.id.sw_s_fan);

        // 蓄水区
        sw_w_wp = view.findViewById(R.id.sw_w_wp);

        // 烘干区
        sw_d_cv = view.findViewById(R.id.sw_d_cv);
        sw_d_fan = view.findViewById(R.id.sw_d_fan);
        sw_d_drlamp = view.findViewById(R.id.sw_d_drlamp);

        // 预警设备
        sw_red_light = view.findViewById(R.id.sw_red_light);
        sw_buzzer = view.findViewById(R.id.sw_buzzer);

        // ===== 新增：顶部控制组件 =====
        spnMode = view.findViewById(R.id.spinner_mode);
        spnTarget = view.findViewById(R.id.spinner_target);
        btnApply = view.findViewById(R.id.btn_apply);

        // 映射标签到控件
        tagToSwitchMap.put(TAG_s_light, sw_s_light);
        tagToSwitchMap.put(TAG_s_fan, sw_s_fan);
        tagToSwitchMap.put(TAG_w_wp, sw_w_wp);
        tagToSwitchMap.put(TAG_d_cv, sw_d_cv);
        tagToSwitchMap.put(TAG_d_fan, sw_d_fan);
        tagToSwitchMap.put(TAG_d_drlamp, sw_d_drlamp);
        tagToSwitchMap.put(TAG_red_light, sw_red_light);
        tagToSwitchMap.put(TAG_buzzer, sw_buzzer);

        // 初始化 Spinner
        setupSpinners();
    }

    // 设置 Spinner
    private void setupSpinners() {
        String[] modes = {"全部区域", "区域控制", "执行器控制"};
        ArrayAdapter<String> modeAdapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, modes);
        modeAdapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spnMode.setAdapter(modeAdapter);

        // 初始目标：区域控制的选项
        updateTargetSpinner(MODE_AREA_CONTROL);

        spnMode.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                updateTargetSpinner(position);
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
                updateTargetSpinner(MODE_ALL_AREAS);
            }
        });
    }

    // 更新目标 Spinner
    private void updateTargetSpinner(int modePosition) {
        List<String> targets = new ArrayList<>();
        switch (modePosition) {
            case MODE_ALL_AREAS:
                targets.add("（自动应用到所有执行器）");
                break;
            case MODE_AREA_CONTROL:
                targets.add(AREA_SEEDLING);
                targets.add(AREA_WATER);
                targets.add(AREA_DRYING);
                targets.add(AREA_WARNING);
                break;
            case MODE_ACTUATOR_CONTROL:
                // 确保幼苗区补光灯在第一个位置
                String seedlingLight = "💡 幼苗区_补光灯";
                if (ACTUATOR_NAME_TO_TAG.containsKey(seedlingLight)) {
                    targets.add(seedlingLight);
                }
                // 添加其他执行器
                for (String name : ACTUATOR_NAME_TO_TAG.keySet()) {
                    if (!name.equals(seedlingLight)) {
                        targets.add(name);
                    }
                }
                break;
            default:
                targets.add("请选择方式");
        }

        ArrayAdapter<String> adapter = new ArrayAdapter<>(requireContext(),
                android.R.layout.simple_spinner_item, targets);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        spnTarget.setAdapter(adapter);
        spnTarget.setEnabled(modePosition != MODE_ALL_AREAS);
    }

    // 初始化网络业务
    private void initNetwork() {
        if (token != null && !token.isEmpty()) {
            try {
                netWorkBusiness = new NetWorkBusiness(token, BASE_URL);
            } catch (Exception e) {
                Log.e("ControlInit", "NetWorkBusiness 创建失败", e);
                netWorkBusiness = null;
            }
        } else {
            netWorkBusiness = null;
        }
    }

    // 设置监听器
    private void setListeners() {
        if (!isAdded()) return;

        CompoundButton.OnCheckedChangeListener manualListener = (buttonView, isChecked) -> {
            if (isAdded() && !isAutoUpdating) {
                String tag = "";
                String name = "";

                if (buttonView.getId() == R.id.sw_s_light) {
                    tag = TAG_s_light;
                    name = "💡 幼苗区_补光灯";
                } else if (buttonView.getId() == R.id.sw_s_fan) {
                    tag = TAG_s_fan;
                    name = "💨 幼苗区_通风扇";
                } else if (buttonView.getId() == R.id.sw_w_wp) {
                    tag = TAG_w_wp;
                    name = "🚰 蓄水区_水泵";
                } else if (buttonView.getId() == R.id.sw_d_fan) {
                    tag = TAG_d_fan;
                    name = "💨 烘干区_通风扇";
                } else if (buttonView.getId() == R.id.sw_d_cv) {
                    tag = TAG_d_cv;
                    name = "🔄 烘干区_传送带";
                } else if (buttonView.getId() == R.id.sw_d_drlamp) {
                    tag = TAG_d_drlamp;
                    name = "💡 烘干区_烘干灯";
                } else if (buttonView.getId() == R.id.sw_red_light) {
                    tag = TAG_red_light;
                    name = "🚨 预警设备_预警灯";
                } else if (buttonView.getId() == R.id.sw_buzzer) {
                    tag = TAG_buzzer;
                    name = "🔔 预警设备_蜂鸣器";
                }

                lastManualOpTime.put(tag, System.currentTimeMillis());
                sendControlCommand(tag, isChecked, name, "manual");
            }
        };

        // 绑定监听器
        if (sw_s_light != null) sw_s_light.setOnCheckedChangeListener(manualListener);
        if (sw_s_fan != null) sw_s_fan.setOnCheckedChangeListener(manualListener);
        if (sw_w_wp != null) sw_w_wp.setOnCheckedChangeListener(manualListener);
        if (sw_d_fan != null) sw_d_fan.setOnCheckedChangeListener(manualListener);
        if (sw_d_cv != null) sw_d_cv.setOnCheckedChangeListener(manualListener);
        if (sw_d_drlamp != null) sw_d_drlamp.setOnCheckedChangeListener(manualListener);
        if (sw_red_light != null) sw_red_light.setOnCheckedChangeListener(manualListener);
        if (sw_buzzer != null) sw_buzzer.setOnCheckedChangeListener(manualListener);

        // 执行按钮
        btnApply.setOnClickListener(v -> executeBatchControl());
    }

    // 应用待处理的自动状态
    private void applyPendingAutoStates() {
        updateSwitchIfPossible(sw_s_light, TAG_s_light);
        updateSwitchIfPossible(sw_s_fan, TAG_s_fan);
        updateSwitchIfPossible(sw_w_wp, TAG_w_wp);
        updateSwitchIfPossible(sw_d_fan, TAG_d_fan);
        updateSwitchIfPossible(sw_d_cv, TAG_d_cv);
        updateSwitchIfPossible(sw_d_drlamp, TAG_d_drlamp);
        updateSwitchIfPossible(sw_red_light, TAG_red_light);
        updateSwitchIfPossible(sw_buzzer, TAG_buzzer);
        pendingAutoStates.clear();
    }

    // 如果可能，更新开关状态
    private void updateSwitchIfPossible(Switch sw, String tag) {
        if (sw != null && pendingAutoStates.containsKey(tag)) {
            boolean state = pendingAutoStates.get(tag);
            isAutoUpdating = true;
            sw.setChecked(state);
            isAutoUpdating = false;
            lastManualOpTime.put(tag, System.currentTimeMillis());
        }
    }

    // 控制预警灯
    public void controlRedLight(boolean on, String triggerType) {
        if (!isAdded()) return;
        pendingAutoStates.put(TAG_red_light, on);
        if (isReady && sw_red_light != null) {
            isAutoUpdating = true;
            sw_red_light.setChecked(on);
            isAutoUpdating = false;
            lastManualOpTime.put(TAG_red_light, System.currentTimeMillis());
        }
        sendControlCommand(TAG_red_light, on, "预警灯", triggerType);
    }

    // 控制蜂鸣器
    public void controlBuzzer(boolean on, String triggerType) {
        if (!isAdded()) return;
        pendingAutoStates.put(TAG_buzzer, on);
        if (isReady && sw_buzzer != null) {
            isAutoUpdating = true;
            sw_buzzer.setChecked(on);
            isAutoUpdating = false;
            lastManualOpTime.put(TAG_buzzer, System.currentTimeMillis());
        }
        sendControlCommand(TAG_buzzer, on, "蜂鸣器", triggerType);
    }

    // 控制烘干灯
    public void controlDryingLamp(boolean on, String triggerType) {
        if (!isAdded()) return;
        pendingAutoStates.put(TAG_d_drlamp, on);
        if (isReady && sw_d_drlamp != null) {
            isAutoUpdating = true;
            sw_d_drlamp.setChecked(on);
            isAutoUpdating = false;
            lastManualOpTime.put(TAG_d_drlamp, System.currentTimeMillis());
        }
        sendControlCommand(TAG_d_drlamp, on, "烘干灯", triggerType);
    }

    // 控制幼苗区通风扇
    public void controlVentilationSeedling(boolean on, String triggerType) {
        if (!isAdded()) return;
        pendingAutoStates.put(TAG_s_fan, on);
        if (isReady && sw_s_fan != null) {
            isAutoUpdating = true;
            sw_s_fan.setChecked(on);
            isAutoUpdating = false;
            lastManualOpTime.put(TAG_s_fan, System.currentTimeMillis());
        }
        sendControlCommand(TAG_s_fan, on, "幼苗区_通风扇", triggerType);
    }

    // 控制补光灯
    public void controlFillLight(boolean on, String triggerType) {
        if (!isAdded()) return;
        pendingAutoStates.put(TAG_s_light, on);
        if (isReady && sw_s_light != null) {
            isAutoUpdating = true;
            sw_s_light.setChecked(on);
            isAutoUpdating = false;
            lastManualOpTime.put(TAG_s_light, System.currentTimeMillis());
        }
        sendControlCommand(TAG_s_light, on, "幼苗区_补光灯", triggerType);
    }

    // 确保并发送水泵控制命令
    public void ensureAndSendPump(boolean on, String triggerType) {
        if (!isAdded()) return;
        pendingAutoStates.put(TAG_w_wp, on);
        if (isReady && sw_w_wp != null) {
            isAutoUpdating = true;
            sw_w_wp.setChecked(on);
            isAutoUpdating = false;
            lastManualOpTime.put(TAG_w_wp, System.currentTimeMillis());
        }
        sendControlCommand(TAG_w_wp, on, "蓄水区_水泵", triggerType);
    }

    // 确保并发送通风控制命令
    public void ensureAndSendVentilation(boolean on, String triggerType) {
        if (!isAdded()) return;
        pendingAutoStates.put(TAG_d_fan, on);
        if (isReady && sw_d_fan != null) {
            isAutoUpdating = true;
            sw_d_fan.setChecked(on);
            isAutoUpdating = false;
            lastManualOpTime.put(TAG_d_fan, System.currentTimeMillis());
        }
        sendControlCommand(TAG_d_fan, on, "烘干区_通风扇", triggerType);
    }

    // 执行批量控制
    private void executeBatchControl() {
        if (!isAdded() || netWorkBusiness == null) {
            showToast("网络未就绪");
            return;
        }

        int modePosition = spnMode.getSelectedItemPosition();

        new AlertDialog.Builder(requireContext(), R.style.RoundedAlertDialog)
                .setTitle("请选择操作")
                .setItems(new CharSequence[]{"开启", "关闭"}, (dialog, which) -> {
                    boolean turnOn = (which == 0);
                    performControlByMode(modePosition, turnOn);
                })
                .show();
    }

    // 根据模式执行控制
    private void performControlByMode(int modePosition, boolean turnOn) {
        String modeText = turnOn ? "开启" : "关闭";
        String targetText = "";

        switch (modePosition) {
            case MODE_ALL_AREAS:
                controlAllDevices(turnOn);
                targetText = "全部区域";
                break;

            case MODE_AREA_CONTROL:
                String selectedArea = (String) spnTarget.getSelectedItem();
                if (selectedArea == null) {
                    showToast("请选择一个区域");
                    return;
                }
                targetText = selectedArea;

                if (AREA_SEEDLING.equals(selectedArea)) {
                    controlSeedlingArea(turnOn);
                } else if (AREA_WATER.equals(selectedArea)) {
                    controlWaterArea(turnOn);
                } else if (AREA_DRYING.equals(selectedArea)) {
                    controlDryingArea(turnOn);
                } else if (AREA_WARNING.equals(selectedArea)) {
                    controlWarningDevice(turnOn);
                } else {
                    showToast("未知区域: " + selectedArea);
                    return;
                }
                break;

            case MODE_ACTUATOR_CONTROL:
                String selectedActuator = (String) spnTarget.getSelectedItem();
                if (selectedActuator == null) {
                    showToast("请选择一个执行器");
                    return;
                }
                targetText = selectedActuator;
                String tag = ACTUATOR_NAME_TO_TAG.get(selectedActuator);
                String deviceName = ACTUATOR_NAME_TO_DEVICE_NAME.get(selectedActuator);
                if (tag != null && deviceName != null) {
                    sendControlCommand(tag, turnOn, deviceName, "manual");
                    Switch sw = tagToSwitchMap.get(tag);
                    if (sw != null) {
                        updateLocalSwitch(sw, turnOn);
                    }
                } else {
                    showToast("未知执行器: " + selectedActuator);
                    return;
                }
                break;

            default:
                showToast("未知模式");
                return;
        }

        showBottomToast("已" + modeText + "【" + targetText + "】");
    }

    // 控制所有设备
    private void controlAllDevices(boolean on) {
        controlSeedlingArea(on);
        controlWaterArea(on);
        controlDryingArea(on);
        controlWarningDevice(on);
    }

    // 控制幼苗区设备
    private void controlSeedlingArea(boolean on) {
        sendControlCommand(TAG_s_light, on, "幼苗区_补光灯", "manual");
        sendControlCommand(TAG_s_fan, on, "幼苗区_通风扇", "manual");
        updateLocalSwitch(sw_s_light, on);
        updateLocalSwitch(sw_s_fan, on);
    }

    // 控制蓄水区设备
    private void controlWaterArea(boolean on) {
        sendControlCommand(TAG_w_wp, on, "蓄水区_水泵", "manual");
        updateLocalSwitch(sw_w_wp, on);
    }

    // 控制烘干区设备
    private void controlDryingArea(boolean on) {
        sendControlCommand(TAG_d_cv, on, "烘干区_传送带", "manual");
        sendControlCommand(TAG_d_fan, on, "烘干区_通风扇", "manual");
        sendControlCommand(TAG_d_drlamp, on, "烘干区_烘干灯", "manual");
        updateLocalSwitch(sw_d_cv, on);
        updateLocalSwitch(sw_d_fan, on);
        updateLocalSwitch(sw_d_drlamp, on);
    }

    // 控制预警设备
    private void controlWarningDevice(boolean on) {
        sendControlCommand(TAG_red_light, on, "预警灯", "manual");
        sendControlCommand(TAG_buzzer, on, "蜂鸣器", "manual");
        updateLocalSwitch(sw_red_light, on);
        updateLocalSwitch(sw_buzzer, on);
    }

    // 更新本地开关状态
    private void updateLocalSwitch(Switch sw, boolean state) {
        if (sw != null) {
            isAutoUpdating = true;
            sw.setChecked(state);
            isAutoUpdating = false;
            String tag = getTagBySwitch(sw);
            if (tag != null) {
                lastManualOpTime.put(tag, System.currentTimeMillis());
            }
        }
    }

    // 根据开关获取标签
    private String getTagBySwitch(Switch sw) {
        for (Map.Entry<String, Switch> entry : tagToSwitchMap.entrySet()) {
            if (entry.getValue() == sw) {
                return entry.getKey();
            }
        }
        return null;
    }

    // 记录操作日志
    private void recordOperationLog(String deviceName, String dataTag, boolean isOn, String triggerType) {
        if (!isAdded()) return;
        LogEntry log = new LogEntry(gateway, deviceName, dataTag, isOn, triggerType, System.currentTimeMillis());
        synchronized (operationLogs) {
            operationLogs.add(log);
            if (operationLogs.size() > MAX_LOGS) {
                operationLogs.remove(0);
            }
        }
    }

    // 发送控制命令
    private void sendControlCommand(String dataTag, boolean on, String deviceName, String triggerType) {
        if (!isAdded() || netWorkBusiness == null) return;

        recordOperationLog(deviceName, dataTag, on, triggerType);
        int value = on ? 1 : 0;
        try {
            netWorkBusiness.control(gateway, dataTag, value,
                    new NCallBack<BaseResponseEntity>(requireContext()) {
                        @Override
                        protected void onResponse(BaseResponseEntity response) {
                            if (!isAdded()) return;
                            if (response.getStatus() != 0) {
                                String msg = response.getMsg() != null ? response.getMsg() : "未知错误";
                                Toast.makeText(requireContext(), deviceName + "失败：" + msg, Toast.LENGTH_SHORT).show();
                            }
                        }
                    });
        } catch (Exception e) {
            Log.e("ControlSend", "控制命令异常", e);
            showToast(deviceName + "控制异常");
        }
    }

    // 显示底部 Toast 消息
    private void showBottomToast(String message) {
        if (!isAdded() || getContext() == null) return;
        Toast toast = Toast.makeText(getContext(), message, Toast.LENGTH_SHORT);
        toast.setGravity(Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL, 0, (int) dpToPx(80));
        toast.show();
    }

    // 将 dp 转换为 px
    private float dpToPx(float dp) {
        return dp * getResources().getDisplayMetrics().density;
    }

    // 显示 Toast 消息
    private void showToast(String msg) {
        if (!isAdded() || getContext() == null) return;
        Toast.makeText(getContext(), msg, Toast.LENGTH_SHORT).show();
    }

    // --- 状态查询 ---

    // 获取幼苗区通风扇状态
    public boolean isVentilationSeedlingOn() {
        return sw_s_fan != null && sw_s_fan.isChecked();
    }

    // 获取幼苗区通风扇预期状态
    public boolean isVentilationSeedlingExpectedOn() {
        Boolean pending = pendingAutoStates.get(TAG_s_fan);
        return pending != null ? pending : isVentilationSeedlingOn();
    }

    // 获取补光灯状态
    public boolean isFillLightOn() {
        return sw_s_light != null && sw_s_light.isChecked();
    }

    // 获取补光灯预期状态
    public boolean isFillLightExpectedOn() {
        Boolean pending = pendingAutoStates.get(TAG_s_light);
        return pending != null ? pending : isFillLightOn();
    }

    // 更新传感器值
    public void updateSensorValue(String tag, double value) {
        if (!isAdded()) return;
        sensorValues.put(tag, value);
    }

    // 获取操作日志
    public List<LogEntry> getOperationLogs() {
        synchronized (operationLogs) {
            return new ArrayList<>(operationLogs);
        }
    }

    // 获取是否准备好
    public boolean isReady() {
        return isReady;
    }

    @Override
    public void onDestroyView() {
        super.onDestroyView();
        isInit = false;
        isReady = false;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isInit = false;
        isReady = false;
    }
}