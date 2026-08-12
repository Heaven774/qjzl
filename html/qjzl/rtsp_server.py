#!/usr/bin/env python3
from flask import Flask, Response, request, send_from_directory, jsonify
from flask_cors import CORS
import os
import time
import threading
import cv2
import numpy as np
import sys
import signal
import requests
from requests.auth import HTTPDigestAuth
import base64

app = Flask(__name__)
CORS(app)

camera_config = {
    'ip': os.environ.get('CAMERA_IP', ''),
    'port': int(os.environ.get('CAMERA_PORT', '80')),
    'username': os.environ.get('CAMERA_USER', ''),
    'password': os.environ.get('CAMERA_PASSWORD', '')
}

# ========== RTSP URL ==========
main_rtsp_url = f"rtsp://{camera_config['username']}:{camera_config['password']}@{camera_config['ip']}:554/stream1"
sub_rtsp_url = f"rtsp://{camera_config['username']}:{camera_config['password']}@{camera_config['ip']}:554/stream2"

current_rtsp_url = main_rtsp_url

cap = None
cap_lock = threading.Lock()
streaming_active = False
stream_thread = None
last_frame = None
frame_lock = threading.Lock()
frame_ready = threading.Event()
active_rtsp_url = current_rtsp_url

# ========== 画质与延迟参数 ==========
JPEG_QUALITY = 75           # 画质提升
FRAME_SKIP = 0              # 不跳帧
BUFFER_SIZE = 1
DISPLAY_WIDTH = 1280
DISPLAY_HEIGHT = 720

# ========== 数字缩放参数 ==========
digital_zoom_level = 1.0    # 1.0 = 原始，最大 3.0
zoom_lock = threading.Lock()
ZOOM_MIN = 1.0
ZOOM_MAX = 3.0


def get_camera():
    """连接摄像头 - OpenCV方式"""
    global cap, active_rtsp_url

    with cap_lock:
        if cap is not None:
            try:
                cap.release()
            except:
                pass
            cap = None

        # 先试主码流
        print(f"[摄像头] 尝试连接主码流...")
        cap = cv2.VideoCapture(main_rtsp_url, cv2.CAP_FFMPEG)
        # RTSP 用 TCP 传输更稳定
        cap.set(cv2.CAP_PROP_BUFFERSIZE, BUFFER_SIZE)
        
        if cap.isOpened():
            # 清空缓冲区
            for _ in range(5):
                cap.read()
            
            ret, test_frame = cap.read()
            if ret and test_frame is not None:
                h, w = test_frame.shape[:2]
                print(f"[摄像头] ✅ 主码流连接成功，分辨率: {w}x{h}")
                print(f"[摄像头]    输出到: {DISPLAY_WIDTH}x{DISPLAY_HEIGHT}")
                active_rtsp_url = main_rtsp_url
                return True

        if cap:
            cap.release()
            cap = None

        # 备选子码流
        print(f"[摄像头] 尝试连接子码流...")
        cap = cv2.VideoCapture(sub_rtsp_url, cv2.CAP_FFMPEG)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, BUFFER_SIZE)
        
        if cap.isOpened():
            for _ in range(5):
                cap.read()
            
            ret, test_frame = cap.read()
            if ret and test_frame is not None:
                h, w = test_frame.shape[:2]
                print(f"[摄像头] ✅ 子码流连接成功，分辨率: {w}x{h}")
                active_rtsp_url = sub_rtsp_url
                return True

        if cap:
            cap.release()
            cap = None

        print("[摄像头] ❌ 连接失败")
        return False


def capture_stream():
    """视频捕获线程"""
    global streaming_active, last_frame, cap
    print("[MJPEG] 开始捕获")
    reconnect_count = 0
    frame_count = 0
    last_fps_time = time.time()
    last_frame_time = time.time()

    while streaming_active:
        try:
            if cap is None or not cap.isOpened():
                reconnect_count += 1
                if reconnect_count > 3:
                    time.sleep(2)
                    reconnect_count = 0

                if not get_camera():
                    time.sleep(1)
                    continue
                reconnect_count = 0

            ret, frame = cap.read()
            if not ret or frame is None:
                time.sleep(0.005)
                continue

            # 统一缩放到显示分辨率（满帧供客户端缩放/拖拽）
            if frame.shape[1] != DISPLAY_WIDTH or frame.shape[0] != DISPLAY_HEIGHT:
                frame = cv2.resize(frame, (DISPLAY_WIDTH, DISPLAY_HEIGHT),
                                  interpolation=cv2.INTER_LINEAR)

            with frame_lock:
                last_frame = frame
                frame_ready.set()

            frame_count += 1

            now = time.time()
            if now - last_fps_time >= 1.0:
                fps = frame_count / (now - last_fps_time)
                total_delay = (now - last_frame_time) * 1000
                print(f"[性能] FPS: {fps:.1f}, 延迟: {total_delay:.0f}ms")
                frame_count = 0
                last_fps_time = now
            last_frame_time = now

        except Exception as e:
            print(f"[MJPEG] 错误: {e}")
            with cap_lock:
                if cap:
                    cap.release()
                    cap = None
            time.sleep(1)


