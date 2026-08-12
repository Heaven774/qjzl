package com.example.smartfarm;

import androidx.appcompat.app.AppCompatActivity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.view.View;
import android.widget.Toast;
import com.example.smartfarm.databinding.ActivityLoginBinding;
import cn.com.newland.nle_sdk.requestEntity.SignIn;
import cn.com.newland.nle_sdk.responseEntity.User;
import cn.com.newland.nle_sdk.responseEntity.base.BaseResponseEntity;
import cn.com.newland.nle_sdk.util.NCallBack;
import cn.com.newland.nle_sdk.util.NetWorkBusiness;
import retrofit2.Call;

public class LoginActivity extends AppCompatActivity {
    // 使用 Data Binding 绑定布局
    private ActivityLoginBinding binding;
    // 网络业务处理对象
    private NetWorkBusiness netWorkBusiness;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        
        // 设置状态栏透明
        getWindow().setStatusBarColor(getResources().getColor(android.R.color.transparent));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        
        // 获取 SharedPreferences 实例以检查是否已保存 Token
        SharedPreferences prefs = getSharedPreferences("user_prefs", MODE_PRIVATE);
        String savedToken = prefs.getString("saved_token", "").trim();

        // 如果已保存 Token，则直接跳转到启动屏幕
        if (!savedToken.isEmpty()) {
            Intent intent = new Intent(LoginActivity.this, LaunchScreenActivity.class);
            intent.putExtra("USER_TOKEN", savedToken);
            startActivity(intent);
            finish();
            return;
        }

        // 使用 Data Binding 绑定布局
        binding = ActivityLoginBinding.inflate(getLayoutInflater());
        setContentView(binding.getRoot());

        // 设置登录按钮的点击事件监听器
        binding.btnLogin.setOnClickListener(v -> doLogin());
    }

    private void doLogin() {
        // 获取用户名和密码输入框中的内容
        String username = binding.etUsername.getText().toString().trim();
        String password = binding.etPassword.getText().toString().trim();

        // 检查用户名和密码是否为空
        if (username.isEmpty() || password.isEmpty()) {
            Toast.makeText(this, "账号或密码不能为空", Toast.LENGTH_SHORT).show();
            return;
        }

        // 禁用登录按钮并显示正在登录的提示
        binding.btnLogin.setEnabled(false);
        Toast.makeText(this, "正在登录...", Toast.LENGTH_SHORT).show();

        // 创建 NetWorkBusiness 实例并进行登录请求
        netWorkBusiness = new NetWorkBusiness("", "https://api.nlecloud.com");
        netWorkBusiness.signIn(new SignIn(username, password), new NCallBack<>(this) {
            @Override
            protected void onResponse(BaseResponseEntity<User> response) {
                runOnUiThread(() -> binding.btnLogin.setEnabled(true)); // 重新启用登录按钮
                if (response.getStatus() == 0 && response.getResultObj() != null) {
                    String token = response.getResultObj().getAccessToken();
                    SharedPreferences prefs = getSharedPreferences("user_prefs", MODE_PRIVATE);
                    prefs.edit().putString("saved_token", token).apply(); // 保存 Token

                    Toast.makeText(LoginActivity.this, "登录成功", Toast.LENGTH_SHORT).show();

                    // 如果 Activity 未被销毁，则跳转到启动屏幕
                    if (!isFinishing()) {
                        Intent intent = new Intent(LoginActivity.this, LaunchScreenActivity.class);
                        intent.putExtra("USER_TOKEN", token);
                        startActivity(intent);
                        finish();
                    }
                } else {
                    Toast.makeText(LoginActivity.this, "登录失败：" + response.getMsg(), Toast.LENGTH_SHORT).show();
                }
            }

            @Override
            public void onFailure(Call call, Throwable t) {
                super.onFailure(call, t);
                runOnUiThread(() -> {
                    binding.btnLogin.setEnabled(true); // 重新启用登录按钮
                    Toast.makeText(LoginActivity.this, "网络错误：" + t.getMessage(), Toast.LENGTH_SHORT).show();
                });
            }
        });
    }
}