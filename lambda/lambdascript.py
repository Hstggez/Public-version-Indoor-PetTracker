import json
import boto3
from datetime import datetime
import urllib.request

EC2_HTTP_ENDPOINT = "http://Redacted:8080/data"

def send_to_ec2(data):
    """Send data to EC2 over HTTP."""
    #EC2_HTTP_ENDPOINT = "http://Redacted:8080/data"
    try:
        req = urllib.request.Request(
            EC2_HTTP_ENDPOINT,
            data=json.dumps(data).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req) as response:
            print(f"Response from EC2: {response.read().decode('utf-8')}")
    except Exception as e:
        print(f"Error sending data to EC2: {e}")


# 初始化 DynamoDB 客户端
dynamodb = boto3.resource('dynamodb', region_name='us-east-2')  # 替换为您的区域
table = dynamodb.Table('WiFiSignalData3')  # 替换为您的 DynamoDB 表名

def lambda_handler(event, context):
    """
    Lambda 函数入口，处理 MQTT 消息并存储到 DynamoDB。
    """
    print("Received event:", json.dumps(event, indent=2))  # 打印事件日志

    try:
        # 直接处理单条消息（如果事件不是数组格式）
        if 'device_id' in event:
            records = [event]  # 单条消息转换为列表
        else:
            records = event.get('Records', [])
        
        # 遍历 MQTT 消息
        for record in records:
            try:
                # 解析消息
                if 'body' in record:
                    payload = json.loads(record['body'])
                else:
                    payload = record
                
                print("Processing payload:", payload)

                device_id = payload.get('device_id')  # 设备 ID
                timestamp = payload.get('timestamp')  # 时间戳 (ISO 格式)
                signal_strength = payload.get('signal_level')  # 信号强度
                
                # 跳过无效消息
                if not all([device_id, timestamp, signal_strength]):
                    print("Skipping invalid payload:", payload)
                    continue

                # 转换时间戳为毫秒（假设原时间戳为 ISO 8601 格式）
                try:
                    timestamp_ms = int(datetime.strptime(timestamp, "%Y-%m-%dT%H:%M:%SZ").timestamp() * 1000)
                except ValueError as ve:
                    print(f"Timestamp conversion error for payload: {payload}, error: {str(ve)}")
                    continue

                # 构建存储项
                item = {
                    'timestamp': str(timestamp_ms),  # 使用毫秒级时间戳
                    'device_id': device_id,
                    'signal_level': signal_strength.split()[0]  # 信号强度保留为字符串
                }
                print(f"Preparing to store item: {item}")

                # 存储到 DynamoDB
                
                response1 = send_to_ec2(item)
                print(f"Forwarded to EC2 response: {response1}")
                response = table.put_item(Item=item)
                print(f"DynamoDB put_item response: {response}")

            
            except Exception as e:
                print(f"Error processing record: {record}, error: {str(e)}")
        
    except Exception as e:
        print(f"Error processing event: {event}, error: {str(e)}")
        raise e

    print("All data successfully processed and stored.")
    return {
        'statusCode': 200,
        'body': json.dumps('Data processed and stored successfully')
    }
