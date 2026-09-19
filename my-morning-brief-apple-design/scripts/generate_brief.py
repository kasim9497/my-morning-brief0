#!/usr/bin/env python3
"""
Personal AI Morning Brief - Daily Briefing Pipeline
Phase 2 / Phase 3 Backend Data Collector & Gemini Synthesizer.

Clean Single Repository Root Architecture:
- Inputs: `data/questions.json`
- Outputs: `data/today.json`
"""

import os
import re
import json
import gzip
import random
import html as html_module
import urllib.request
import urllib.parse
import urllib.error
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

def strip_html(raw: str) -> str:
    """Remove all HTML tags and decode HTML entities from a string.
    Does NOT require BeautifulSoup — uses stdlib re + html.unescape only.
    Handles both direct HTML and HTML-entity-encoded HTML (double-encoded).
    """
    if not raw or not isinstance(raw, str):
        return ""
    # Step 1: Unescape entities first (&lt;img&gt; → <img>)
    text = html_module.unescape(raw)
    # Step 2: Remove <script>...</script> and <style>...</style> blocks
    text = re.sub(r'<(script|style)[^>]*>.*?</\1>', '', text, flags=re.DOTALL | re.IGNORECASE)
    # Step 3: Remove all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Step 4: Unescape any remaining entities (e.g. &amp; &nbsp;)
    text = html_module.unescape(text)
    # Step 5: Collapse whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text

QWEATHER_LOCATION_ID = "101190112"  # 南京市栖霞區（涵蓋仙林大學城，比市中心資料更準）

def _qweather_request(api_host, path, api_key):
    url = f"https://{api_host}{path}"
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0',
        'X-QW-Api-Key': api_key
    })
    with urllib.request.urlopen(req, timeout=10) as resp:
        raw = resp.read()
        if resp.headers.get('Content-Encoding') == 'gzip':
            raw = gzip.decompress(raw)
        return json.loads(raw.decode('utf-8'))