def send_ptz_command(action):
    """发送 PTZ 命令"""
    global current_ptz_action
    url = f"http://{camera_config['ip']}:{camera_config['port']}/onvif/ptz_service"
    auth = HTTPDigestAuth(camera_config['username'], camera_config['password'])
    headers = {'Content-Type': 'application/soap+xml; charset=utf-8'}

    pan, tilt, zoom = 0.0, 0.0, 0.0

    if action == 'up':
        tilt = 0.5
    elif action == 'down':
        tilt = -0.5
    elif action == 'left':
        pan = -0.5
    elif action == 'right':
        pan = 0.5
    elif action == 'stop':
        stop_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
    <s:Body>
        <tptz:Stop>
            <tptz:ProfileToken>PTZNODETOKEN</tptz:ProfileToken>
            <tptz:PanTilt>true</tptz:PanTilt>
            <tptz:Zoom>true</tptz:Zoom>
        </tptz:Stop>
    </s:Body>
</s:Envelope>'''
        try:
            with ptz_lock:
                requests.post(url, data=stop_xml.encode('utf-8'), auth=auth, headers=headers, timeout=1)
                current_ptz_action = None
            return True
        except Exception as e:
            print(f"[PTZ] 停止命令错误: {e}")
            return False

    move_xml = f'''<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://www.w3.org/2003/05/soap-envelope" 
            xmlns:tt="http://www.onvif.org/ver10/schema"
            xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
    <s:Body>
        <tptz:ContinuousMove>
            <tptz:ProfileToken>PTZNODETOKEN</tptz:ProfileToken>
            <tptz:Velocity>
                <tt:PanTilt x="{pan}" y="{tilt}"/>
                <tt:Zoom x="{zoom}"/>
            </tptz:Velocity>
        </tptz:ContinuousMove>
    </s:Body>
