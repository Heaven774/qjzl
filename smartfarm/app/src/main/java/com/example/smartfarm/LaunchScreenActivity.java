package com.example.smartfarm;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.view.View;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;

public class LaunchScreenActivity extends AppCompatActivity {

    // 定义启动屏幕显示时间（毫秒）
    private static final int DELAY = 3000;
    // 媒体播放器用于播放音频
    private MediaPlayer mediaPlayer;
    // 用户登录 Token
    private String token;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 设置状态栏透明
        getWindow().setStatusBarColor(getResources().getColor(android.R.color.transparent));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        
        setContentView(R.layout.activity_launch_screen);

        // 找到显示标语的 TextView
        TextView tvSlogan = findViewById(R.id.tvSlogan);

        // 构建标语文本
        StringBuilder sb = new StringBuilder();
        sb.append("科\n");
        sb.append("技\n");
        sb.append("赋\n");
        sb.append("能\n");
        sb.append("椒\n");
        sb.append("田 智\n");
        sb.append("    \u200A慧\n");
        sb.append("   \u200A\u200A点\n");
        sb.append("   \u200A亮\n");
        sb.append("  \u200A\u200A农\n");
        sb.append("  \u200A产");
        tvSlogan.setText(sb.toString());

        // 从 Intent 中获取用户 Token
        token = getIntent().getStringExtra("USER_TOKEN");

        // 验证 Token 是否有效，无效则跳回登录页
        if (token == null || token.isEmpty()) {
            Intent loginIntent = new Intent(this, LoginActivity.class);
            loginIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
            startActivity(loginIntent);
            finish();
            return;
        }

        // 播放标语音频
        playSloganAudio();

        // 3秒后跳转到主界面
        tvSlogan.postDelayed(() -> {
            Intent intent = new Intent(LaunchScreenActivity.this, MainActivity.class);
            intent.putExtra("USER_TOKEN", token);
            startActivity(intent);
            finish();
        }, DELAY);
    }

    private void playSloganAudio() {
        try {
            // 创建媒体播放器并播放音频文件（假设音频文件在 res/raw/ 目录下）
            mediaPlayer = MediaPlayer.create(this, R.raw.slogan);
            if (mediaPlayer != null) {
                mediaPlayer.start();
                mediaPlayer.setOnCompletionListener(mp -> {
                    mp.release(); // 播放完成后释放资源
                });
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    @Override
    protected void onDestroy() {
        if (mediaPlayer != null) {
            mediaPlayer.release(); // 释放媒体播放器资源
            mediaPlayer = null;
        }
        super.onDestroy();
    }

    @SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        super.onBackPressed();
    }
}