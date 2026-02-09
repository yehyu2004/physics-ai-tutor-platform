# 清華物理 AI 家教平台 — 功能擴展總計畫

> 本計畫由三位 AI Agent 辯論後綜合產出：
> - **創新者 (Optimist)** — 提出 7 項功能構想
> - **務實者 (Pragmatist)** — 評估可行性與實作成本
> - **學生代言人 (Student Advocate)** — 從學生 UX 角度評估
>
> 最終由 **綜合者 (Synthesizer)** 整合三方觀點，產出此份計畫。

---

## 現有功能盤點

| 類別 | 已有功能 |
|------|----------|
| AI 對話 | GPT-5 Mini / Claude 4.5 Haiku 雙模型切換、圖片上傳分析、LaTeX 渲染、**Mermaid 圖表渲染 (新增)** |
| 作業系統 | 測驗 / 檔案上傳作業、MC/數值/自由作答、自動批改 |
| AI 批改 | AI 建議評分與回饋、Rubric 支援 |
| 題目生成 | 按主題/難度/題型生成物理題 |
| 管理後台 | 使用者管理、AI 設定、對話歷史瀏覽 |
| 基礎設施 | DB 已有 isBanned/isRestricted 欄位（未啟用）|

---

## 功能總覽與優先度

| 優先度 | 功能 | 創新者 | 務實者 | 學生代言人 | 最終決定 |
|--------|------|--------|--------|------------|----------|
| **P0** | 蘇格拉底式引導模式 | ✅ 核心教學 | ⭐⭐⭐⭐⭐ 最高 ROI | 排名 #1 | **立即實作** |
| **P0** | 自動偵測濫用系統 | ✅ 必要功能 | ⭐⭐⭐⭐ Phase 1 先 | 排名 #7（必要但輕量化）| **立即實作 MVP** |
| **P1** | AI 學習分析儀表板 | ✅ 高價值 | ⭐⭐⭐⭐ 重用現有資料 | 排名 #2 考試必備 | **短期實作** |
| **P1** | 遊戲化學習系統 | ✅ 提升參與 | ⭐⭐⭐⭐ Phase 1+2 | 排名 #6 兩極化 | **短期實作（可關閉）** |
| **P2** | 互動式物理模擬 | ✅ 殺手功能 | ⭐⭐ 不建議自建 | 排名 #3 超酷 | **整合 PhET，不自建** |
| **P2** | 同儕協作問答 | ✅ 社交學習 | ⭐⭐ 用討論串替代 | 排名 #4 學生愛用 | **簡化為討論區** |
| **P3** | 個人化學習路徑 | ✅ 量身打造 | ⭐⭐ 冷啟動問題 | 排名 #5 有用非必要 | **輕量版，標籤系統** |
| **P1** | AI 題目變化生成器 | ✅ 擴展現有 | ⭐⭐⭐⭐ 基於現有 API | 未獨立評估 | **擴展現有功能** |

---

## Phase 0：基礎建設補強（1 週）

> **務實者強烈建議**：在新增功能前先補強基礎

### 0.1 API Input Validation
- 引入 **Zod** 做統一 request body 驗證
- 涵蓋所有 16 個 API routes

### 0.2 統一錯誤處理
- 建立 API error handler middleware
- 統一回傳格式 `{ error: string, code: string }`

### 0.3 完成 Ban/Restrict 基礎
- 啟用已有的 `isBanned`, `isRestricted` 欄位
- 在 API middleware 檢查使用者狀態
- 被封鎖使用者導向到通知頁面

---

## Phase 1：核心學習功能（2-3 週）

### 1.1 蘇格拉底式引導模式 ⭐ 最高優先

> **三方共識**：ROI 最高、實作最簡單、教學效果最顯著

**功能描述**：
AI 透過提問引導學生思考，而非直接給答案。提供「學習模式」與「快速模式」切換。

**實作方案**：
```
修改範圍：
1. src/app/api/chat/route.ts — 新增 mode 參數
2. ChatPageClient.tsx — 新增模式切換 toggle
3. System prompt 設計兩套：
   - 快速模式：直接解答（現有行為）
   - 蘇格拉底模式：引導式提問
```

**蘇格拉底模式 System Prompt**：
```
你是一位蘇格拉底式物理家教。絕對不要直接給答案。
引導方式：
1. 先問學生「你認為這題涉及哪些物理概念？」
2. 確認概念後，問「相關的公式有哪些？」
3. 引導列出已知條件和未知量
4. 透過提問引導解題步驟
5. 只有在學生明確表示完全卡住時，才給更具體的提示
如果學生連續 3 次回答「不知道」，提供更具體的引導但仍不給最終答案。
```

