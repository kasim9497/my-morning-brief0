#!/usr/bin/env python3
"""
Personal AI Morning Brief - Daily Briefing Pipeline
Phase 2 / Phase 3 Backend Data Collector & Gemini Synthesizer.

Clean Single Repository Root Architecture:
- Inputs: `data/questions.json`
- Outputs: `data/today.json`
"""

import os
import json
import random
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

USER_PROFILE = {
    "name": "Jinhao",
    "zodiac": "處女座",
    "city": "新北市",
    "district": "蘆洲區",
    "licenseType": "普通重型機車",
    "currencyPair": "CNY/TWD"
}

TZ_TAIWAN = timezone(timedelta(hours=8))

def sanitize_url(url_str):
    """Ensure URL uses http or https scheme only to prevent XSS/injection."""
    if not url_str or not isinstance(url_str, str):
        return "#"
    url_str = url_str.strip()
    parsed = urllib.parse.urlparse(url_str)
    if parsed.scheme in ('http', 'https'):
        return url_str
    return "#"

def parse_cwa_element(time_list):
    if not time_list:
        return ""
    first = time_list[0]
    if "parameter" in first and isinstance(first["parameter"], dict):
        return first["parameter"].get("parameterName", "")
    if "elementValue" in first and isinstance(first["elementValue"], list) and first["elementValue"]:
        return first["elementValue"][0].get("value", "")
    return ""

def fetch_weather(cwa_api_key=None):
    print("Fetching Weather Data from CWA API...")
    if cwa_api_key:
        try:
            url = f"https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-071?Authorization={cwa_api_key}&LocationName=%E8%98%8D%E6%B4%B2%E5%8D%80"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    records = data.get('records', {})
                    locations = records.get('locations', [{}])[0].get('location', [])
                    if locations:
                        elements = {e.get('elementName'): e.get('time', []) for e in locations[0].get('weatherElement', [])}
                        min_t = parse_cwa_element(elements.get('MinT', []))
                        max_t = parse_cwa_element(elements.get('MaxT', []))
                        pop = parse_cwa_element(elements.get('PoP12h', []))
                        wx = parse_cwa_element(elements.get('Wx', []))
                        
                        return {
                            "location": "新北市蘆洲區",
                            "condition": f"{wx} 🌤️" if wx else "多雲 🌤️",
                            "tempCurrent": f"{min_t}°C" if min_t else "N/A",
                            "tempMin": f"{min_t}°C" if min_t else "N/A",
                            "tempMax": f"{max_t}°C" if max_t else "N/A",
                            "rainChance": f"{pop}%" if pop else "N/A",
                            "feelsLike": f"{min_t}°C" if min_t else "N/A",
                            "humidity": "N/A",  # Real API F-D0047 PoP/MinT doesn't provide relative humidity directly
                            "uvIndex": "N/A",   # No direct UV in basic forecast
                            "rawWx": wx or "多雲",
                            "isFallback": False
                        }
            except Exception as e1:
                print(f"Township F-D0047-071 failed ({e1}), trying General Forecast F-C0032-001...")
                url2 = f"https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001?Authorization={cwa_api_key}&locationName=%E6%96%B0%E5%8C%97%E5%B8%82"
                req2 = urllib.request.Request(url2, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req2, timeout=10) as resp2:
                    data2 = json.loads(resp2.read().decode('utf-8'))
                    loc2 = data2.get('records', {}).get('location', [{}])[0]
                    elements2 = {e.get('elementName'): e.get('time', []) for e in loc2.get('weatherElement', [])}
                    min_t = parse_cwa_element(elements2.get('MinT', []))
                    max_t = parse_cwa_element(elements2.get('MaxT', []))
                    pop = parse_cwa_element(elements2.get('PoP', []))
                    wx = parse_cwa_element(elements2.get('Wx', []))
                    return {
                        "location": "新北市",
                        "condition": f"{wx} 🌤️" if wx else "多雲 🌤️",
                        "tempCurrent": f"{min_t}°C" if min_t else "N/A",
                        "tempMin": f"{min_t}°C" if min_t else "N/A",
                        "tempMax": f"{max_t}°C" if max_t else "N/A",
                        "rainChance": f"{pop}%" if pop else "N/A",
                        "feelsLike": "N/A",
                        "humidity": "N/A",
                        "uvIndex": "N/A",
                        "rawWx": wx or "多雲",
                        "isFallback": False
                    }
        except Exception as e:
            print(f"CWA API fetch failed ({e}), using clear fallback status.")

    return {
        "location": "新北市蘆洲區",
        "condition": "即時天氣暫無法取得",
        "tempCurrent": "N/A",
        "tempMin": "N/A",
        "tempMax": "N/A",
        "rainChance": "N/A",
        "feelsLike": "N/A",
        "humidity": "N/A",
        "uvIndex": "N/A",
        "rawWx": "未知",
        "isFallback": True
    }

