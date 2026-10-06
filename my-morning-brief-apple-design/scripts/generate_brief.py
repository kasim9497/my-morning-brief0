#!/usr/bin/env python3
"""
晨序 (Chénxù) - Daily Briefing Pipeline
Phase 2 / Phase 3 Backend Data Collector & OpenRouter (deepseek/deepseek-chat-v3.1) Synthesizer.

Clean Single Repository Root Architecture:
- Inputs: `data/questions.json`
- Outputs: `data/today.json`
"""

import os
import json
import gzip
import random
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime, timezone, timedelta

# 簡轉繁：AI 模型（deepseek）就算 prompt 要求繁體，還是常常整段回簡體字，
# 所以 AI 回傳的內容一律再過一次 OpenCC（s2twp = 簡體 → 台灣繁體，連用語一起轉）。
# 沒裝這個套件時（例如本機沒裝）不會壞，只是不轉。
try:
    from opencc import OpenCC
    _S2TW = OpenCC('s2twp')
except Exception:
    _S2TW = None


def to_traditional(value):
    if _S2TW is None:
        return value
    if isinstance(value, str):
        return _S2TW.convert(value)
    if isinstance(value, list):
        return [to_traditional(v) for v in value]
    if isinstance(value, dict):
        return {k: to_traditional(v) for k, v in value.items()}
    return value

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
# 不是每日星象演算——免費工具做不到真正的每日行運計算，這份摘要是拿來讓 AI
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

# 每日語錄：主題是「職人精神／執行力」，使用者指定要名人語錄、工作向、
# 日本職人風格為主（其他國家也可以）。這裡只收「確定查證過、廣為人知」的
# 真實語錄，不要為了湊數編一句話假裝是名人說的——語錄這種東西一旦出處錯了
# 很容易被發現，比沒有語錄還難看。以後要加新的語錄，一樣先查證再加，
# 不確定出處或記不清楚原文的寧可不加
QUOTES_FILE = "data/quotes.json"
FALLBACK_QUOTE = {"text": "工欲善其事，必先利其器。", "author": "孔子", "source": "《論語·衛靈公》"}

def load_quotes():
    try:
        with open(QUOTES_FILE, 'r', encoding='utf-8') as f:
            rows = json.load(f).get("quotes", [])
        return [{"text": r[0], "author": r[1], "source": r[2]} for r in rows if len(r) == 3 and r[0]]
    except Exception as e:
        print(f"Failed to read quotes file ({e}), using fallback quote.")
        return []

def get_daily_quote(now_tw):
    """每天固定一條，不呼叫 AI（避免語錄被幻覺捏造）。
    檔案裡是照出處分組排的，直接照順序會連續兩個月都是《論語》，
    所以先用固定種子洗牌一次；用日期序數取餘數，全部輪完才會重複。"""
    quotes = load_quotes()
    if not quotes:
        return FALLBACK_QUOTE
    random.Random(20261003).shuffle(quotes)
    return quotes[now_tw.date().toordinal() % len(quotes)]

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
            # 人民幣兌台幣一天通常只動到小數第三位，四捨五入到兩位會讓每天看起來都一樣
            twd_rate = round(data['rates']['TWD'], 4)

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
            # 帶日期的版本，給前端「點開看每天匯率」用（純 last7Days 只有數字沒有日期）
            last7_days_detailed = [{"date": d, "rate": trimmed[d]} for d in sorted_dates] if len(sorted_dates) > 1 else None

            yesterday_rate, change, change_percent = None, None, None
            if len(sorted_dates) >= 2:
                yesterday_rate = trimmed[sorted_dates[-2]]
                change = round(twd_rate - yesterday_rate, 4)
                change_percent = f"{'+' if change >= 0 else ''}{round(change / yesterday_rate * 100, 2)}%"

            return {
                "pair": "CNY → TWD",
                "current": twd_rate,
                "yesterday": yesterday_rate,
                "change": change,
                "changePercent": change_percent,
                "isUp": change is None or change >= 0,
                "last7Days": last7_days,
                "last7DaysDetailed": last7_days_detailed,
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
            "last7DaysDetailed": None,
            "updateTime": update_time_str,
            "isFallback": True
        }

# 每天出幾題；題庫不夠這麼多題時，就是題庫有幾題出幾題
DAILY_QUIZ_SIZE = 10

