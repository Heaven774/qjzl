package com.example.smartfarm;

import android.app.Dialog;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;

import com.example.smartfarm.device.DeviceMonitorFragment;
import com.example.smartfarm.device.IntegratedControlFragment;
import com.example.smartfarm.device.AIAnalysisFragment;
import com.example.smartfarm.device.DiseaseRecognitionFragment;
import com.example.smartfarm.device.TraceabilityFragment;

public class MainActivity extends AppCompatActivity implements View.OnClickListener {

    // 定义各个按钮和文本视图
    private TextView btnMonitor, btnControl, btnTrace, btnAi, btnDisease;
    private TextView tvSystemStatus;
    private TextView tvAutoMode;
    private ImageButton btnSettings;

    // Fragment 管理器
    private FragmentManager fragmentManager;
    // 当前显示的 Fragment 的标签
    private String currentTag = "";

    // 用户登录 Token
    private String userToken;
    // 集成控制 Fragment 和 设备监控 Fragment 的实例
    private IntegratedControlFragment integratedControlFragment;
    private DeviceMonitorFragment deviceMonitorFragment;
    private AIAnalysisFragment aiAnalysisFragment;
    private DiseaseRecognitionFragment diseaseRecognitionFragment;
    private TraceabilityFragment traceabilityFragment;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        // 设置状态栏透明
        getWindow().setStatusBarColor(getResources().getColor(android.R.color.transparent));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);

        // 从 Intent 中获取登录 Token
        if (getIntent() != null) {
            userToken = getIntent().getStringExtra("USER_TOKEN");
        }
        // 如果 Token 为空，则提示用户重新登录并关闭当前 Activity
        if (userToken == null || userToken.isEmpty()) {
            Toast.makeText(this, "未获取到登录凭证，请重新登录", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        // 初始化系统状态和自动模式的 TextView
        tvSystemStatus = findViewById(R.id.tvSystemStatus);
        tvAutoMode = findViewById(R.id.tvAutoMode);

        // 初始化各个功能按钮
        btnMonitor = findViewById(R.id.btn_monitor);
        btnControl = findViewById(R.id.btn_control);
        btnTrace = findViewById(R.id.btn_trace);
        btnAi = findViewById(R.id.btn_ai);
        btnDisease = findViewById(R.id.btn_disease);
        btnSettings = findViewById(R.id.btn_settings);

        // 设置各个按钮的点击事件监听器
        btnMonitor.setOnClickListener(this);
        btnControl.setOnClickListener(this);
        btnTrace.setOnClickListener(this);
        btnAi.setOnClickListener(this);
        btnDisease.setOnClickListener(this);
        btnSettings.setOnClickListener(v -> showSettingsMenu());

        // 获取 Fragment 管理器实例
        fragmentManager = getSupportFragmentManager();

        // 首次加载时显示设备监控页面，并传递用户 Token
        deviceMonitorFragment = DeviceMonitorFragment.newInstance(userToken);
        switchToFragment(deviceMonitorFragment, "monitor");
        setActiveButton(btnMonitor);

        // 设置初始系统状态为离线和手动模式
        updateSystemStatus(true, false);
    }

    @Override
    public void onClick(View v) {
        int id = v.getId();
        // 根据点击的按钮切换不同的 Fragment，并设置当前活动按钮样式
        if (id == R.id.btn_monitor && !currentTag.equals("monitor")) {
            if (deviceMonitorFragment == null) {
                deviceMonitorFragment = DeviceMonitorFragment.newInstance(userToken);
            }
            switchToFragment(deviceMonitorFragment, "monitor");
            setActiveButton(btnMonitor);
        } else if (id == R.id.btn_control && !currentTag.equals("control")) {
            if (integratedControlFragment == null) {
                integratedControlFragment = IntegratedControlFragment.newInstance(userToken);
            }
            switchToFragment(integratedControlFragment, "control");
            setActiveButton(btnControl);
        } else if (id == R.id.btn_ai && !currentTag.equals("ai")) {
            if (aiAnalysisFragment == null) {
                aiAnalysisFragment = AIAnalysisFragment.newInstance(userToken);
            }
            switchToFragment(aiAnalysisFragment, "ai");
            setActiveButton(btnAi);
        } else if (id == R.id.btn_disease && !currentTag.equals("disease")) {
            if (diseaseRecognitionFragment == null) {
                diseaseRecognitionFragment = DiseaseRecognitionFragment.newInstance(userToken);
            }
            switchToFragment(diseaseRecognitionFragment, "disease");
            setActiveButton(btnDisease);
        } else if (id == R.id.btn_trace && !currentTag.equals("trace")) {
            if (traceabilityFragment == null) {
                traceabilityFragment = TraceabilityFragment.newInstance(userToken);
            }
            switchToFragment(traceabilityFragment, "trace");
            setActiveButton(btnTrace);
        }
    }

    private void switchToFragment(Fragment fragment, String tag) {
        var transaction = fragmentManager.beginTransaction();
        // 如果当前有显示的 Fragment，则隐藏它
        if (!currentTag.isEmpty()) {
            Fragment current = fragmentManager.findFragmentByTag(currentTag);
            if (current != null) {
                transaction.hide(current);
            }
        }
        // 显示目标 Fragment，如果不存在则添加它
        Fragment target = fragmentManager.findFragmentByTag(tag);
        if (target != null) {
            transaction.show(target);
        } else {
            transaction.add(R.id.fl_container, fragment, tag);
        }
        transaction.commitAllowingStateLoss();
        currentTag = tag;
    }

    private void setActiveButton(TextView activeBtn) {
        int defaultColor = 0xFFFFFFFF; // 白色
        // 将所有按钮颜色重置为默认颜色
        btnMonitor.setTextColor(defaultColor);
        btnControl.setTextColor(defaultColor);
        btnTrace.setTextColor(defaultColor);
        btnAi.setTextColor(defaultColor);
        btnDisease.setTextColor(defaultColor);
        // 设置当前活动按钮的颜色
        activeBtn.setTextColor(ContextCompat.getColor(this, R.color.selected_button));
    }

    /**
     * 更新系统状态栏（在线/离线 + 自动/手动）
     */
    public void updateSystemStatus(boolean isOnline, boolean isAutoMode) {
        runOnUiThread(() -> {
            if (isOnline) {
                tvSystemStatus.setText("🎛️ 系统状态: 运行中");
                tvSystemStatus.setTextColor(ContextCompat.getColor(this, R.color.status_online));
            } else {
                tvSystemStatus.setText("🎛️ 系统状态: 已离线");
                tvSystemStatus.setTextColor(ContextCompat.getColor(this, R.color.status_offline));
            }

            if (isAutoMode) {
                tvAutoMode.setText("🤖 模式: 自动");
                tvAutoMode.setTextColor(ContextCompat.getColor(this, R.color.mode_auto));
            } else {
                tvAutoMode.setText("🔄 模式: 手动");
                tvAutoMode.setTextColor(ContextCompat.getColor(this, R.color.mode_manual));
            }
        });
    }

    /**
     * 仅更新控制模式（由 IntegratedControlFragment 调用）
     */
    public void updateControlMode(boolean isAutoMode) {
        runOnUiThread(() -> {
            if (isAutoMode) {
                tvAutoMode.setText("🤖 模式: 自动");
                tvAutoMode.setTextColor(ContextCompat.getColor(this, R.color.mode_auto));
            } else {
                tvAutoMode.setText("🔄 模式: 手动");
                tvAutoMode.setTextColor(ContextCompat.getColor(this, R.color.mode_manual));
            }
        });
    }

    // 提供 Fragment 实例供其他组件调用（可选）
    public DeviceMonitorFragment getDeviceMonitorFragment() {
        return deviceMonitorFragment;
    }

    public IntegratedControlFragment getIntegratedControlFragment() {
        return integratedControlFragment;
    }

    // 弹出设置菜单
    private void showSettingsMenu() {
        Dialog dialog = new Dialog(this, R.style.TransparentDialog);
        dialog.setContentView(R.layout.dialog_settings_menu);
        dialog.setCancelable(true);
        dialog.setCanceledOnTouchOutside(true);

        Window window = dialog.getWindow();
        if (window != null) {
            window.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            window.setGravity(Gravity.END | Gravity.TOP);

            WindowManager.LayoutParams params = window.getAttributes();
            params.width = dpToPx(280);
            params.height = WindowManager.LayoutParams.MATCH_PARENT;
            window.setAttributes(params);
        }

        Button btnLogout = dialog.findViewById(R.id.btn_logout);
        if (btnLogout != null) {
            btnLogout.setOnClickListener(v -> {
                dialog.dismiss();
                logout();
            });
        }

        dialog.show();
    }

    // 退出登录
    private void logout() {
        SharedPreferences prefs = getSharedPreferences("user_prefs", MODE_PRIVATE);
        prefs.edit().remove("saved_token").apply();
        userToken = null;
        Intent intent = new Intent(this, LoginActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        startActivity(intent);
        finish();
    }

    // dp 转 px
    private int dpToPx(int dp) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP,
                dp,
                getResources().getDisplayMetrics()
        );
    }
}