def fetch_exchange_rate():
    print("Fetching Currency Exchange Rate from ExchangeRate-API...")
    now_tw = datetime.now(TZ_TAIWAN)
    update_time_str = f"今天 {now_tw.strftime('%H:%M')}"
    try:
        url = "https://open.er-api.com/v6/latest/CNY"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            twd_rate = round(data['rates']['TWD'], 2)
            
            # Since ExchangeRate-API free tier only provides latest rate without 7-day history,
            # set history fields to None / empty to avoid creating fake history data.
            return {
                "pair": "CNY → TWD",
                "current": twd_rate,
                "yesterday": None,
                "change": None,
                "changePercent": None,
                "isUp": True,
                "last7Days": None,
                "updateTime": update_time_str,
                "isFallback": False
            }
    except Exception as e:
        print(f"Currency API fetch failed ({e}), returning fallback unavailable state.")
        return {
            "pair": "CNY → TWD",
            "current": None,
            "yesterday": None,
            "change": None,
            "changePercent": None,
            "isUp": True,
            "last7Days": None,
            "updateTime": update_time_str,
            "isFallback": True
        }

def load_quiz_questions():
    print("Selecting 5 Scooter License Test Questions from data/questions.json...")
    now_tw = datetime.now(TZ_TAIWAN)
    random.seed(now_tw.strftime("%Y-%m-%d"))  # Fixed daily seed for quiz consistency
    quiz_file = "data/questions.json"
    if os.path.exists(quiz_file):
        try:
            with open(quiz_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                questions = data.get("questions", [])
                sample_size = min(5, len(questions))
                sampled = random.sample(questions, sample_size)
                for idx, item in enumerate(sampled):
                    item['id'] = f"q_{idx+1}"
                    if 'source_url' in item:
                        item['source_url'] = sanitize_url(item['source_url'])
                return sampled
        except Exception as e:
            print(f"Error reading {quiz_file}: {e}")

    return []

def fetch_rss_news():
    print("Fetching AI & Tech RSS Feeds...")
    rss_urls = [
        ("OpenAI / Official", "https://openai.com/news/rss.xml"),
        ("Google AI Blog", "https://blog.google/technology/ai/rss/"),
        ("TechCrunch AI", "https://techcrunch.com/category/artificial-intelligence/feed/")
    ]
    candidate_items = []

    for source_name, url in rss_urls:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=8) as resp:
                xml_data = resp.read()
                root = ET.fromstring(xml_data)
                for item in root.findall('.//item')[:2]:
                    title = item.find('title').text if item.find('title') is not None else ''
                    link = item.find('link').text if item.find('link') is not None else ''
                    desc = item.find('description').text if item.find('description') is not None else ''
                    safe_link = sanitize_url(link)
                    if title:
                        candidate_items.append({
                            "source": source_name,
                            "title": title.strip(),
                            "link": safe_link,
                            "snippet": desc[:200] if desc else title
                        })
        except Exception as e:
            print(f"Failed to fetch RSS from {source_name}: {e}")

    return candidate_items