def fetch_weather(qweather_api_key=None, qweather_api_host=None):
    print("Fetching Weather Data from QWeather API (Nanjing)...")
    if qweather_api_key and qweather_api_host:
        try:
            now_data = _qweather_request(qweather_api_host, f"/v7/weather/now?location={QWEATHER_LOCATION_ID}", qweather_api_key)
            now = now_data.get('now', {})

            temp_min, temp_max, rain_chance, uv_index = "N/A", "N/A", "N/A", "N/A"
            try:
                forecast_data = _qweather_request(qweather_api_host, f"/v7/weather/3d?location={QWEATHER_LOCATION_ID}", qweather_api_key)
                today_forecast = (forecast_data.get('daily') or [{}])[0]
                temp_min = f"{today_forecast.get('tempMin', 'N/A')}°C"
                temp_max = f"{today_forecast.get('tempMax', 'N/A')}°C"
                rain_chance = f"{today_forecast.get('precip', 'N/A')}mm"
                uv_index = today_forecast.get('uvIndex', 'N/A')
            except Exception as e_forecast:
                print(f"QWeather 3-day forecast fetch failed ({e_forecast}), leaving forecast fields as N/A.")

            return {
                "location": "南京市栖霞區",
                "condition": now.get('text', '多雲'),
                "tempCurrent": f"{now.get('temp', 'N/A')}°C",
                "tempMin": temp_min,
                "tempMax": temp_max,
                "rainChance": rain_chance,
                "feelsLike": f"{now.get('feelsLike', 'N/A')}°C",
                "humidity": f"{now.get('humidity', 'N/A')}%",
                "uvIndex": uv_index,
                "rawWx": now.get('text', '多雲'),
                "isFallback": False
            }
        except Exception as e:
            print(f"QWeather API fetch failed ({e}), using fallback.")
    return {
        "location": "南京市栖霞區",
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

USER_PROFILE = {
    "name": "Kasim",
    "zodiac": "處女座",
    "city": "南京市",
    "district": "栖霞區",
    "licenseType": "普通重型機車",
    "currencyPair": "CNY/TWD"
}

# 使用者真實命盤重點（融合西洋占星、八字、紫微斗數三套系統整理出的穩定個性特質，
# 不是每日星象演算——免費工具做不到真正的每日行運計算，這份摘要是拿來讓 Gemini
# 寫出「有憑有據」的解讀，取代原本純套處女座罐頭文字的做法）
BIRTH_CHART_SUMMARY = """
出生：2005年9月7日，男性
西洋占星：太陽處女座在第二宮（務實、重視實際能力，自我價值感建立在具體產出上）；
上升巨蟹（外在溫和、顧家、給人安全感）；月亮/金星/木星三合在天秤座（人緣佳、重和諧、
審美好，但容易迴避衝突）；太陽刑冥王星、對沖天王星（內心有不安於現狀的衝動，穩定期
容易突然想打破常規）；上升對沖凱龍在第七宮（親密關係是需要花力氣練習的課題，容易自我
懷疑，但也有潛力成為很懂得安慰他人的人）
八字：日主甲木，四柱幾乎缺水（印星弱，較少依賴他人支持，習慣自己扛）；日支坐傷官
（表達欲強、有創造力，但對權威/常規容易反骨）；目前走壬午大運（2025-2034，開始補到
印星/貴人運，比之前更容易遇到願意提拔的人，適合主動找導師）
紫微斗數：命宮空宮坐申（性格隨環境而變、適應力強，不是天生性格很固定的人）；官祿宮
太陽坐（很在意工作有沒有被看見、渴望具體成就與認可）；身宮福德宮天同加地空地空（內心
追求心靈上的輕鬆自在，容易看淡物質）
三個系統一致指向：這是一個「渴望被認可、成就導向、但骨子裡有不安於現狀衝動」的人，
人際圈溫和討喜，內心比外表更常有自我懷疑。
""".strip()

def rating_to_stars(rating):
    """把 1-5 的數字評分轉成星星字串，取代原本寫死的 ★★★★☆"""
    try:
        filled = max(0, min(5, round(float(rating))))
    except (TypeError, ValueError):
        filled = 4
    return "★" * filled + "☆" * (5 - filled)

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

EXCHANGE_HISTORY_FILE = "data/exchange_rate_history.json"

def load_exchange_history():
    if os.path.exists(EXCHANGE_HISTORY_FILE):
        try:
            with open(EXCHANGE_HISTORY_FILE, 'r', encoding='utf-8') as f:
                return json.load(f)
        except Exception as e:
            print(f"Failed to read exchange rate history ({e}), starting fresh.")
    return {}

def save_exchange_history(history):
    os.makedirs(os.path.dirname(EXCHANGE_HISTORY_FILE), exist_ok=True)
    with open(EXCHANGE_HISTORY_FILE, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

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

            # ExchangeRate-API 免費版只給最新匯率，沒有歷史資料可以查。
            # 改成自己每天存一筆，`data/exchange_rate_history.json` 由 Actions
            # 每次執行後 commit 回 repo，累積出真實的 7 天走勢（不是編的假資料，
            # 頭幾天會比較短，滿 7 天之後才會是完整一週）。
            today_key = now_tw.strftime("%Y-%m-%d")
            history = load_exchange_history()
            history[today_key] = twd_rate
            trimmed = dict(sorted(history.items())[-7:])
            save_exchange_history(trimmed)

            sorted_dates = sorted(trimmed.keys())
            last7_days = [trimmed[d] for d in sorted_dates] if len(sorted_dates) > 1 else None

            yesterday_rate, change, change_percent = None, None, None
            if len(sorted_dates) >= 2:
                yesterday_rate = trimmed[sorted_dates[-2]]
                change = round(twd_rate - yesterday_rate, 2)
                change_percent = f"{'+' if change >= 0 else ''}{round(change / yesterday_rate * 100, 2)}%"

            return {
                "pair": "CNY → TWD",
                "current": twd_rate,
                "yesterday": yesterday_rate,
                "change": change,
                "changePercent": change_percent,
                "isUp": change is None or change >= 0,
                "last7Days": last7_days,
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
                    title_el = item.find('title')
                    link_el  = item.find('link')
                    desc_el  = item.find('description')
                    title = strip_html(title_el.text) if title_el is not None else ''
                    link  = link_el.text.strip() if link_el is not None and link_el.text else ''
                    desc  = strip_html(desc_el.text) if desc_el is not None and desc_el.text else ''
                    safe_link = sanitize_url(link)
                    if title:
                        candidate_items.append({
                            "source": source_name,
                            "title": title,
                            "link": safe_link,
                            # Full cleaned plain-text snippet — no truncation
                            "snippet": desc if desc else title
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
你是一位專業的個人 AI 助理。請根據以下事實資料，為使用者 (Kasim，處女座，目前在南京交換，正在準備機車筆試與規劃 AI PM 職涯) 生成每日晨報摘要。

【重要準則】：
1. 嚴格基於提供之【候選新聞項目】做摘要，絕對不得自行編造未在 RSS 中出現的虛構事件或假新聞！
2. 輸出之 aiNews List 數量必須與傳入之候選新聞數量相對應。
3. 運勢部分要根據下方【真實命盤重點】寫，不要套處女座罐頭文字（例如不要只寫「處女座今天適合整理」這種任何處女座都適用的話）。這份命盤摘要是穩定的個性特質，不是每日星象演算，所以每天的用詞、角度可以不同，但內容要合理對應到命盤裡實際存在的特質，不能無中生有編一個命盤沒有的說法。
4. 如果你確實知道今天日期附近有正在發生、廣為人知的天象事件（例如水星逆行區間），可以順帶提一句這對這份命盤的意義；但如果不確定精確日期或根本不知道，就不要提，不要編造一個聽起來合理但其實不確定的天象事件。

【真實命盤重點】:
{BIRTH_CHART_SUMMARY}

【已知事實資料】:
- 今日地點：{weather['location']}，天氣狀況：{weather['condition']}，溫度：{weather['tempMin']}~{weather['tempMax']}，降雨機率：{weather['rainChance']}
- 匯率：CNY/TWD = {exchange_rate['current'] if exchange_rate['current'] else '暫無數據'}
- 候選新聞項目: {json.dumps(rss_items[:5], ensure_ascii=False)}

【請輸出嚴格的 JSON 格式】:
{{
  "weatherTip": "針對溫差與降雨的一句話實用出門提醒",
  "horoscopeSummary": "根據上方真實命盤重點寫 2-3 句今天的解讀，可以結合今天日期/星期幾發揮，但論點要能對應到命盤裡的具體特質",
  "horoscopeDetails": {{
    "overall": "根據命盤整體特質寫的一句話，跟今天有點關聯",
    "love": "根據命盤裡感情相關特質（例如上升對沖凱龍、月金木三合等）寫的一句話",
    "work": "根據命盤裡事業/成就相關特質（例如官祿宮太陽、太陽第二宮等）寫的一句話",
    "wealth": "根據命盤裡財務相關特質寫的一句話，資料薄弱就寫得保守一點，不要硬掰",
    "health": "根據命盤裡身心相關特質（例如不安於現狀的衝動、自我懷疑傾向）寫的一句話"
  }},
  "horoscopeLuckyColor": "一個顏色 + 一個表情符號，例如 寶藍色 🟦",
  "horoscopeLuckyNumber": "一個 1-99 的數字字串",
  "horoscopeRating": "今天的整體運勢評分，1.0-5.0 之間可以有小數的數字",
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
      {{"text": "天氣/攜帶物品提醒"}},
      {{"text": "駕照練習方向提醒"}},
      {{"text": "科技新知閱讀建議"}}
    ]
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
            # Prefer Gemini summary; fallback to full RSS snippet (no truncation)
            "summary": gemini_item.get("summary") or rss_item.get("snippet", ""),
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
                # Full RSS snippet — no truncation
                "summary": item.get("snippet", ""),
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
        # Gemini 不可用時的離線 fallback，還是根據真實命盤寫（不是處女座罐頭文字），
        # 只是沒辦法每天換說法
        "horoscopeSummary": "你的命盤裡不安於現狀的衝動跟渴望被認可的成就感，是長期主題，不是今天限定。與其等心情對了才動手，不如挑一件具體小事先做完，落地的產出比想清楚更能安你的心。",
        "horoscopeDetails": {
            "overall": "命宮空宮、性格隨環境調整，今天狀態會跟著周遭步調走，不用強求跟昨天一樣。",
            "love": "親密關係是這輩子要花力氣練習的課題，今天如果有摩擦，先別急著下定論。",
            "work": "官祿宮太陽坐鎮，成就感是你的核心動力，挑一件能被看見的事先做完。",
            "wealth": "命盤裡財務相關的依據較薄弱，維持穩定記帳習慣即可，不用過度解讀。",
            "health": "內心比外表更容易自我懷疑，留一點時間讓自己喘口氣，別一直往前衝。"
        },
        "horoscopeLuckyColor": "寶藍色 🟦",
        "horoscopeLuckyNumber": "7",
        "horoscopeRating": 4.0,
        "aiNews": news_list,
        "dailyAdvice": {
            "top3": [
                {"text": f"天氣狀態：{weather.get('condition', '多雲')}，出門記得準備雨具。"},
                {"text": "駕照筆試練習今日重點：加強交岔路口路權與雙黃線禁跨題型。"},
                {"text": "今日 AI 產業有即時動態發布，可花 10 分鐘快速了解趨勢。"}
            ]
        }
    }

def main():
    print("=== Starting Personal AI Morning Brief Generation Pipeline ===")
    now_tw = datetime.now(TZ_TAIWAN)
    date_str = now_tw.strftime("%Y / %m / %d %A")

    gemini_key = os.environ.get("GEMINI_API_KEY")
    qweather_key = os.environ.get("QWEATHER_API_KEY")
    qweather_host = os.environ.get("QWEATHER_API_HOST")

    # Build metadata: injected by GitHub Actions environment variables.
    # These are empty strings when run locally (not in CI).
    build_info = {
        "generatedAt": now_tw.isoformat(),
        "githubRunId": os.environ.get("GITHUB_RUN_ID", ""),
        "commitHash": os.environ.get("GITHUB_SHA", "")[:7] if os.environ.get("GITHUB_SHA") else "",
        "workflowRunNumber": os.environ.get("GITHUB_RUN_NUMBER", "")
    }

    weather = fetch_weather(qweather_key, qweather_host)
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
        # buildInfo: only populated when running inside GitHub Actions.
        # Repository's data/today.json will NOT have these values (it is a static
        # placeholder). The live values only exist in the artifact deployed to
        # GitHub Pages via upload-pages-artifact → deploy-pages (Strategy A).
        "buildInfo": build_info,
        "weather": weather,
        "horoscope": {
            "sign": f"{USER_PROFILE['zodiac']} ♍",
            "ratingStars": rating_to_stars(ai_synthesis.get("horoscopeRating", 4.0)),
            "score": ai_synthesis.get("horoscopeRating", 4.0),
            "details": ai_synthesis.get("horoscopeDetails", {
                "overall": "", "love": "", "work": "", "wealth": "", "health": ""
            }),
            "luckyColor": ai_synthesis.get("horoscopeLuckyColor", "寶藍色 🟦"),
            "luckyNumber": ai_synthesis.get("horoscopeLuckyNumber", "7"),
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
    print(f"BUILD INFO: Run #{build_info['workflowRunNumber']} | Commit {build_info['commitHash']} | {build_info['generatedAt']}")

if __name__ == "__main__":
    main()