**學生代言人的關鍵建議（必須採納）**：
- ✅ 提供「我真的不懂，直接告訴我」按鈕（標記為需加強）
- ✅ 深夜（23:00 後）提示「要不要切換快速模式？」
- ✅ 顯示引導進度條（「還有約 2 步就能得到完整解答」）

**資料庫變更**：
- `Message` 表新增 `mode` 欄位（'normal' | 'socratic'）

**預估時間**：3-5 天

---

### 1.2 自動偵測濫用系統 MVP

> **創新者**：全面監控系統
> **務實者**：先做 rate limiting + 基本規則
> **學生代言人**：要寬鬆、透明、可申訴

**Phase 1 MVP 方案**（採納務實者建議）：

#### Rate Limiting
```
規則：
- 每位使用者：30 requests/hour（考試週自動放寬至 60）
- 全域 IP：100 requests/hour
- 技術：使用 in-memory Map 或 Upstash Redis
```

#### 內容基礎審核
```
規則引擎（不使用 ML，rule-based）：
- 偵測重複提交完全相同的訊息
- 偵測短時間內大量「直接幫我算」類型訊息
- 偵測明顯不當內容（關鍵詞匹配）
```

#### 漸進式處理（學生代言人關鍵建議）
```
Level 1 — 友善提醒：
  「你今天已經問了很多問題，建議先消化一下之前的回答 😊」

Level 2 — 軟限制（isRestricted）：
  降低速率至 10 requests/hour，通知 TA

Level 3 — 封鎖（isBanned）：
  暫停使用，通知管理員，顯示申訴按鈕
```

**資料庫變更**：
```prisma
model AuditLog {
  id        String   @id @default(cuid())
  userId    String
  action    String   // "rate_limit_hit", "content_flag", "ban", "unban"
  details   Json?
  createdAt DateTime @default(now())
  user      User     @relation(fields: [userId], references: [id])
}
```

**新增 API**：
- `POST /api/admin/users/[id]/ban` — 封鎖/解封使用者
- `POST /api/admin/users/[id]/restrict` — 限制/解除限制
- `GET /api/admin/audit-log` — 查看審計記錄

**管理後台新增**：
- 使用者列表顯示 ban/restrict 狀態
- 一鍵封鎖/限制按鈕
- 審計記錄頁面

**預估時間**：2 週

---

### 1.3 漸進式提示系統

> **創新者**原提案 + **學生代言人**建議合併

**功能描述**：
解題卡關時，AI 提供分層提示：方向 → 公式 → 步驟 → 完整解答

**整合到蘇格拉底模式中**：
- 蘇格拉底模式本身就是漸進式引導
- 新增 UI：「給我一點提示」按鈕（每點一次揭露下一層）
- 記錄每題使用提示次數，納入學習分析

**預估時間**：與 1.1 一起實作，額外 2 天

---

## Phase 2：數據與參與（3-4 週）

### 2.1 AI 學習分析儀表板

> **三方共識**：對學生和教師都高價值

**學生視角**（3 個核心指標）：
```
┌─────────────────────────────────────────────┐
│  📊 我的學習分析                              │
│                                               │
│  🔴 薄弱章節：電磁學 (平均 62%)               │
│     → 建議複習這 5 題 [連結]                   │
│                                               │
│  📈 進步趨勢：近兩週正確率 +15%               │
│                                               │
│  ⏱️ 本週學習：3.5 小時（超過 78% 同學）        │
│                                               │
│  [各章節雷達圖]    [成績趨勢折線圖]            │
└─────────────────────────────────────────────┘
```

**教師/TA 視角**：
```
┌─────────────────────────────────────────────┐
│  📊 班級分析                                  │
│                                               │
│  🔴 高錯誤率題目 Top 5                        │
│  📊 班級成績分布直方圖                         │
│  👥 參與度排名（僅 TA/Admin 可見）             │
│  💡 AI 洞察：「32% 學生在向量運算有困難」      │
└─────────────────────────────────────────────┘
```

**技術方案**：
- 圖表：**Recharts**（React-friendly，比 Chart.js 更好整合）
- 資料來源：Submission, SubmissionAnswer, Message, Conversation
- AI 洞察：週報形式，GPT-5 Mini 分析一週資料生成