def load_quiz_questions():
    print("Selecting daily Scooter License Test Questions from data/questions.json...")
    now_tw = datetime.now(TZ_TAIWAN)
    random.seed(now_tw.strftime("%Y-%m-%d"))  # Fixed daily seed for quiz consistency
    quiz_file = "data/questions.json"
    if os.path.exists(quiz_file):
        try:
            with open(quiz_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                questions = data.get("questions", [])
                sample_size = min(DAILY_QUIZ_SIZE, len(questions))
                sampled = random.sample(questions, sample_size)
                for idx, item in enumerate(sampled):
                    item['id'] = f"q_{idx+1}"
                    if 'source_url' in item:
                        item['source_url'] = sanitize_url(item['source_url'])
                return sampled
        except Exception as e:
            print(f"Error reading {quiz_file}: {e}")

    return []

def synthesize_with_openrouter(weather, exchange_rate, openrouter_api_key):
    if not openrouter_api_key:
        print("OPENROUTER_API_KEY not provided. Using offline smart synthesis template.")
        return generate_offline_synthesis(weather, "OPENROUTER_API_KEY not provided")

    print("Calling OpenRouter (deepseek/deepseek-chat-v3.1) for AI Synthesis...")
    prompt_text = f"""
你是一位專業的個人 AI 助理。請根據以下事實資料，為使用者 (Kasim，處女座，目前在南京交換，正在準備機車筆試與規劃 AI PM 職涯) 生成每日晨報摘要。

【重要準則】：
1. 運勢部分要根據下方【真實命盤重點】寫，不要套處女座罐頭文字（例如不要只寫「處女座今天適合整理」這種任何處女座都適用的話）。這份命盤摘要是穩定的個性特質，不是每日星象演算，所以每天的用詞、角度可以不同，但內容要合理對應到命盤裡實際存在的特質，不能無中生有編一個命盤沒有的說法。
2. 如果你確實知道今天日期附近有正在發生、廣為人知的重大天象事件（例如水星逆行、土星逆行、其他行星逆行區間、日食／月食等），要在 horoscopeTransitAlert 欄位提醒一句這對這份命盤的意義；但如果不確定精確日期或根本不知道，horoscopeTransitAlert 就填 null，絕對不要編造一個聽起來合理但其實不確定的天象事件。這個欄位是獨立的提醒區塊，不要跟 horoscopeSummary 的內容重複。

【真實命盤重點】:
{BIRTH_CHART_SUMMARY}

【已知事實資料】:
- 今日地點：{weather['location']}，天氣狀況：{weather['condition']}，溫度：{weather['tempMin']}~{weather['tempMax']}，降雨機率：{weather['rainChance']}
- 匯率：CNY/TWD = {exchange_rate['current'] if exchange_rate['current'] else '暫無數據'}

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
  "horoscopeLuckyColor": "一個顏色名稱，例如 寶藍色（只要文字，不要表情符號）",
  "horoscopeLuckyNumber": "一個 1-99 的數字字串",
  "horoscopeRating": "今天的整體運勢評分，1.0-5.0 之間可以有小數的數字",
  "horoscopeTransitAlert": "只有在確定知道今天附近有廣為人知的重大天象事件時才填字串提醒；不確定或沒有就填 null"
}}
"""
    payload = {
        "model": "deepseek/deepseek-chat-v3.1",
        "messages": [{"role": "user", "content": prompt_text}],
        "temperature": 0.2,
        "response_format": {"type": "json_object"}
    }

    # 2026-09-21：Gemini 免費層在這個 IP／帳號上被 FAILED_PRECONDITION 擋掉
    # （Google 自己的地區白名單限制，跟帳號付款地無關），改用 OpenRouter。
    # deepseek/deepseek-chat-v3.1 是付費模型但單次呼叫成本 < $0.0001，
    # 已用真實 key 測試過中文 JSON 輸出正常，不要換回免費模型
    # （:free 後綴那些常常被共用池 429 擋掉，穩定性不夠）
    url = "https://openrouter.ai/api/v1/chat/completions"
    data_bytes = json.dumps(payload).encode('utf-8')

    last_error = None
    # 2026-09-22：實測發現 deepseek 偶爾（不是每次）就算開了 response_format
    # json_object 還是會吐出格式壞掉的 JSON（不同次呼叫會被 OpenRouter 路由到
    # 不同的底層 provider，穩定度不一）。重試一次再放棄，不要一次失敗就整天
    # 都是離線 fallback 文字
    for attempt in range(2):
        try:
            req = urllib.request.Request(url, data=data_bytes, headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {openrouter_api_key}'
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.loads(resp.read().decode('utf-8'))
                content_text = result['choices'][0]['message']['content']
                parsed_json = json.loads(content_text)
                return parsed_json
        except Exception as e:
            last_error = e
            print(f"OpenRouter API call failed on attempt {attempt + 1} ({e}).")

    print(f"OpenRouter API call failed after retry ({last_error}). Falling back to smart template synthesis.")
    return generate_offline_synthesis(weather, str(last_error)[:200])

def generate_offline_synthesis(weather, error):
    return {
        # 標記這份是離線樣板，main() 用它判斷今天的運勢是不是 AI 寫的
        "_offline": True,
        # 為什麼沒用到模型，會寫進 today.json 的 buildInfo.aiError，Telegram 通知會提醒
        "_error": error,
        "weatherTip": f"天氣狀態：{weather.get('condition', '多雲')}，出門請注意天候變化。",
        # OpenRouter 不可用時的離線 fallback，還是根據真實命盤寫（不是處女座罐頭文字），
        # 只是沒辦法每天換說法
        "horoscopeSummary": "你的命盤裡不安於現狀的衝動跟渴望被認可的成就感，是長期主題，不是今天限定。與其等心情對了才動手，不如挑一件具體小事先做完，落地的產出比想清楚更能安你的心。",
        "horoscopeDetails": {
            "overall": "命宮空宮、性格隨環境調整，今天狀態會跟著周遭步調走，不用強求跟昨天一樣。",
            "love": "親密關係是這輩子要花力氣練習的課題，今天如果有摩擦，先別急著下定論。",
            "work": "官祿宮太陽坐鎮，成就感是你的核心動力，挑一件能被看見的事先做完。",
            "wealth": "命盤裡財務相關的依據較薄弱，維持穩定記帳習慣即可，不用過度解讀。",
            "health": "內心比外表更容易自我懷疑，留一點時間讓自己喘口氣，別一直往前衝。"
        },
        "horoscopeLuckyColor": "寶藍色",
        "horoscopeLuckyNumber": "7",
        "horoscopeRating": 4.0,
        # 離線 fallback 不確定當下真的有沒有天象事件，寧可不提也不要編
        "horoscopeTransitAlert": None,
    }

PUBLISHED_TODAY_URL = os.environ.get(
    "PUBLISHED_TODAY_URL", "https://kasim9497.github.io/my-morning-brief0/data/today.json"
)


def load_published_horoscope(today_key):
    """線上那份 today.json 如果是今天產生的、而且運勢是 AI 寫的，就回傳那份運勢；否則回傳 None。

    只沿用 AI 寫的：早上那次如果模型沒回應用了樣板，之後重跑時要讓模型再試一次。
    """
    try:
        req = urllib.request.Request(PUBLISHED_TODAY_URL, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            published = json.loads(resp.read().decode('utf-8'))
        generated_at = (published.get("briefMeta") or {}).get("generatedAt", "")
        horoscope = published.get("horoscope") or {}
        if generated_at.startswith(today_key) and horoscope.get("source") == "ai":
            return horoscope
    except Exception as e:
        print(f"Could not read the published today.json ({e}); generating a fresh horoscope.")
    return None


def main():
    print("=== Starting Chenxu Generation Pipeline ===")
    now_tw = datetime.now(TZ_TAIWAN)
    date_str = now_tw.strftime("%Y / %m / %d %A")

    openrouter_key = os.environ.get("OPENROUTER_API_KEY")
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

    ai_synthesis = to_traditional(synthesize_with_openrouter(weather, exchange_rate, openrouter_key))

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
            "luckyColor": ai_synthesis.get("horoscopeLuckyColor", "寶藍色"),
            "luckyNumber": ai_synthesis.get("horoscopeLuckyNumber", "7"),
            "aiSummary": ai_synthesis.get("horoscopeSummary", ""),
            "transitAlert": ai_synthesis.get("horoscopeTransitAlert") or None,
            # "ai" = 模型寫的；"fallback" = 模型沒回應時的固定樣板
            "source": "fallback" if ai_synthesis.get("_offline") else "ai"
        },
        "exchangeRate": exchange_rate,
        "drivingQuiz": driving_quiz,
        "dailyQuote": get_daily_quote(now_tw)
    }

    # 模型這次沒回應的話把原因留下來，notify_telegram.py 會在通知裡講
    build_info["aiError"] = ai_synthesis.get("_error")

    # 同一天只用一份運勢：這支腳本每次 push 都會重跑，模型每次寫出來的內容都不一樣，
    # 使用者會看到同一天的運勢前後不同。今天已經發布過 AI 寫的運勢就沿用那一份。
    published = load_published_horoscope(now_tw.strftime("%Y-%m-%d"))
    if published:
        print("Reusing the horoscope already published today.")
        brief_data["horoscope"] = published

    # Ensure data directory exists
    os.makedirs("data", exist_ok=True)
    out_file = "data/today.json"
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(brief_data, f, ensure_ascii=False, indent=2)
    print(f"SUCCESS: Generated `today.json` successfully at {out_file}!")
    print(f"BUILD INFO: Run #{build_info['workflowRunNumber']} | Commit {build_info['commitHash']} | {build_info['generatedAt']}")

if __name__ == "__main__":
    main()
