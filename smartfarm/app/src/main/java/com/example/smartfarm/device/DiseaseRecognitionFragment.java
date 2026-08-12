package com.example.smartfarm.device;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.cardview.widget.CardView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;

import com.example.smartfarm.R;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.FileNotFoundException;
import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

import okhttp3.Call;
import okhttp3.Callback;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;

public class DiseaseRecognitionFragment extends Fragment {

    private static final String TAG = "DiseaseRecognition";
    private static final int REQUEST_CAMERA_PERMISSION = 101;
    private static final int REQUEST_IMAGE_CAPTURE = 102;
    private static final int REQUEST_IMAGE_PICK = 103;
    
    private static final String API_URL = "http://YOUR_SERVER_IP/disease/api/disease/recognize";
    private static final String IMAGES_API_URL = "http://YOUR_SERVER_IP/disease/api/images/stages";
    private static final String IMAGE_API_URL = "http://YOUR_SERVER_IP/disease/api/images/";

    private ImageView ivPlantImage;
    private Button btnTakePhoto;
    private Button btnSelectPhoto;
    private Button btnRecognize;
    private Button btnLoadImages;
    private Button btnStageSeedling;
    private Button btnStageGrow;
    private Button btnStageHarvest;
    private TextView tvResult;
    private TextView tvConfidence;
    private TextView tvSuggestion;
    private TextView tvSymptoms;
    private TextView tvCauses;
    private ProgressBar progressBar;

    private Bitmap selectedImage;
    private List<ImageItem> imageItems = new ArrayList<>();
    private android.app.AlertDialog imageDialog;

    public DiseaseRecognitionFragment() {}