**學生代言人關鍵建議**：
- ✅ 強調進步而非弱點（「你上週進步了 20%」）
- ✅ 每個弱點附帶可操作建議（推薦練習題連結）
- ✅ 隱私控制：學生可選擇是否讓 TA 看到詳細數據

**新增頁面**：`/analytics`（學生版）、`/admin/analytics`（教師版）

**預估時間**：3 週

---

### 2.2 遊戲化學習系統（可關閉）

> **務實者**：漸進式實作
> **學生代言人**：必須可關閉，避免負面競爭

**Phase 1 — 個人進度**：

```prisma
model UserProgress {
  id             String    @id @default(cuid())
  userId         String    @unique
  totalXP        Int       @default(0)
  level          Int       @default(1)
  currentStreak  Int       @default(0)
  longestStreak  Int       @default(0)
  lastActiveDate DateTime?
  user           User      @relation(fields: [userId], references: [id])
}

model Achievement {
  id          String @id @default(cuid())
  key         String @unique  // "first_question", "streak_7", "perfect_quiz"
  name        String
  description String
  iconEmoji   String // "🎯", "🔥", "⭐"
  criteria    Json   // {"type": "streak", "value": 7}
}

model UserAchievement {
  id            String   @id @default(cuid())
  userId        String
  achievementId String
  unlockedAt    DateTime @default(now())
  user          User        @relation(fields: [userId], references: [id])
  achievement   Achievement @relation(fields: [achievementId], references: [id])
  @@unique([userId, achievementId])
}
```

**XP 規則**（難度加權，防刷題）：
| 行為 | XP |
|------|-----|
| 完成作業 | 基礎 50 + 正確率% |
| 蘇格拉底模式解完一題 | 30 |
| 連續登入 streak | +5/天（上限 30） |
| 首次掌握新章節 | 100 |
| 幫助同學（討論區） | 20 |

**預設成就**：
- 「初心者」：提出第一個問題
- 「堅持不懈 🔥」：連續 7 天登入
- 「完美主義者 ⭐」：一次作業全對
- 「深度思考者 🧠」：蘇格拉底模式完成 10 題
- 「全章節制霸 👑」：所有章節正確率 > 80%

**關鍵 UX 決策**（學生代言人建議）：
- ✅ 設定頁面提供「關閉遊戲化」開關
- ✅ 排行榜預設匿名，學生自行選擇是否公開
- ✅ 只顯示百分位（「超越 75% 的同學」），不顯示具體排名
- ✅ 通知預設關閉

**預估時間**：3 週

---

### 2.3 AI 題目變化生成器（擴展現有功能）

> **創新者**提案，**務實者**認為可基於現有 API 擴展

**功能描述**：
擴展 `/api/problems/generate`，支援：
- 同一題的數值變化版（改參數、改情境）
- 學生自主練習模式（無限刷題）
- 依照弱點章節自動推薦題目

**新增 API**：
- `POST /api/problems/practice` — 學生自主練習（基於弱點推薦）
- `POST /api/problems/variations` — 給定題目生成變化版

**預估時間**：1.5 週

---

## Phase 3：社交與視覺化（4-6 週）

### 3.1 同儕討論區（簡化版協作）

> **務實者**：用非即時討論串取代 real-time 協作
> **學生代言人**：學生很愛，但不需要太複雜

**方案**：非即時討論區（不用 WebSocket）

```prisma
model ForumPost {
  id           String   @id @default(cuid())
  title        String
  content      String
  authorId     String
  assignmentId String?  // 可連結到特定作業
  topic        String?  // "mechanics", "em", "thermo"
  isAnonymous  Boolean  @default(false)
  isPinned     Boolean  @default(false)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  author       User     @relation(fields: [authorId], references: [id])
  assignment   Assignment? @relation(fields: [assignmentId], references: [id])
  replies      ForumReply[]
  votes        ForumVote[]
}

model ForumReply {
  id          String   @id @default(cuid())
  content     String
  authorId    String
  postId      String
  isAnonymous Boolean  @default(false)
  isBestAnswer Boolean @default(false) // TA 標記
  createdAt   DateTime @default(now())
  author      User     @relation(fields: [authorId], references: [id])
  post        ForumPost @relation(fields: [postId], references: [id])
  votes       ForumVote[]
}

model ForumVote {
  id      String @id @default(cuid())
  userId  String
  postId  String?
  replyId String?
  value   Int    // +1 or -1
  user    User   @relation(fields: [userId], references: [id])
  @@unique([userId, postId])
  @@unique([userId, replyId])
}
```

