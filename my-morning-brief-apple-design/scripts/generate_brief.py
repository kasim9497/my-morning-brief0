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
import math
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


# 今天實際的天象（太陽、月亮、行星在哪個星座、有沒有逆行、月相），用天文套件 ephem 算。
# 運勢文字還是模型寫的，但逆行、新月滿月這些「事實」不再讓模型自己猜。沒裝 ephem 時回傳 None。
try:
    import ephem
except Exception:
    ephem = None

ZODIAC = ["牡羊", "金牛", "雙子", "巨蟹", "獅子", "處女", "天秤", "天蠍", "射手", "摩羯", "水瓶", "雙魚"]


def get_sky_facts(now):
    if ephem is None:
        return None

    def longitude(body, when):
        body.compute(when)
        # epoch 用當天：星座是照當天的春分點算的，用預設的 J2000 會差零點幾度，剛好換座那天會算錯
        return math.degrees(ephem.Ecliptic(body, epoch=when).lon) % 360

    when = ephem.Date(now.astimezone(timezone.utc).replace(tzinfo=None))
    bodies = [("太陽", ephem.Sun()), ("月亮", ephem.Moon()), ("水星", ephem.Mercury()), ("金星", ephem.Venus()),
              ("火星", ephem.Mars()), ("木星", ephem.Jupiter()), ("土星", ephem.Saturn())]
    positions, retrograde = [], []
    for name, body in bodies:
        lon = longitude(body, when)
        positions.append(f"{name}在{ZODIAC[int(lon // 30)]}座")
        if name not in ("太陽", "月亮"):
            # 一天後的黃經比今天小（考慮 360 度繞回）就是逆行
            if (longitude(body, when + 1) - lon + 540) % 360 - 180 < 0:
                retrograde.append(name)

    elongation = (longitude(ephem.Moon(), when) - longitude(ephem.Sun(), when)) % 360
    if elongation < 12 or elongation > 348:
        phase = "新月"
    elif abs(elongation - 180) < 12:
        phase = "滿月"
    else:
        phase = "月亮漸盈" if elongation < 180 else "月亮漸虧"
    return {"positions": positions, "retrograde": retrograde, "moonPhase": phase}


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
            data = json.load(f)
        featured_authors = set(data.get("featured_authors", []))
        return [
            {"text": r[0], "author": r[1], "source": r[2], "featured": r[1] in featured_authors}
            for r in data.get("quotes", []) if len(r) == 3 and r[0]
        ]
    except Exception as e:
        print(f"Failed to read quotes file ({e}), using fallback quote.")
        return []

