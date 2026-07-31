/**
 * Personal AI Morning Brief - Mock Data Store (Phase 1)
 * Designed for easy migration to real APIs in Phase 2.
 */

export const mockData = {
  user: {
    name: "Jinhao",
    zodiac: "處女座",
    city: "新北市蘆洲區",
    licenseType: "普通重型機車",
    currencyPair: "CNY/TWD"
  },

  briefMeta: {
    date: "2026 / 07 / 31 Friday",
    time: "08:00 AM",
    greeting: "早安，Jinhao！這是為您整理的今日個人化 AI 數位晨報。"
  },

  weather: {
    location: "新北市蘆洲區",
    condition: "多雲轉午後雷陣雨 🌤️",
    tempCurrent: "31°C",
    tempMin: "28°C",
    tempMax: "34°C",
    rainChance: "40%",
    feelsLike: "33°C",
    humidity: "75%",
    uvIndex: "高 (8)",
    aiTip: "午後局部地區有局部雷陣雨機率，建議下午出門攜帶雨具，並留意高溫防曬。"
  },

  horoscope: {
    sign: "處女座 ♍",
    ratingStars: "★★★★☆",
    score: 4.5,
    details: {
      overall: "思緒清晰，適合處理積壓已久的細節事項。",
      love: "溝通順暢，適合與夥伴或伴侶進行深層交流。",
      work: "工作效率提升，建議先攻克最重要的單一任務，避免一心多用。",
      wealth: "財務穩定，理性消費，適合進行月度財務整理。",
      health: "精神充沛，但需注意用眼過度與肩頸放鬆。"
    },
    luckyColor: "寶藍色 🟦",
    luckyNumber: "7",
    aiSummary: "今天適合整理混亂已久的事務。工作上建議先專注完成最重要的一件事，不需要試圖一次處理所有細節，穩紮穩打效果最好。"
  },

  exchangeRate: {
    pair: "CNY → TWD",
    current: 4.12,
    yesterday: 4.10,
    change: +0.02,
    changePercent: "+0.49%",
    isUp: true,
    last7Days: [4.08, 4.09, 4.07, 4.10, 4.09, 4.10, 4.12],
    updateTime: "今天 07:50 AM"
  },

  drivingQuiz: [
    {
      id: "q1",
      question: "下列何種情況不得超車？",
      options: [
        { key: "A", text: "前車減速" },
        { key: "B", text: "交岔路口、彎道或鐵路平交道" },
        { key: "C", text: "道路寬敞平坦" },
        { key: "D", text: "前方無對向來車" }
      ],
      answer: "B",
      category: "路權與超車規定",
      explanation: "依據《道路交通安全規則》第101條，在鐵路平交道、交岔路口、轉彎處、陡坡、狹橋或設有禁止超車標誌標線之處所，一律不得超車。"
    },
    {
      id: "q2",
      question: "駕駛機車行經劃有雙黃實線（雙向禁止跨越線）之路段，下列何者正確？",
      options: [
        { key: "A", text: "視路況及車流可隨時迴轉" },
        { key: "B", text: "嚴禁跨越、超車或迴轉" },
        { key: "C", text: "僅限超越慢速車時可暫時跨越" },
        { key: "D", text: "夜間無車時可視情況跨越" }
      ],
      answer: "B",
      category: "道路標線與標誌",
      explanation: "雙黃實線表示「雙向禁止跨越線」，用以分隔對向車道，雙向車輛均嚴禁跨越線條超車、迴轉或駛入對向車道。"
    },
    {
      id: "q3",
      question: "騎乘機車配戴安全帽，下列規定何者正確？",
      options: [
        { key: "A", text: "應扣緊繫帶，且帽體不可鬆動" },
        { key: "B", text: "只要戴上即可，繫帶不需扣緊" },
        { key: "C", text: "配戴工地用工程帽亦符合規定" },
        { key: "D", text: "遮擋部分前方視線亦無妨" }
      ],
      answer: "A",
      category: "安全裝備與駕駛規範",
      explanation: "安全帽須為合格標準產品，配戴時應戴正並扣緊繫帶（下巴留1~2指寬度），帽體不得任意鬆動，才能在撞擊時保護頭部。"
    },
    {
      id: "q4",
      question: "行經未設號誌之交岔路口，支線道車與幹線道車同時到達時，何者應讓路？",
      options: [
        { key: "A", text: "幹線道車應讓支线道車" },
        { key: "B", text: "支線道車應讓幹線道車優先通行" },
        { text: "車速較快者擁有優先通行權", key: "C" },
        { text: "機車自動擁有優先通行權", key: "D" }
      ],
      answer: "B",
      category: "交岔路口路權",
      explanation: "依《道路交通安全規則》第102條，支線道車輛應讓幹線道車輛優先通行；未劃分幹支線者，少線道車應讓多線道車。"
    },
    {
      id: "q5",
      question: "駕駛人酒精濃度超過規定標準騎乘機車，除處以罰鍰外，將面臨何種處罰？",
      options: [
        { key: "A", text: "僅扣留車輛三日" },
        { key: "B", text: "當場移置保管車輛並吊扣駕駛執照" },
        { key: "C", text: "僅記違規點數一點" },
        { key: "D", text: "無其他行政處罰" }
      ],
      answer: "B",
      category: "道路交通法規與罰則",
      explanation: "依《道路交通管理處罰條例》第35條，酒駕者當場移置保管該機車，並吊扣駕照1至2年；若附載未滿12歲兒童或致人受傷，處罰將大幅加重。"
    }
  ],

  aiNews: [
    {
      id: "n1",
      source: "Google DeepMind / AI Official",
      title: "Google 發布新一代輕量級 AI Agent 架構",
      summary: "Google 推出全新針對端側與邊緣運算優化的 Agent 開發工具包，可顯著降低模型調用延遲並提高工具呼叫準確率。",
      whyImportant: "這標誌著 AI Agent 正在從純雲端走向端側混合部署，將大幅降低 AI 產品的營運成本與反應時間。",
      myImpact: "若未來想做 AI PM，這項技術趨勢指明了「端側智能 + Agent 產品互動模式」的設計方向，值得深入研究。"
    },
    {
      id: "n2",
      source: "OpenAI",
      title: "OpenAI 更新 API 函數呼叫（Function Calling）與結構化輸出規範",
      summary: "OpenAI 強化了 API JSON Schema 的嚴格約束能力，確保複雜工具鏈調用時 100% 符合型別定義。",
      whyImportant: "解決了過往 LLM 偶爾輸出格式錯誤導致系統崩潰的痛點，使 Enterprise 級別 AI 應用更為穩定可靠。",
      myImpact: "在規劃 AI 數位晨報或作品集專案時，可以使用 Strict JSON Mode 來確保抓取資料的安定性。"
    },
    {
      id: "n3",
      source: "Anthropic",
      title: "Anthropic 發表 AI 系統架構評估報告：強調長文本推理邏輯",
      summary: "Anthropic 釋出最新技術白皮書，探討如何利用多步驟思考與自自我修正（Self-Correction）機制提升複雜決策準確度。",
      whyImportant: "示範了除了單純加大模型參數外，如何透過 Prompt 工程與系統層級架構提升 LLM 的實際落地品質。",
      myImpact: "對於 AI PM 而言，理解「系統級 Prompt + 多階段評估」比單純調參更能解決實際業務問題。"
    }
  ],

  dailyAdvice: {
    top3: [
      {
        icon: "🌧️",
        text: "午後局部地區降雨機率 40%，下午出門請記得帶傘。"
      },
      {
        icon: "🛵",
        text: "駕照筆試練習今日重點：請特別加強「路權優先順序與雙黃線禁跨」題型。"
      },
      {
        icon: "🤖",
        text: "Google 與 OpenAI 今日皆有 Agent 與 API 更新，可花 10 分鐘快速了解趨勢。"
      }
    ],
    primeGoal: "今日最重要的一件事：集中精力完成 AI PM 作品集首頁與核心功能展示，避免同時啟動太多分散注意力的次要專案。"
  }
};
