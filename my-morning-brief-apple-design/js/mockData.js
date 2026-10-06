/**
 * 晨序 (Chénxù) - Mock Data Store (Phase 1)
 * Designed for easy migration to real APIs in Phase 2.
 */

export const mockData = {
  user: {
    name: "Kasim",
    zodiac: "處女座",
    city: "南京市",
    district: "栖霞區",
    licenseType: "普通重型機車",
    currencyPair: "CNY/TWD"
  },

  briefMeta: {
    date: "2026 / 07 / 31 Friday",
    time: "08:00 AM",
    greeting: "早安，Kasim！這是為您整理的今日個人化 AI 數位晨報。"
  },

  weather: {
    location: "南京市栖霞區",
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
    aiSummary: "今天適合整理混亂已久的事務。工作上建議先專注完成最重要的一件事，不需要試圖一次處理所有細節，穩紮穩打效果最好。",
    transitAlert: null
  },

  exchangeRate: {
    pair: "CNY → TWD",
    current: 4.12,
    yesterday: 4.10,
    change: +0.02,
    changePercent: "+0.49%",
    isUp: true,
    last7Days: [4.08, 4.09, 4.07, 4.10, 4.09, 4.10, 4.12],
    last7DaysDetailed: [
      { date: "2026-09-15", rate: 4.08 },
      { date: "2026-09-16", rate: 4.09 },
      { date: "2026-09-17", rate: 4.07 },
      { date: "2026-09-18", rate: 4.10 },
      { date: "2026-09-19", rate: 4.09 },
      { date: "2026-09-20", rate: 4.10 },
      { date: "2026-09-21", rate: 4.12 }
    ],
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


  dailyQuote: {
    text: "工欲善其事，必先利其器。",
    author: "孔子",
    source: "《論語·衛靈公》"
  }
};