    public static DiseaseRecognitionFragment newInstance(String token) {
        DiseaseRecognitionFragment fragment = new DiseaseRecognitionFragment();
        Bundle args = new Bundle();
        args.putString("USER_TOKEN", token);
        fragment.setArguments(args);
        return fragment;
    }

    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_disease_recognition, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);

        ivPlantImage = view.findViewById(R.id.iv_plant_image);
        btnTakePhoto = view.findViewById(R.id.btn_take_photo);
        btnSelectPhoto = view.findViewById(R.id.btn_select_photo);
        btnRecognize = view.findViewById(R.id.btn_recognize);
        btnLoadImages = view.findViewById(R.id.btn_load_images);
        btnStageSeedling = view.findViewById(R.id.btn_stage_seedling);
        btnStageGrow = view.findViewById(R.id.btn_stage_grow);
        btnStageHarvest = view.findViewById(R.id.btn_stage_harvest);
        tvResult = view.findViewById(R.id.tv_recognition_result);
        tvConfidence = view.findViewById(R.id.tv_confidence);
        tvSuggestion = view.findViewById(R.id.tv_suggestion);
        tvSymptoms = view.findViewById(R.id.tv_symptoms);
        tvCauses = view.findViewById(R.id.tv_causes);
        progressBar = view.findViewById(R.id.progress_bar);

        btnTakePhoto.setOnClickListener(v -> takePhoto());
        btnSelectPhoto.setOnClickListener(v -> showImageSelectionDialog());
        btnRecognize.setOnClickListener(v -> recognizeDisease());
        btnLoadImages.setOnClickListener(v -> loadImagesFromServer());
        
        btnStageSeedling.setOnClickListener(v -> {
            if (imageItems.isEmpty()) {
                loadImagesFromServerForStage("seedling", "育苗期");
            } else {
                showStageImagesDialog("seedling", "育苗期");
            }
        });
        btnStageGrow.setOnClickListener(v -> {
            if (imageItems.isEmpty()) {
                loadImagesFromServerForStage("grow", "生长期");
            } else {
                showStageImagesDialog("grow", "生长期");
            }
        });
        btnStageHarvest.setOnClickListener(v -> {
            if (imageItems.isEmpty()) {
                loadImagesFromServerForStage("harvest", "收获期");
            } else {
                showStageImagesDialog("harvest", "收获期");
            }
        });

        ivPlantImage.setOnClickListener(v -> {
            if (selectedImage != null) {
                clearSelection();
            }
        });

        loadImagesFromServer();
    }

    private void takePhoto() {
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(requireActivity(),
                    new String[]{Manifest.permission.CAMERA}, REQUEST_CAMERA_PERMISSION);
            return;
        }

        Intent takePictureIntent = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
        if (takePictureIntent.resolveActivity(requireActivity().getPackageManager()) != null) {
            startActivityForResult(takePictureIntent, REQUEST_IMAGE_CAPTURE);
        }
    }

    private void selectPhoto() {
        Intent intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
        intent.setType("image/*");
        startActivityForResult(intent, REQUEST_IMAGE_PICK);
    }

    private void recognizeDisease() {
        if (selectedImage == null) {
            Toast.makeText(requireContext(), "请先选择或拍摄一张植物照片", Toast.LENGTH_SHORT).show();
            return;
        }

        tvResult.setText("识别中...");
        tvConfidence.setText("");
        tvSuggestion.setText("");
        tvSymptoms.setText("");
        tvCauses.setText("");
        progressBar.setVisibility(View.VISIBLE);
        btnRecognize.setEnabled(false);

        sendImageToServer();
    }

    private void sendImageToServer() {
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        Bitmap resizedBitmap = resizeBitmap(selectedImage, 800, 800);
        resizedBitmap.compress(Bitmap.CompressFormat.JPEG, 80, baos);
        byte[] imageBytes = baos.toByteArray();
        String imageBase64 = Base64.encodeToString(imageBytes, Base64.DEFAULT);

        try {
            JSONObject jsonObject = new JSONObject();
            jsonObject.put("image", imageBase64);

            OkHttpClient client = new OkHttpClient.Builder()
                    .connectTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                    .readTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                    .writeTimeout(60, java.util.concurrent.TimeUnit.SECONDS)
                    .build();

            RequestBody body = RequestBody.create(
                    MediaType.parse("application/json; charset=utf-8"),
                    jsonObject.toString()
                        );

            Request request = new Request.Builder()
                    .url(API_URL)
                    .post(body)
                    .build();

            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onFailure(Call call, IOException e) {
                    requireActivity().runOnUiThread(() -> {
                        progressBar.setVisibility(View.GONE);
                        btnRecognize.setEnabled(true);
                        tvResult.setText("识别失败");
                        tvSuggestion.setText("网络连接失败，请检查网络后重试");
                        Log.e(TAG, "Network error", e);
                    });
                }

                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    requireActivity().runOnUiThread(() -> {
                        progressBar.setVisibility(View.GONE);
                        btnRecognize.setEnabled(true);
                    });

                    if (!response.isSuccessful()) {
                        requireActivity().runOnUiThread(() -> {
                            tvResult.setText("识别失败");
                            tvSuggestion.setText("服务器错误: " + response.code());
                        });
                        return;
                    }

                    String responseBody = response.body().string();
                    try {
                        JSONObject jsonResponse = new JSONObject(responseBody);
                        boolean success = jsonResponse.getBoolean("success");

                        if (success) {
                            JSONObject parsedResult = jsonResponse.getJSONObject("parsed_result");
                            String diseaseName = parsedResult.optString("disease_name", "未知");
                            String confidence = parsedResult.optString("confidence", "");
                            String symptoms = parsedResult.optString("symptoms", "");
                            String causes = parsedResult.optString("causes", "");
                            String suggestions = parsedResult.optString("suggestions", "");

                            requireActivity().runOnUiThread(() -> {
                                tvResult.setText("识别结果：" + diseaseName);
                                tvConfidence.setText(confidence);
                                tvSymptoms.setText(symptoms);
                                tvCauses.setText(causes);
                                tvSuggestion.setText(suggestions);
                            });
                        } else {
                            String error = jsonResponse.optString("error", "未知错误");
                            requireActivity().runOnUiThread(() -> {
                                tvResult.setText("识别失败");
                                tvSuggestion.setText(error);
                            });
                        }
                    } catch (JSONException e) {
                        requireActivity().runOnUiThread(() -> {
                            tvResult.setText("识别失败");
                            tvSuggestion.setText("解析结果失败");
                        });
                        Log.e(TAG, "JSON parse error", e);
                    }
                }
            });
        } catch (JSONException e) {
            requireActivity().runOnUiThread(() -> {
                progressBar.setVisibility(View.GONE);
                btnRecognize.setEnabled(true);
                tvResult.setText("识别失败");
                tvSuggestion.setText("数据处理失败");
            });
            Log.e(TAG, "JSON error", e);
        }
    }

    private void loadImagesFromServer() {
        btnLoadImages.setEnabled(false);
        progressBar.setVisibility(View.VISIBLE);

        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build();

        Request request = new Request.Builder()
                .url(IMAGES_API_URL)
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                requireActivity().runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnLoadImages.setEnabled(true);
                    Toast.makeText(requireContext(), "加载图片失败", Toast.LENGTH_SHORT).show();
                });
                Log.e(TAG, "Load images network error", e);
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                requireActivity().runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnLoadImages.setEnabled(true);
                });

                if (!response.isSuccessful()) {
                    requireActivity().runOnUiThread(() -> {
                        Toast.makeText(requireContext(), "服务器错误: " + response.code(), Toast.LENGTH_SHORT).show();
                    });
                    return;
                }

                String responseBody = response.body().string();
                try {
                    JSONObject jsonResponse = new JSONObject(responseBody);
                    if (jsonResponse.getBoolean("success")) {
                        imageItems.clear();
                        JSONObject data = jsonResponse.getJSONObject("data");

                        for (String stage : new String[]{"seedling", "grow", "harvest"}) {
                            if (data.has(stage)) {
                                JSONArray stageImages = data.getJSONArray(stage);
                                for (int i = 0; i < stageImages.length(); i++) {
                                    JSONObject imgObj = stageImages.getJSONObject(i);
                                    ImageItem item = new ImageItem();
                                    item.id = imgObj.getInt("id");
                                    item.filename = imgObj.optString("filename", "");
                                    item.stage = stage;
                                    item.createdAt = imgObj.optString("created_at", "");
                                    imageItems.add(item);
                                }
                            }
                        }

                        requireActivity().runOnUiThread(() -> {
                            displayImages();
                        });
                    }
                } catch (JSONException e) {
                    Log.e(TAG, "JSON parse error", e);
                }
            }

            private void displayImages() {
            }
        });
    }

    private void loadImagesFromServerForStage(String stage, String stageName) {
        progressBar.setVisibility(View.VISIBLE);
        btnStageSeedling.setEnabled(false);
        btnStageGrow.setEnabled(false);
        btnStageHarvest.setEnabled(false);

        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build();

        Request request = new Request.Builder()
                .url(IMAGES_API_URL)
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Load images error", e);
                requireActivity().runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnStageSeedling.setEnabled(true);
                    btnStageGrow.setEnabled(true);
                    btnStageHarvest.setEnabled(true);
                    Toast.makeText(requireContext(), "加载图片失败", Toast.LENGTH_SHORT).show();
                });
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                requireActivity().runOnUiThread(() -> {
                    progressBar.setVisibility(View.GONE);
                    btnStageSeedling.setEnabled(true);
                    btnStageGrow.setEnabled(true);
                    btnStageHarvest.setEnabled(true);
                });

                if (!response.isSuccessful()) {
                    return;
                }

                String responseBody = response.body().string();
                try {
                    JSONObject jsonResponse = new JSONObject(responseBody);
                    if (jsonResponse.getBoolean("success")) {
                        imageItems.clear();
                        JSONObject data = jsonResponse.getJSONObject("data");

                        for (String s : new String[]{"seedling", "grow", "harvest"}) {
                            if (data.has(s)) {
                                JSONArray stageImages = data.getJSONArray(s);
                                for (int i = 0; i < stageImages.length(); i++) {
                                    JSONObject imgObj = stageImages.getJSONObject(i);
                                    ImageItem item = new ImageItem();
                                    item.id = imgObj.getInt("id");
                                    item.filename = imgObj.optString("filename", "");
                                    item.stage = s;
                                    item.createdAt = imgObj.optString("created_at", "");
                                    imageItems.add(item);
                                }
                            }
                        }

                        requireActivity().runOnUiThread(() -> {
                            showStageImagesDialog(stage, stageName);
                        });
                    }
                } catch (JSONException e) {
                    Log.e(TAG, "JSON parse error", e);
                }
            }
        });
    }

    private String formatTime(String timeStr) {
        if (timeStr == null || timeStr.isEmpty()) {
            return "未知时间";
        }
        
        String[] patterns = {
            "EEE, dd MMM yyyy HH:mm:ss z",
            "EEE, dd MMM yyyy HH:mm:ss Z",
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss.SSS",
            "yyyy-MM-dd'T'HH:mm:ssZ"
        };
        
        java.text.SimpleDateFormat outputFormat = new java.text.SimpleDateFormat("yyyy年MM月dd日 HH时mm分ss秒", java.util.Locale.CHINA);
        
        for (String pattern : patterns) {
            try {
                java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat(pattern, java.util.Locale.ENGLISH);
                sdf.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                java.util.Date date = sdf.parse(timeStr);
                outputFormat.setTimeZone(java.util.TimeZone.getTimeZone("UTC"));
                return outputFormat.format(date);
            } catch (java.text.ParseException e) {
                continue;
            }
        }
        
        return timeStr;
    }

    private void loadImageFromServer(int imageId, ImageView imageView) {
        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build();

        Request request = new Request.Builder()
                .url(IMAGE_API_URL + imageId)
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Load image error", e);
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful() && response.body() != null) {
                    byte[] bytes = response.body().bytes();
                    
                    BitmapFactory.Options options = new BitmapFactory.Options();
                    options.inPreferredConfig = Bitmap.Config.ARGB_8888;
                    options.inDither = true;
                    options.inPremultiplied = true;
                    
                    Bitmap bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, options);
                    
                    if (bitmap != null) {
                        bitmap = bitmap.copy(Bitmap.Config.ARGB_8888, true);
                    }

                    Bitmap finalBitmap = bitmap;
                    requireActivity().runOnUiThread(() -> {
                        imageView.setImageBitmap(finalBitmap);
                        imageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
                    });
                }
            }
        });
    }

    private void loadFullImage(int imageId) {
        OkHttpClient client = new OkHttpClient.Builder()
                .connectTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .readTimeout(30, java.util.concurrent.TimeUnit.SECONDS)
                .build();

        Request request = new Request.Builder()
                .url(IMAGE_API_URL + imageId)
                .get()
                .build();

        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Load full image error", e);
            }

            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful() && response.body() != null) {
                    byte[] bytes = response.body().bytes();
                    selectedImage = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                    requireActivity().runOnUiThread(() -> {
                        ivPlantImage.setImageBitmap(selectedImage);
                        clearResult();
                    });
                }
            }
        });
    }

    private Bitmap resizeBitmap(Bitmap bitmap, int maxWidth, int maxHeight) {
        int width = bitmap.getWidth();
        int height = bitmap.getHeight();

        float scale = Math.min((float) maxWidth / width, (float) maxHeight / height);

        int newWidth = Math.round(width * scale);
        int newHeight = Math.round(height * scale);

        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true);
    }

    private void clearSelection() {
        ivPlantImage.setImageResource(R.drawable.ic_plant_placeholder);
        selectedImage = null;
        tvResult.setText("");
        tvConfidence.setText("");
        tvSuggestion.setText("");
        tvSymptoms.setText("");
        tvCauses.setText("");
    }

    private void clearResult() {
        tvResult.setText("");
        tvConfidence.setText("");
        tvSuggestion.setText("");
        tvSymptoms.setText("");
        tvCauses.setText("");
    }

    @Override
    public void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        super.onActivityResult(requestCode, resultCode, data);

        if (resultCode != requireActivity().RESULT_OK) {
            return;
        }

        if (requestCode == REQUEST_IMAGE_CAPTURE) {
            Bundle extras = data.getExtras();
            if (extras != null) {
                selectedImage = (Bitmap) extras.get("data");
                ivPlantImage.setImageBitmap(selectedImage);
                clearResult();
            }
        } else if (requestCode == REQUEST_IMAGE_PICK) {
            Uri imageUri = data.getData();
            if (imageUri != null) {
                try {
                    InputStream inputStream = requireContext().getContentResolver().openInputStream(imageUri);
                    selectedImage = BitmapFactory.decodeStream(inputStream);
                    ivPlantImage.setImageBitmap(selectedImage);
                    clearResult();
                } catch (FileNotFoundException e) {
                    Log.e(TAG, "Failed to load image", e);
                    Toast.makeText(requireContext(), "加载图片失败", Toast.LENGTH_SHORT).show();
                }
            }
        }
    }

    private void showImageSelectionDialog() {
        android.app.AlertDialog.Builder builder = new android.app.AlertDialog.Builder(requireContext());
        builder.setTitle("选择图片来源");
        String[] options = {"📂 从数据库选择", "📁 从相册选择"};
        builder.setItems(options, (dialog, which) -> {
            if (which == 0) {
                loadImagesFromServer();
                Toast.makeText(requireContext(), "请从下方数据库图片中选择", Toast.LENGTH_SHORT).show();
            } else {
                selectPhotoFromAlbum();
            }
        });
        builder.setNegativeButton("取消", null);
        builder.show();
    }

    private void selectPhotoFromAlbum() {
        Intent intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
        intent.setType("image/*");
        startActivityForResult(intent, REQUEST_IMAGE_PICK);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions,
                                           @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQUEST_CAMERA_PERMISSION) {
            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                takePhoto();
            } else {
                Toast.makeText(requireContext(), "需要相机权限才能拍照", Toast.LENGTH_SHORT).show();
            }
        }
    }

    private void showStageImagesDialog(String stage, String stageName) {
        List<ImageItem> filteredItems = new ArrayList<>();
        long sevenDaysAgo = System.currentTimeMillis() - 7 * 24 * 60 * 60 * 1000;
        
        for (ImageItem item : imageItems) {
            if (item.stage.equals(stage)) {
                if (item.createdAt != null && !item.createdAt.isEmpty()) {
                    try {
                        java.text.SimpleDateFormat sdf = new java.text.SimpleDateFormat("yyyy-MM-dd HH:mm:ss");
                        java.util.Date date = sdf.parse(item.createdAt);
                        if (date != null && date.getTime() >= sevenDaysAgo) {
                            filteredItems.add(item);
                        }
                    } catch (java.text.ParseException e) {
                        filteredItems.add(item);
                    }
                } else {
                    filteredItems.add(item);
                }
            }
        }

        if (filteredItems.isEmpty()) {
            Toast.makeText(requireContext(), stageName + "近7天暂无图片", Toast.LENGTH_SHORT).show();
            return;
        }

        android.app.AlertDialog.Builder builder = new android.app.AlertDialog.Builder(requireContext());
        builder.setTitle(stageName);

        ScrollView scrollView = new ScrollView(requireContext());
        LinearLayout contentLayout = new LinearLayout(requireContext());
        contentLayout.setOrientation(LinearLayout.VERTICAL);
        contentLayout.setPadding(16, 16, 16, 16);

        for (ImageItem item : filteredItems) {
            LinearLayout itemLayout = new LinearLayout(requireContext());
            itemLayout.setOrientation(LinearLayout.HORIZONTAL);
            itemLayout.setLayoutParams(new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));
            itemLayout.setPadding(0, 8, 0, 8);

            CardView cardView = new CardView(requireContext());
            LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(100, 100);
            cardParams.setMargins(0, 0, 12, 0);
            cardView.setLayoutParams(cardParams);
            cardView.setRadius(8);
            cardView.setCardElevation(2);

            ImageView imageView = new ImageView(requireContext());
            imageView.setLayoutParams(new ViewGroup.LayoutParams(100, 100));
            imageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
            loadImageFromServer(item.id, imageView);
            cardView.addView(imageView);
            itemLayout.addView(cardView);

            LinearLayout infoLayout = new LinearLayout(requireContext());
            infoLayout.setOrientation(LinearLayout.VERTICAL);
            infoLayout.setLayoutParams(new LinearLayout.LayoutParams(
                    0, ViewGroup.LayoutParams.WRAP_CONTENT, 1));

            TextView filenameText = new TextView(requireContext());
            filenameText.setText(item.filename);
            filenameText.setTextSize(14);
            filenameText.setTextColor(getResources().getColor(android.R.color.black));
            infoLayout.addView(filenameText);

            TextView timeText = new TextView(requireContext());
            timeText.setText("拍摄时间: " + formatTime(item.createdAt));
            timeText.setTextSize(12);
            timeText.setTextColor(getResources().getColor(android.R.color.darker_gray));
            infoLayout.addView(timeText);

            itemLayout.addView(infoLayout);
            contentLayout.addView(itemLayout);

            itemLayout.setClickable(true);
            itemLayout.setOnClickListener(v -> {
                loadFullImage(item.id);
                if (imageDialog != null && imageDialog.isShowing()) {
                    imageDialog.dismiss();
                }
            });
        }

        scrollView.addView(contentLayout);
        builder.setView(scrollView);
        builder.setNegativeButton("关闭", null);

        imageDialog = builder.create();
        imageDialog.show();
    }

    private static class ImageItem {
        int id;
        String filename;
        String stage;
        String createdAt;
    }
}