def get_daily_quote(now_tw):
    """每天固定一條，不呼叫 AI（避免語錄被幻覺捏造）。

    使用者要的是日本職人、做事態度那一類，所以三天裡有兩天從 featured（quotes.json 的
    featured_authors）那一池出，第三天才從其他（中國古籍、西方）那一池出。
    兩池各自用固定種子洗牌一次、照順序輪，輪完才會重複。"""
    quotes = load_quotes()
    if not quotes:
        return FALLBACK_QUOTE
    random.Random(20261003).shuffle(quotes)
    featured = [q for q in quotes if q["featured"]]
    others = [q for q in quotes if not q["featured"]]
    day = now_tw.date().toordinal()
    if featured and (day % 3 != 0 or not others):
        pick = featured[(day // 3 * 2 + day % 3 - 1) % len(featured)]
    else:
        pick = others[(day // 3) % len(others)]
    return {"text": pick["text"], "author": pick["author"], "source": pick["source"]}

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
                    # id 每天重編成 q_1…，題庫裡原本的編號另外留在 qid（錯題本用它認題目）
                    item['qid'] = item.get('id')
                    item['id'] = f"q_{idx+1}"
                    if 'source_url' in item:
                        item['source_url'] = sanitize_url(item['source_url'])
                return sampled
        except Exception as e:
            print(f"Error reading {quiz_file}: {e}")

    return []

def synthesize_with_ai(weather, exchange_rate, openrouter_api_key, sky=None, github_token=None):
    print("Calling an AI model for synthesis...")
    if sky:
        sky_text = "、".join(sky["positions"]) + f"；月相：{sky['moonPhase']}；逆行中的行星：" + ("、".join(sky["retrograde"]) or "無")
    else:
        sky_text = "（今天沒有天象資料，horoscopeTransitAlert 一律填 null）"
    prompt_text = f"""
你是報紙星座專欄的作者，同時負責一句天氣提醒。請根據下面的資料寫今天的內容。

【運勢怎麼寫】：
1. 寫成報紙上「處女座今日運勢」的口吻：對象是所有處女座讀者，不是特定某個人。可以用「處女座」當主詞，或直接省略主詞。
2. 絕對不要提到任何個人資訊：不要提考試、駕照、機車、職涯規劃、AI、產品經理、交換、南京、姓名。也不要出現「你的命盤」「官祿宮」「第二宮」「上升」「八字」「紫微」這類命盤術語。
3. 下面的【命盤重點】和【今日天象】是你下筆的依據：命盤重點用來決定哪些面向該多著墨（例如務實、容易自我懷疑、重視成就感），今日天象用來決定今天的氣氛。兩者都只能轉化成一般性的描述，不能直接講出來源。
4. 每天的角度和用詞要有變化，內容要具體（例如「把拖著的小事清掉」），不要空泛的吉祥話。
5. horoscopeTransitAlert：只有【今日天象】列出有行星逆行，或今天是新月／滿月時才寫，用一句話說這段時間對處女座的一般性提醒；都沒有就填 null。不可以提【今日天象】沒有列出的天象。

【命盤重點】（只當作依據，不要直接引用）:
{BIRTH_CHART_SUMMARY}

【今日天象】（天文計算結果）:
{sky_text}

【已知事實資料】:
- 今日地點：{weather['location']}，天氣狀況：{weather['condition']}，溫度：{weather['tempMin']}~{weather['tempMax']}，降雨機率：{weather['rainChance']}
- 匯率：CNY/TWD = {exchange_rate['current'] if exchange_rate['current'] else '暫無數據'}

【請輸出嚴格的 JSON 格式】:
{{
  "weatherTip": "針對溫差與降雨的一句話實用出門提醒",
  "horoscopeSummary": "2-3 句處女座今日整體運勢，報紙專欄口吻",
  "horoscopeDetails": {{
    "overall": "一句話，處女座今天的整體運",
    "love": "一句話，處女座今天的感情運",
    "work": "一句話，處女座今天的工作運",
    "wealth": "一句話，處女座今天的財運",
    "health": "一句話，處女座今天的健康運"
  }},
  "horoscopeLuckyColor": "一個顏色名稱，例如 寶藍色（只要文字，不要表情符號）",
  "horoscopeLuckyNumber": "一個 1-99 的數字字串",
  "horoscopeRating": "今天的整體運勢評分，1.0-5.0 之間可以有小數的數字",
  "horoscopeTransitAlert": "依準則 5，有逆行或新月滿月才寫一句，否則填 null"
}}
"""
    # 依序試這幾家，第一家成功就用它。
    # 1. GitHub Models：GitHub Actions 內建的 GITHUB_TOKEN 就能呼叫，免費（有每日次數上限，這裡一天只用幾次）。
    #    workflow 要有 `models: read` 權限。本機沒有這個 token，會直接跳過。
    # 2. OpenRouter：付費的 deepseek。2026-10-08 起帳戶餘額是負的、使用者不打算再儲值，
    #    留著只是萬一之後又有額度；沒額度時會回 402，然後落到離線樣板。
    providers = []
    if github_token:
        providers.append(("GitHub Models", "https://models.github.ai/inference/chat/completions", github_token, "openai/gpt-4o-mini"))
    if openrouter_api_key:
        providers.append(("OpenRouter", "https://openrouter.ai/api/v1/chat/completions", openrouter_api_key, "deepseek/deepseek-chat-v3.1"))

    last_error = "沒有可用的模型金鑰"
    for name, url, token, model in providers:
        data_bytes = json.dumps({
            "model": model,
            "messages": [{"role": "user", "content": prompt_text}],
            "temperature": 0.2,
            "response_format": {"type": "json_object"}
        }).encode('utf-8')
        # 每一家試兩次：實測過模型偶爾會吐出格式壞掉的 JSON，重跑一次通常就好
        for attempt in range(2):
            try:
                req = urllib.request.Request(url, data=data_bytes, headers={
                    'Content-Type': 'application/json',
                    'Authorization': f'Bearer {token}'
                })
                body = ""
                with urllib.request.urlopen(req, timeout=30) as resp:
                    body = resp.read().decode('utf-8')
                parsed_json = json.loads(json.loads(body)['choices'][0]['message']['content'])
                print(f"AI synthesis succeeded with {name} ({model}).")
                return parsed_json
            except Exception as e:
                # 4xx／5xx 的說明在回應本體裡，一起印出來才看得出是權限、額度還是格式問題
                if isinstance(e, urllib.error.HTTPError):
                    body = e.read().decode('utf-8', 'replace')
                last_error = f"{name}: {e}"
                print(f"{name} call failed on attempt {attempt + 1} ({e}). Response starts with: {body[:300]!r}")

    print(f"All AI providers failed ({last_error}). Falling back to smart template synthesis.")
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
        "horoscopeSummary": "處女座今天適合從小處著手。與其等狀態對了才開始，不如先把一件具體的小事做完，有成果在手，心就定了。",
        "horoscopeDetails": {
            "overall": "步調容易跟著周遭走，不必強求跟昨天一樣。",
            "love": "有摩擦時先別急著下定論，把話聽完再說。",
            "work": "挑一件看得到成果的事先完成，會帶動後面的節奏。",
            "wealth": "維持平常的收支習慣即可，不宜衝動決定。",
            "health": "留一點時間喘口氣，別一直往前衝。"
        },
        "horoscopeLuckyColor": "寶藍色",
        "horoscopeLuckyNumber": "7",
        "horoscopeRating": 4.0,
        # 離線 fallback 不確定當下真的有沒有天象事件，寧可不提也不要編
        "horoscopeTransitAlert": None,
    }

HOROSCOPE_STYLE = 2

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
        if generated_at.startswith(today_key) and horoscope.get("source") == "ai" and horoscope.get("style") == HOROSCOPE_STYLE:
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

    sky = get_sky_facts(now_tw)
    ai_synthesis = to_traditional(synthesize_with_ai(weather, exchange_rate, openrouter_key, sky, os.environ.get("GITHUB_MODELS_TOKEN")))

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
            "source": "fallback" if ai_synthesis.get("_offline") else "ai",
            # 寫法的版本：2 = 報紙專欄口吻、不提個人資訊。改寫法時加一，當天已發布的舊寫法就不會被沿用
            "style": HOROSCOPE_STYLE,
            "sky": sky
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