</s:Envelope>'''

    try:
        with ptz_lock:
            requests.post(url, data=move_xml.encode('utf-8'), auth=auth, headers=headers, timeout=1)
            current_ptz_action = action
        return True
    except Exception as e:
        print(f"[PTZ] 移动命令错误: {e}")
        return False


current_ptz_action = None
ptz_lock = threading.Lock()

# ========== 数据库服务地址 ==========
DB_SERVER = os.environ.get('DB_SERVER', 'http://localhost:3000')


def save_snapshot_to_db(jpeg_data):
    """将快照保存到数据库（后台线程执行）"""
    try:
        img_base64 = base64.b64encode(jpeg_data).decode('utf-8')
        timestamp = time.strftime("%Y%m%d_%H%M%S")
        resp = requests.post(
            f"{DB_SERVER}/api/pictrue",
            json={
                "image_base64": img_base64,
                "filename": f"snapshot_{timestamp}.jpg"
            },
            timeout=5
        )
        result = resp.json()
        if result.get('success'):
            print(f"[快照] 已保存到数据库, ID: {result['id']}, 大小: {result['filesize']} 字节")
        else:
            print(f"[快照] 保存失败: {result.get('message')}")
    except Exception as e:
        print(f"[快照] 保存到数据库出错: {e}")


@app.route('/')
def index():
    return send_from_directory('.', 'Smart.html')


@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('.', path)


@app.route('/mjpeg')
def mjpeg_stream():
    """MJPEG 视频流"""
    def generate():
        last_send_time = 0
        min_interval = 1.0 / 20.0

        while True:
            try:
                if not frame_ready.wait(timeout=0.05):
                    continue
                frame_ready.clear()

                now = time.time()
                if now - last_send_time < min_interval:
                    continue
                last_send_time = now

                with frame_lock:
                    if last_frame is None:
                        continue
                    frame = last_frame

                ret, jpeg = cv2.imencode('.jpg', frame,
                                        [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
                if ret:
                    yield (b'--frame\r\n'
                           b'Content-Type: image/jpeg\r\n'
                           b'Cache-Control: no-cache, no-store, must-revalidate\r\n'
                           b'Pragma: no-cache\r\n'
                           b'Expires: 0\r\n\r\n' + jpeg.tobytes() + b'\r\n')

            except Exception as e:
                print(f"[Stream] 错误: {e}")
                time.sleep(0.01)

    return Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame',
                   headers={
                       'Cache-Control': 'no-cache, no-store, must-revalidate',
                       'Pragma': 'no-cache',
                       'Expires': '0',
                       'Connection': 'close'
                   })


@app.route('/ptz', methods=['POST'])
def ptz_control():
    try:
        data = request.get_json()
        action = data.get('action')
        send_ptz_command(action)
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/ptz/zoom', methods=['POST'])
def ptz_zoom():
    """数字缩放控制"""
    global digital_zoom_level
    try:
        data = request.get_json()
        zoom_value = float(data.get('value', 1.0))
        with zoom_lock:
            digital_zoom_level = max(ZOOM_MIN, min(ZOOM_MAX, zoom_value))
            current_zoom = digital_zoom_level
        print(f"[数字缩放] 级别: {current_zoom:.1f}x")
        return jsonify({'status': 'success', 'zoom': current_zoom})
    except Exception as e:
        print(f"[数字缩放] 错误: {e}")
        return jsonify({'status': 'error', 'message': str(e)}), 500


@app.route('/ptz/zoom/stop', methods=['POST'])
def ptz_zoom_stop():
    global digital_zoom_level
    with zoom_lock:
        digital_zoom_level = ZOOM_MIN
    print(f"[数字缩放] 重置为 1.0x")
    return jsonify({'status': 'success'})


@app.route('/camera_status')
def camera_status():
    is_connected = cap is not None and cap.isOpened() and last_frame is not None
    return jsonify({
        'connected': is_connected,
        'rtsp_url': active_rtsp_url,
        'zoom': digital_zoom_level
    })


@app.route('/snapshot', methods=['GET', 'POST'])
def snapshot():
    if request.method == 'POST':
        if 'image' in request.files:
            image_file = request.files['image']
            jpeg_bytes = image_file.read()
            threading.Thread(target=save_snapshot_to_db, args=(jpeg_bytes,), daemon=True).start()
            return jsonify({'success': True, 'message': '快照已保存'})
        return jsonify({'error': '未找到图片'}), 400
    
    with frame_lock:
        if last_frame is not None:
            ret, jpeg = cv2.imencode('.jpg', last_frame, [cv2.IMWRITE_JPEG_QUALITY, 95])
            if ret:
                jpeg_bytes = jpeg.tobytes()
                threading.Thread(target=save_snapshot_to_db, args=(jpeg_bytes,), daemon=True).start()
                return Response(jpeg_bytes, mimetype='image/jpeg')
    return jsonify({'error': '无法获取快照'}), 500


def cleanup():
    global streaming_active, stream_thread, cap
    streaming_active = False
    if stream_thread and stream_thread.is_alive():
        stream_thread.join(timeout=2)
    if cap:
        cap.release()


if __name__ == '__main__':
    import atexit
    atexit.register(cleanup)

    def signal_handler(sig, frame):
        print("\n正在关闭...")
        cleanup()
        sys.exit(0)

    signal.signal(signal.SIGINT, signal_handler)

    print("=" * 55)
    print("  摄像头RTSP转MJPEG服务器")
    print("=" * 55)
    print(f"  摄像头: TP-Link TL-IPC43CA")
    print(f"  服务(直连)地址: http://0.0.0.0:8081")
    print("  访问页面(经Apache代理): http://YOUR_SERVER_IP/rtsp")
    print(f"  参数:")
    print(f"    - JPEG质量: {JPEG_QUALITY}")
    print(f"    - 输出分辨率: {DISPLAY_WIDTH}x{DISPLAY_HEIGHT}")
    print("=" * 55)

    if get_camera():
        print("\n✅ 摄像头连接成功\n")
        streaming_active = True
        stream_thread = threading.Thread(target=capture_stream, daemon=True)
        stream_thread.start()
    else:
        print("\n❌ 摄像头连接失败")

    app.run(host='0.0.0.0', port=8081, debug=False, threaded=True)