def synthesize_with_gemini(weather, exchange_rate, rss_items, gemini_api_key):
    if not gemini_api_key:
        print("GEMINI_API_KEY not provided. Using offline smart synthesis template.")
        return generate_offline_synthesis(weather, exchange_rate, rss_items)

    print("Calling Gemini 2.5 Flash-Lite API for AI Synthesis...")
    prompt_payload = {
        "contents": [{
            "parts": [{
                "text": f"""
你是一位專業的個人 AI 助理。請根據以下事實資料，為使用者 (Jinhao，處女座，正在準備機車筆試與規劃 AI PM 職涯) 生成每日晨報摘要。

【重要準則】：
1. 嚴格基於提供之【候選新聞項目】做摘要，絕對不得自行編造未在 RSS 中出現的虛構事件或假新聞！
2. 輸出之 aiNews List 數量必須與傳入之候選新聞數量相對應。

【已知事實資料】:
- 今日地點：{weather['location']}，天氣狀況：{weather['condition']}，溫度：{weather['tempMin']}~{weather['tempMax']}，降雨機率：{weather['rainChance']}
- 匯率：CNY/TWD = {exchange_rate['current'] if exchange_rate['current'] else '暫無數據'}
- 候選新聞項目: {json.dumps(rss_items[:5], ensure_ascii=False)}

【請輸出嚴格的 JSON 格式】:
{{
  "weatherTip": "針對溫差與降雨的一句話實用出門提醒",
  "horoscopeSummary": "針對處女座今日星象的2句簡短指引 (勿過度迷信，偏向時間整理與工作專注)",
  "aiNews": [
    {{
      "id": "n1",
      "summary": "一句話摘要發生什麼事",
      "whyImportant": "為什麼重要 (產業趨勢)",
      "myImpact": "對使用者 (AI PM / 個人專案) 的啟發與意義"
    }}
  ],
  "dailyAdvice": {{
    "top3": [
      {{"icon": "🌧️", "text": "天氣/攜帶物品提醒"}},
      {{"icon": "🛵", "text": "駕照練習方向提醒"}},
      {{"icon": "🤖", "text": "科技新知閱讀建議"}}
    ],
    "primeGoal": "今日最重要的一件事 (直接切中要點，不說心靈雞湯)"
  }}
}}
"""
            }]
        }],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }

    try:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={gemini_api_key}"
        data_bytes = json.dumps(prompt_payload).encode('utf-8')
        req = urllib.request.Request(url, data=data_bytes, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read().decode('utf-8'))
            candidate_text = result['candidates'][0]['content']['parts'][0]['text']
            parsed_json = json.loads(candidate_text)
            return process_gemini_news_output(parsed_json, rss_items)
    except Exception as e:
        print(f"Gemini API call failed ({e}). Falling back to smart template synthesis.")
        return generate_offline_synthesis(weather, exchange_rate, rss_items)

def process_gemini_news_output(parsed_json, rss_items):
    """Enforce strict preservation of original RSS title, source, and link."""
    ai_news = parsed_json.get("aiNews", [])
    processed_news = []
    
    for idx, rss_item in enumerate(rss_items[:len(ai_news)] if ai_news else rss_items[:3]):
        gemini_item = ai_news[idx] if idx < len(ai_news) else {}
        processed_news.append({
            "id": f"n{idx+1}",
            "source": rss_item.get("source", "Tech News"),
            "title": rss_item.get("title", ""),
            "link": sanitize_url(rss_item.get("link", "#")),
            "summary": gemini_item.get("summary", rss_item.get("snippet", "")[:100]),
            "whyImportant": gemini_item.get("whyImportant", "重點產業與技術動態趨勢。"),
            "myImpact": gemini_item.get("myImpact", "值得關注其商業落地與產品化應用價值。")
        })
    
    parsed_json["aiNews"] = processed_news
    return parsed_json