**功能特色**：
- 每個作業下方有「討論」按鈕
- 支援匿名發文（不怕問笨問題）
- TA 可標記「最佳解答」
- AI 助教自動偵測錯誤概念並回覆更正
- 使用 SWR polling（每 10 秒）更新

**新增頁面**：`/forum`、`/forum/[postId]`

**預估時間**：3 週

---

### 3.2 物理模擬整合（不自建）

> **務實者**：強烈不建議自建模擬器
> **學生代言人**：殺手級功能，但要簡單
> **最終決定**：整合 PhET + Mermaid 圖表 + AI 生成簡易動畫

**方案 A — PhET 嵌入**（1 週）：
```
AI 聊天回覆中自動偵測相關主題，推薦 PhET 模擬：
「你在問拋體運動，推薦模擬器：」
[嵌入 PhET iframe - Projectile Motion]
```

**方案 B — Mermaid 力學圖（已完成 ✅）**：
```
AI 回覆中自動使用 Mermaid 繪製：
- 力學受力圖
- 電路圖
- 能量流程圖
- 概念關係圖
```

**方案 C — AI 生成 Canvas 動畫**（2 週）：
```
AI 輸出可執行的簡易動畫程式碼，
前端沙盒化執行並顯示結果。
適用場景：拋物線軌跡、簡諧運動、波形疊加
```

**預估時間**：3 週（A+C）

---

## Phase 4：進階智慧化（長期）

### 4.1 輕量版學習路徑

> **務實者建議**的超輕量方案，非完整 knowledge graph

- 題目標記章節標籤
- 根據錯題統計顯示「你的薄弱章節」
- AI 自動推薦「類似但更簡單的題目」
- 教授手動設定建議學習順序

**預估時間**：3 週

### 4.2 即時概念連結地圖

- AI 對話時自動抽取物理概念
- 側邊欄顯示概念關聯圖（React Flow）
- 點擊節點跳轉相關教材

**預估時間**：4 週

---

## 實作時程總覽

```
Week 1       : Phase 0 — 基礎建設（Zod、錯誤處理、Ban 啟用）
Week 2-3     : Phase 1.1 — 蘇格拉底式引導模式 + 漸進式提示
Week 3-5     : Phase 1.2 — 濫用偵測 MVP
Week 5-8     : Phase 2.1 — AI 學習分析儀表板
Week 6-9     : Phase 2.2 — 遊戲化系統
Week 8-9     : Phase 2.3 — 題目變化生成器
Week 10-12   : Phase 3.1 — 同儕討論區
Week 12-14   : Phase 3.2 — 物理模擬整合
Week 15+     : Phase 4 — 進階功能（依回饋決定）
```

---

## 技術債務清單（與新功能並行處理）

| 項目 | 優先度 | 說明 |
|------|--------|------|
| Input Validation (Zod) | P0 | 所有 API routes 加上 schema validation |
| 統一錯誤處理 | P0 | API error handler middleware |
| 測試框架 | P1 | Jest + React Testing Library |
| Rate Limiting | P0 | 整合到濫用偵測系統 |
| Audit Logging | P1 | 記錄管理員操作 |

---

## 辯論紀錄摘要

### 主要共識
1. **蘇格拉底式引導模式**是所有 Agent 一致認為最高優先的功能
2. **物理模擬器不應自建**，整合 PhET 是最務實選擇
3. **遊戲化必須可關閉**，避免負面競爭
4. **即時協作太複雜**，討論區是更好的替代

### 主要分歧
| 議題 | 創新者 | 務實者 | 學生代言人 | 最終決定 |
|------|--------|--------|------------|----------|
| 學習路徑 | 完整 knowledge graph | 不建議，過度工程 | 有用非必要 | 輕量版標籤系統 |
| 協作空間 | Real-time WebSocket | 太複雜，用討論串 | 學生愛用 | 非即時討論區 |
| 濫用偵測 | 全面 ML 監控 | Rule-based 先行 | 要寬鬆透明 | 漸進式 rule-based |
| 模擬器 | 自建 Matter.js | 整合 PhET | 超酷但要簡單 | PhET + AI 動畫 |
| 遊戲化排行榜 | 公開排名 | 匿名可選 | 可能造成壓力 | 預設匿名百分位制 |

---

*本計畫最後更新：2026-02-09*
*由 Multi-Agent Debate System 生成*
