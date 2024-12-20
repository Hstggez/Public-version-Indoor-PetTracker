import subprocess
import json
import time
from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient
import logging  # 用于启用日志

# 启用调试日志
logger = logging.getLogger("AWSIoTPythonSDK.core")
logger.setLevel(logging.DEBUG)
stream_handler = logging.StreamHandler()  # 打印到控制台
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
stream_handler.setFormatter(formatter)
logger.addHandler(stream_handler)

# AWS IoT Core 配置
CLIENT_ID = "raspi-1"  # 替换为您的设备名称
AWS_ENDPOINT = "Redacted.iot.us-east-2.amazonaws.com"  # 替换为您的 AWS IoT Core 端点
ROOT_CA = "./root-CA.crt"  # 根证书路径
PRIVATE_KEY = "./raspi-1.private.key"  # 私钥路径
DEVICE_CERT = "./raspi-1.cert.pem"  # 设备证书路径
MQTT_TOPIC = "wifi/signal_strength"  # 替换为您的 MQTT 主题

# 配置 MQTT 客户端
client = AWSIoTMQTTClient(CLIENT_ID)
client.configureEndpoint(AWS_ENDPOINT, 8883)
client.configureCredentials(ROOT_CA, PRIVATE_KEY, DEVICE_CERT)
client.configureConnectDisconnectTimeout(10)  # 连接超时时间
client.configureMQTTOperationTimeout(5)  # MQTT 操作超时时间

DEVICE_ID = "raspi-1"
# 连接到 AWS IoT Core
try:
    client.connect()
    print("Connected to AWS IoT Core")
except Exception as e:
    print(f"Error connecting to AWS IoT Core: {e}")
    exit(1)

# 函数：扫描 Wi-Fi 并提取 ESSID 为 "zijun" 的数据
def get_wifi_signal_strength(target_essid="Zijun"):
    try:
        # 运行 iwlist 命令获取 Wi-Fi 扫描结果
        result = subprocess.run(["sudo", "iwlist", "wlan0", "scan"], capture_output=True, text=True)
        output = result.stdout

        # 解析扫描结果
        cells = output.split("Cell")
        for cell in cells:
            if f'ESSID:"{target_essid}"' in cell:
                # 提取信号强度 (Signal Level)
                signal_line = next((line for line in cell.split("\n") if "Signal level" in line), None)
                if signal_line:
                    signal_level = signal_line.split("=")[-1].strip()
                    return {"device_id": DEVICE_ID, "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "essid": target_essid, "signal_level": signal_level}
        return None  # 未找到目标 ESSID
    except Exception as e:
        print(f"Error scanning Wi-Fi: {e}")
        return None

# 持续采集并上传数据
try:
    while True:
    
        # 获取信号强度数据
        signal_data = get_wifi_signal_strength("Zijun")
        if signal_data:
            # 发布数据到 AWS IoT Core
            client.publish(MQTT_TOPIC, json.dumps(signal_data), 1)
            print(f"Published data: {signal_data}")
        else:
            print("Target ESSID 'Zijun' not found.")
        
        # 每 10 秒扫描一次
        time.sleep(1)
except KeyboardInterrupt:
    print("Script stopped by user.")
finally:
    client.disconnect()
    print("Disconnected from AWS IoT Core.")