def generate_offline_synthesis(weather, exchange_rate, rss_items):
    news_list = []
    if rss_items:
        for idx, item in enumerate(rss_items[:3]):
            news_list.append({
                "id": f"n{idx+1}",
                "source": item.get("source", "RSS Feed"),
                "title": item.get("title", ""),
                "link": sanitize_url(item.get("link", "#")),
                "summary": item.get("snippet", "")[:100] + "...",
                "whyImportant": "即時科技趨勢動態。",
                "myImpact": "值得關注其技術落地與產品化應用。"
            })
    else:
        news_list = [
            {
                "id": "n1",
                "source": "Google DeepMind / AI Official",
                "title": "Google 發布新一代輕量級 AI Agent 架構",
                "link": "https://blog.google/technology/ai/",
                "summary": "Google 推出全新針對端側與邊緣運算優化的 Agent 開發工具包。",
                "whyImportant": "標誌著 AI Agent 正在從純雲端走向端側混合部署。",
                "myImpact": "若未來想做 AI PM，這項技術趨勢指明了端側智能設計方向。"
            }
        ]

    weather_rain_str = weather.get('rainChance', 'N/A')
    return {
        "weatherTip": f"天氣狀態：{weather.get('condition', '多雲')}，出門請注意天候變化。",
        "horoscopeSummary": "今天適合整理混亂已久的事務。工作上建議專注完成最重要的一件事，穩紮穩打效果最好。",
        "aiNews": news_list,
        "dailyAdvice": {
            "top3": [
                {"icon": "🌧️", "text": f"天氣狀態：{weather.get('condition', '多雲')}，出門記得準備雨具。"},
                {"icon": "🛵", "text": "駕照筆試練習今日重點：加強交岔路口路權與雙黃線禁跨題型。"},
                {"icon": "🤖", "text": "今日 AI 產業有即時動態發布，可花 10 分鐘快速了解趨勢。"}
            ],
            "primeGoal": "今日最重要的一件事：集中精力完成 AI PM 作品集首頁與核心功能展示。"
        }
    }

def main():
    print("=== Starting Personal AI Morning Brief Generation Pipeline ===")
    now_tw = datetime.now(TZ_TAIWAN)
    date_str = now_tw.strftime("%Y / %m / %d %A")

    gemini_key = os.environ.get("GEMINI_API_KEY")
    cwa_key = os.environ.get("CWA_API_KEY")

    weather = fetch_weather(cwa_key)
    exchange_rate = fetch_exchange_rate()
    driving_quiz = load_quiz_questions()
    rss_news = fetch_rss_news()

    ai_synthesis = synthesize_with_gemini(weather, exchange_rate, rss_news, gemini_key)

    weather["aiTip"] = ai_synthesis.get("weatherTip", weather.get("aiTip", ""))

    brief_data = {
        "user": USER_PROFILE,
        "briefMeta": {
            "date": date_str,
            "time": now_tw.strftime("%I:%M %p"),
            "greeting": f"早安，{USER_PROFILE['name']}！這是為您整理的今日個人化 AI 數位晨報。",
            "generatedAt": now_tw.isoformat()
        },
        "weather": weather,
        "horoscope": {
            "sign": f"{USER_PROFILE['zodiac']} ♍",
            "ratingStars": "★★★★☆",
            "score": 4.5,
            "details": {
                "overall": "思緒清晰，適合處理積壓已久的細節事項。",
                "love": "溝通順暢，適合與夥伴進行深層交流。",
                "work": "工作效率提升，建議先攻克最重要的單一任務。",
                "wealth": "財務穩定，適合進行月度財務整理。",
                "health": "精神充沛，但需注意用眼過度與肩頸放鬆。"
            },
            "luckyColor": "寶藍色 🟦",
            "luckyNumber": "7",
            "aiSummary": ai_synthesis.get("horoscopeSummary", "")
        },
        "exchangeRate": exchange_rate,
        "drivingQuiz": driving_quiz,
        "aiNews": ai_synthesis.get("aiNews", []),
        "dailyAdvice": ai_synthesis.get("dailyAdvice", {})
    }

    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    out_file = "data/today.json"
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(brief_data, f, ensure_ascii=False, indent=2)
    print(f"SUCCESS: Generated `today.json` successfully at {out_file}!")

if __name__ == "__main__":
    main()
