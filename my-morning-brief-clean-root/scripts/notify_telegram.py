#!/usr/bin/env python3
"""
Telegram Bot Daily Push Notification Script
Sends a concise summary + link to the user's GitHub Pages Morning Brief.
"""

import os
import json
import urllib.request

def send_telegram_message(bot_token, chat_id, message_text):
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": message_text,
        "parse_mode": "Markdown"
    }
    data_bytes = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data_bytes, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read().decode('utf-8'))

def main():
    bot_token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat_id = os.environ.get("TELEGRAM_CHAT_ID")

    if not bot_token or not chat_id:
        print("Telegram secrets not configured. Skipping notification.")
        return

    today_json_path = os.path.join(os.path.dirname(__file__), '../today.json')
    if not os.path.exists(today_json_path):
        print("today.json not found. Skipping notification.")
        return

    with open(today_json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    meta = data.get("briefMeta", {})
    weather = data.get("weather", {})
    rate = data.get("exchangeRate", {})
    advice = data.get("dailyAdvice", {})

    msg = f"""
☀️ *您的今日 AI 數位晨報已準備完成！*
📅 日期：{meta.get('date', '')}

🌤 *天氣預報 (蘆洲區)*：{weather.get('condition', '')} ({weather.get('tempMin')} ~ {weather.get('tempMax')})
💰 *人民幣匯率*：1 CNY ≈ {rate.get('current')} TWD
🎯 *今日核心目標*：
_{advice.get('primeGoal', '')}_

👉 [打開觀看完整晨報 Dashboard](https://your-username.github.io/my-morning-brief/)
"""

    print("Sending notification via Telegram Bot...")
    res = send_telegram_message(bot_token, chat_id, msg)
    print("Telegram Notification Result:", res.get("ok"))

if __name__ == "__main__":
    main()
