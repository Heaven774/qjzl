package com.example.smartfarm.device;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AlertDialog;
import androidx.fragment.app.Fragment;

import com.bumptech.glide.Glide;
import com.bumptech.glide.request.target.CustomTarget;
import com.bumptech.glide.request.transition.Transition;
import com.example.smartfarm.R;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.LuminanceSource;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.Result;
import com.google.zxing.common.HybridBinarizer;

import java.nio.IntBuffer;

public class
TraceabilityFragment extends Fragment {

    private ImageView ivQrCode;
    private Button btnGenerateQr;
    private TextView tvTraceInfo;

    public TraceabilityFragment() {}

    public static TraceabilityFragment newInstance(String userToken) {
        TraceabilityFragment fragment = new TraceabilityFragment();
        Bundle args = new Bundle();
        args.putString("user_token", userToken);
        fragment.setArguments(args);
        return fragment;
    }

    // Flask 服务器 IP 和端口
    private static final String QR_CODE_URL = "http://YOUR_SERVER_IP/trace/get_qr";

    // 用于缓存当前加载的 Bitmap，以便识别
    private android.graphics.Bitmap currentQrBitmap;

    @Override
    public View onCreateView(@com.example.smartfarm.device.NonNull LayoutInflater inflater, ViewGroup container, Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_traceability, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        ivQrCode = view.findViewById(R.id.iv_qr_code);
        btnGenerateQr = view.findViewById(R.id.btn_generate_qr);
        tvTraceInfo = view.findViewById(R.id.tv_trace_info);

        btnGenerateQr.setOnClickListener(v -> loadQrCodeFromServer());

        // 设置长按监听
        ivQrCode.setOnLongClickListener(v -> {
            if (currentQrBitmap != null && !currentQrBitmap.isRecycled()) {
                showRecognizeDialog();
            } else {
                Toast.makeText(getContext(), "请先生成二维码", Toast.LENGTH_SHORT).show();
            }
            return true; // 消费长按事件
        });
    }

    private void loadQrCodeFromServer() {
        // 使用 Glide 加载并保存 Bitmap
        Glide.with(this)
                .asBitmap()
                .load(QR_CODE_URL)
                .into(new CustomTarget<android.graphics.Bitmap>() {
                    @Override
                    public void onResourceReady(@NonNull android.graphics.Bitmap resource, @Nullable Transition<? super android.graphics.Bitmap> transition) {
                        currentQrBitmap = resource;
                        ivQrCode.setImageBitmap(resource);
                        tvTraceInfo.setText("扫码即可查看产品全生命周期数据");
                    }

                    @Override
                    public void onLoadCleared(@Nullable android.graphics.drawable.Drawable placeholder) {
                        currentQrBitmap = null;
                    }
                });
    }

    private void showRecognizeDialog() {
        new AlertDialog.Builder(requireContext())
                .setTitle("识别二维码")
                .setMessage("是否识别当前二维码内容？")
                .setPositiveButton("继续识别", (dialog, which) -> recognizeQrCode())
                .setNegativeButton("取消", null)
                .show();
    }

    private void recognizeQrCode() {
        if (currentQrBitmap == null || currentQrBitmap.isRecycled()) {
            Toast.makeText(getContext(), "二维码无效", Toast.LENGTH_SHORT).show();
            return;
        }

        try {
            String result = decodeQRCode(currentQrBitmap);
            if (result != null) {
                // 自动跳转到浏览器
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(result));
                startActivity(intent);
            } else {
                Toast.makeText(getContext(), "无法识别二维码", Toast.LENGTH_SHORT).show();
            }
        } catch (Exception e) {
            Toast.makeText(getContext(), "识别失败: " + e.getMessage(), Toast.LENGTH_SHORT).show();
            e.printStackTrace();
        }
    }

    // 使用 ZXing 从 Bitmap 识别二维码
    private String decodeQRCode(android.graphics.Bitmap bitmap) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();
        int[] pixels = new int[width * height];
        bitmap.getPixels(pixels, 0, width, 0, 0, width, height);

        RGBLuminanceSource source = new RGBLuminanceSource(width, height, pixels);
        BinaryBitmap binaryBitmap = new BinaryBitmap(new HybridBinarizer(source));

        try {
            Result result = new MultiFormatReader().decode(binaryBitmap);
            return result.getText();
        } catch (Exception e) {
            return null;
        }
    }
}