// ===== UL AI BACKEND SERVER =====
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit")
const nodemailer = require("nodemailer");

const app = express();

// ===== TRUST PROXY =====
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// ===== ERROR SANITIZATION (security) =====
// Production mein raw internal error details (Google/Groq ke exact error)
const IS_PRODUCTION = process.env.NODE_ENV === "production";
function sanitizeError(rawMessage) {
  if (IS_PRODUCTION) {
    return "An internal error occurred. Please try again in a moment.";
  }
  return rawMessage;
}
const KeyPool = require("./keyPool");
const { UNIVERSITY_CONTEXT, FEE_CONTEXT, PDF_CHAT_SYSTEM_PROMPT } = require("./contexts");

const PDF_API_KEY = process.env.PDF_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

if (!PDF_API_KEY) {
  console.error("❌ PDF_API_KEY .env file mein nahi mili — PDF Chat kaam nahi karega.");
}

// ===== GROQ (BACKUP MODEL) =====
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

// ===== MULTI-KEY POOLS (Gemini + Groq) =====
// .env mein GEMINI_API_KEY_1, _2, _3 ... aur GROQ_API_KEY_1, _2, _3 ... rakho.
// Jitni bhi milen (1 ya 5), sab automatically pool mein shamil ho jati hain.
const GEMINI_RPD_LIMIT = parseInt(process.env.GEMINI_RPD_LIMIT, 10) || 5;
const GEMINI_RPM_LIMIT = parseInt(process.env.GEMINI_RPM_LIMIT, 10) || 5;
const GROQ_RPD_LIMIT = parseInt(process.env.GROQ_RPD_LIMIT, 10) || 1000;
const GROQ_RPM_LIMIT = parseInt(process.env.GROQ_RPM_LIMIT, 10) || 30;

function collectKeys(prefix) {
  const keys = [];
  let i = 1;
  while (process.env[`${prefix}_${i}`]) {
    keys.push(process.env[`${prefix}_${i}`]);
    i++;
  }
  // Backward-compat: agar sirf purana single-key naam (bina _1) mila ho to bhi le lo
  if (keys.length === 0 && process.env[prefix]) {
    keys.push(process.env[prefix]);
  }
  return keys;
}

const geminiPool = new KeyPool({
  name: "GEMINI",
  keys: collectKeys("GEMINI_API_KEY"),
  rpdLimit: GEMINI_RPD_LIMIT,
  rpmLimit: GEMINI_RPM_LIMIT,
});

const groqPool = new KeyPool({
  name: "GROQ",
  keys: collectKeys("GROQ_API_KEY"),
  rpdLimit: GROQ_RPD_LIMIT,
  rpmLimit: GROQ_RPM_LIMIT,
});

// Fee-related sawal detect karne ke liye simple keyword check — English + Roman Urdu dono.
const FEE_KEYWORDS = [
  "fee", "fees", "tuition", "cost", "charges", "dues", "installment",
  "kharcha", "kharche", "paisa", "paise", "fee structure",
  "semester fee", "admission fee", "morning shift", "evening shift",
  "kitne paise", "kitni fee", "how much",
];

function isFeeRelatedQuery(messages) {
  const recentText = messages.slice(-4).map((m) => m.content).join(" ").toLowerCase();
  return FEE_KEYWORDS.some((keyword) => recentText.includes(keyword));
}

// ============================================================
// MERIT LIST — LIVE DATA (ul.edu.pk se seedha, koi static data nahi)
// ============================================================
const cheerio = require("cheerio");

const MERIT_INDEX_URL = "https://ul.edu.pk/program_merit_list";
const MERIT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minute cache — university site pe zyada load na daalein

let meritIndexCache = { data: null, fetchedAt: 0 };

async function fetchMeritListIndex() {
  const now = Date.now();
  if (meritIndexCache.data && now - meritIndexCache.fetchedAt < MERIT_CACHE_TTL_MS) {
    return meritIndexCache.data;
  }

  const response = await fetch(MERIT_INDEX_URL);
  if (!response.ok) throw new Error(`Merit list index fetch failed: ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);

  const entries = [];
  $("table").each((_, table) => {
    $(table)
      .find("tbody tr")
      .each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 7) return; // expected columns nahi milay, skip

        const createdDate = $(cells[1]).text().trim();
        const program = $(cells[2]).text().trim();
        const shift = $(cells[3]).text().trim();
        const quota = $(cells[4]).text().trim();
        const meritListNumber = $(cells[5]).text().trim();
        const lastDate = $(cells[6]).text().trim();
        const detailUrl = $(cells[7]).find("a").attr("href") || "";

        if (program) {
          entries.push({ createdDate, program, shift, quota, meritListNumber, lastDate, detailUrl });
        }
      });
  });

  meritIndexCache = { data: entries, fetchedAt: now };
  return entries;
}

async function fetchMeritListDetail(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Merit list detail fetch failed: ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);

  let instructions = {
    campus: null,
    deadline: null,
    rawText: null,
  };

  const pageText = $("body").text();

  if (/Main\s+Campus/i.test(pageText)) {
    instructions.campus = "Main Campus";
  } else if (/City\s+Campus/i.test(pageText)) {
    instructions.campus = "City Campus";
  } else if (/Library/i.test(pageText)) {
    const libMatch = pageText.match(/(?:visit|report to|come to)[^.]*library[^.]*/i);
    instructions.campus = libMatch ? libMatch[0].trim() : "Library";
  }

  const dateMatch = pageText.match(/on\s+or\s+before\s+([\d\-\/]+(?:\s+\w+\s+\d{4})?)/i);
  if (dateMatch) instructions.deadline = dateMatch[1].trim();

  instructions.rawText = pageText.slice(0, 1000);

  const rows = [];
  $("table tbody tr").each((_, row) => {
    const cells = $(row).find("td");
    if (cells.length < 9) return;

    rows.push({
      srNo: $(cells[0]).text().trim(),
      formNo: $(cells[1]).text().trim(),
      studentName: $(cells[2]).text().trim(),
      fatherName: $(cells[3]).text().trim(),
      interObtain: $(cells[4]).text().trim(),
      interTotal: $(cells[5]).text().trim(),
      matricObtain: $(cells[6]).text().trim(),
      matricTotal: $(cells[7]).text().trim(),
      hafizQuran: $(cells[8]).text().trim(),
      meritPercent: cells[9] ? $(cells[9]).text().trim() : "",
    });
  });

  return { rows, instructions };
}

const MERIT_KEYWORDS = [
  "merit list", "merit lists", "1st merit", "2nd merit", "3rd merit", "first merit",
  "second merit", "third merit", "merit aa", "list aa", "list nikal", "result aa",
  "selected list", "provisional",
];

function isMeritListQuery(messages) {
  const recentText = messages.slice(-4).map((m) => m.content).join(" ").toLowerCase();
  return MERIT_KEYWORDS.some((keyword) => recentText.includes(keyword));
}

async function buildMeritListContext() {
  try {
    const entries = await fetchMeritListIndex();
    if (entries.length === 0) {
      return `\n\nLIVE MERIT LIST STATUS (fetched just now from ul.edu.pk):
No merit lists are currently published on the website.`;
    }

    const summary = entries
      .map((e) => `- ${e.program} (${e.shift}, ${e.quota}): ${e.meritListNumber} — created ${e.createdDate}, confirm admission by ${e.lastDate}`)
      .join("\n");

    return `\n\nLIVE MERIT LIST STATUS (fetched just now from ul.edu.pk — this is REAL, current data. Answer directly and confidently from it. NEVER say you don't have access to live data or documents — you DO, it's right here):
${summary}

IMPORTANT: If a student wants to search for their own name/result, do NOT try to search it yourself in the chat. Tell them clearly to use the "Merit List Checker" in the sidebar (left menu) — they can pick their program there and instantly find their result.`;
  } catch (err) {
    console.error("[Merit List Context Error]", err);
    return `\n\nLIVE MERIT LIST STATUS: Could not reach ul.edu.pk right now. Tell the student to check https://ul.edu.pk/program_merit_list directly, or try again in a moment.`;
  }
}

// ===== QUOTA RESET TIME CALCULATOR =====
function getQuotaResetTime() {
  const now = new Date();
 
  const ptString = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const ptNow = new Date(ptString);
 
  const nextMidnightPT = new Date(ptNow);
  nextMidnightPT.setHours(24, 0, 0, 0);
 
  // PT aur local server time ke beech farak (ms mein) nikalo, taake real UTC instant mil jaye
  const ptOffsetMs = now.getTime() - ptNow.getTime();
  const actualResetInstant = new Date(nextMidnightPT.getTime() + ptOffsetMs);
 
  // Ab yeh real instant Pakistan Time mein format karo
  const formatted = actualResetInstant.toLocaleString("en-US", {
    timeZone: "Asia/Karachi",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
 
  const hoursRemaining = Math.round(((actualResetInstant - now) / 3600000) * 10) / 10;
 
  return { formatted, hoursRemaining };
}
 
// ============================================================
// TOKEN USAGE TRACKER (permanent) — file mein persist hota hai
// ============================================================
// humara apna tracked estimate hai, jo Gemini ke har response ke "usageMetadata" se count karta hai.
const DAILY_TOKEN_BUDGET = 250000;
const USAGE_FILE = path.join(__dirname, "token-usage.json");

let usageHistory = [];
let usageTrackerDatePT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });

try {
  if (fs.existsSync(USAGE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    usageHistory = Array.isArray(saved) ? saved : [saved];
    console.log(`✅ Token usage history load hui — ${usageHistory.length} din ka record mila.`);
  }
} catch (err) {
  console.error("⚠️ Token usage file load nahi ho saki:", err.message);
}

function getTodayEntry() {
  let entry = usageHistory.find((e) => e.date === usageTrackerDatePT);
  if (!entry) {
    entry = { date: usageTrackerDatePT, used: 0 };
    usageHistory.push(entry);
  }
  return entry;
}

function saveUsageToFile() {
  fs.writeFile(USAGE_FILE, JSON.stringify(usageHistory, null, 2), (err) => {
    if (err) console.error("⚠️ Token usage file save nahi ho saki:", err.message);
  });
}

// ============================================================
// FEEDBACK SYSTEM (5-star rating + bug/feature/general messages)
// ============================================================
let cachedTransporter = null;
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) throw new Error("GMAIL_USER / GMAIL_APP_PASSWORD not configured");
  cachedTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return cachedTransporter;
}

async function sendFeedbackEmail(entry) {
  const transporter = getTransporter();
  const categoryLabel = { general: "💬 General Feedback", bug: "🐛 Bug Report", feature: "✨ Feature Request" };
  const stars = "★".repeat(entry.rating) + "☆".repeat(5 - entry.rating);

  await transporter.sendMail({
    from: `"UL AI Feedback" <${process.env.GMAIL_USER}>`,
    to: process.env.FEEDBACK_EMAIL_TO || process.env.GMAIL_USER,
    subject: `${categoryLabel[entry.category]} — ${entry.rating}/5 stars`,
    text: `Rating: ${stars} (${entry.rating}/5)
Category: ${categoryLabel[entry.category]}
${entry.name ? `Name: ${entry.name}\n` : ""}Time: ${new Date(entry.timestamp).toLocaleString()}
Device: ${entry.deviceId || "unknown"}

Message:
${entry.message || "(no message provided)"}`,
  });
}

// ============================================================
// ERROR ALERT EMAIL 
// ============================================================
const ERROR_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minute
let lastErrorAlertSentAt = 0;

async function sendErrorAlertEmail({ endpoint, errorMessage, deviceId }) {
  const now = Date.now();
  if (now - lastErrorAlertSentAt < ERROR_ALERT_COOLDOWN_MS) return;
  lastErrorAlertSentAt = now;

  try {
    const transporter = getTransporter();
    await transporter.sendMail({
      from: `"UL AI Alerts" <${process.env.GMAIL_USER}>`,
      to: process.env.FEEDBACK_EMAIL_TO || process.env.GMAIL_USER,
      subject: `🚨 UL AI Server Error — ${endpoint}`,
      text: `Endpoint: ${endpoint}
Time: ${new Date().toLocaleString()}
Device: ${deviceId || "unknown"}

--- Error ---
${errorMessage}`,
    });
  } catch (emailErr) {
    console.error("[Error Alert Email Failed]", emailErr);
  }
}

// ============================================================
function trackTokenUsage(usageMetadata) {
  const todayPT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  if (todayPT !== usageTrackerDatePT) {
    usageTrackerDatePT = todayPT;
  }
  const entry = getTodayEntry();
  if (usageMetadata?.totalTokenCount) {
    entry.used += usageMetadata.totalTokenCount;
  }
  saveUsageToFile();
}

function getUsageSnapshot() {
  const todayPT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  if (todayPT !== usageTrackerDatePT) {
    usageTrackerDatePT = todayPT;
    saveUsageToFile();
  }
  const entry = getTodayEntry();
  const percent = Math.min(100, Math.round((entry.used / DAILY_TOKEN_BUDGET) * 100));
  return { used: entry.used, limit: DAILY_TOKEN_BUDGET, percent };
}

// ============================================================
// PAST PAPERS 
// ============================================================
const DRIVE_API_KEY = process.env.DRIVE_API_KEY;
const DRIVE_ROOT_FOLDER_ID = process.env.DRIVE_ROOT_FOLDER_ID;

if (!DRIVE_API_KEY || !DRIVE_ROOT_FOLDER_ID) {
  console.error("⚠️ DRIVE_API_KEY / DRIVE_ROOT_FOLDER_ID .env mein nahi mili — Past Paper Analyzer kaam nahi karega.");
}

const PAPERS_CACHE_TTL_MS = 10 * 60 * 1000;
let programFoldersCache = { data: null, fetchedAt: 0 };
let paperListCache = {}; 

async function driveApiRequest(query, fields = "files(id,name,mimeType)") {
  const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&key=${DRIVE_API_KEY}&fields=${encodeURIComponent(fields)}&pageSize=1000`;
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Drive API error ${response.status}`);
  }
  return data.files || [];
}

// Root folder ke andar program-subfolders list karo (ye hi "Program" dropdown banayega)
async function fetchProgramFolders() {
  const now = Date.now();
  if (programFoldersCache.data && now - programFoldersCache.fetchedAt < PAPERS_CACHE_TTL_MS) {
    return programFoldersCache.data;
  }

  const query = `'${DRIVE_ROOT_FOLDER_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const folders = await driveApiRequest(query);

  const programs = folders.map((f) => ({
    name: f.name.replace(/_/g, " "),
    folderId: f.id,
  }));

  programFoldersCache = { data: programs, fetchedAt: now };
  return programs;
}

async function fetchPapersForProgram(programFolderId) {
  const now = Date.now();
  const cached = paperListCache[programFolderId];
  if (cached && now - cached.fetchedAt < PAPERS_CACHE_TTL_MS) {
    return cached.data;
  }

  const query = `'${programFolderId}' in parents and mimeType='application/pdf' and trashed=false`;
  const files = await driveApiRequest(query);

  const papers = files.map((f) => parsePaperFilename(f.name, f.id)).filter(Boolean);

  paperListCache[programFolderId] = { data: papers, fetchedAt: now };
  return papers;
}

// Expected: Sem{N}_{Year}_{Subject}_{ExamType}_{PaperNo}.pdf
function parsePaperFilename(fileName, fileId) {
  const match = fileName.match(/^Sem(\d+)_(\d{4})_([A-Za-z0-9]+)_(Mid|Final|Quiz)_(\d+)\.pdf$/i);
  if (!match) {
    console.warn(`[Past Papers] Naming format se match nahi hua, skip kiya: ${fileName}`);
    return null;
  }

  const [, semester, year, subjectRaw, examType, paperNo] = match;
  const subject = subjectRaw.replace(/([a-z0-9])([A-Z])/g, "$1 $2");

  return {
    fileId,
    semester: parseInt(semester, 10),
    year: parseInt(year, 10),
    subject,
    examType,
    paperNo: parseInt(paperNo, 10),
  };
}

// ===== PAST PAPERS — PROGRAMS LIST (dropdown ke liye) =====
app.get("/api/papers/programs", async (req, res) => {
  try {
    const programs = await fetchProgramFolders();
    res.json({ programs });
  } catch (err) {
    console.error("[Server Error - Papers Programs]", err);
    res.status(500).json({ error: sanitizeError(err.message || "Could not load programs.") });
  }
});

// ===== PAST PAPERS — SPECIFIC PROGRAM KE PAPERS =====
app.get("/api/papers/list", async (req, res) => {
  try {
    const { folderId } = req.query;
    if (!folderId) return res.status(400).json({ error: "folderId is required." });

    const papers = await fetchPapersForProgram(folderId);
    papers.sort((a, b) => b.year - a.year || b.semester - a.semester || a.subject.localeCompare(b.subject));
    res.json({ papers });
  } catch (err) {
    console.error("[Server Error - Papers List]", err);
    res.status(500).json({ error: sanitizeError(err.message || "Could not load papers.") });
  }
});

// ============================================================
// GEMINI / GROQ ki RPD/RPM tracking ab dono keyPool.js (geminiPool, groqPool)
// ============================================================

let fallbackNotifiedDatePT = null;

function shouldNotifyFallback() {
  const todayPT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  if (fallbackNotifiedDatePT !== todayPT) {
    fallbackNotifiedDatePT = todayPT;
    return true; // aaj ka pehla switch — notify karo
  }
  return false;
}

// ===== GROQ BACKUP CALL (multi-key pool ke sath) =====
async function callGroqChat(messages, userName, groqKeyEntry) {
  const userNameNote = userName
    ? `\n\nCURRENT USER INFO:\n- User ka naam: ${userName}\n- Responses mein kabhi kabhi unhe "${userName}" keh kar address karo — especially jab koi naya topic start ho, koi important info do, ya koi warm/encouraging baat ho. Har message mein naam lena zaroori nahi — sirf jab natural lage.`
    : "";
  const feeContext = isFeeRelatedQuery(messages) ? "\n\n" + FEE_CONTEXT : "";
  const meritContext = isMeritListQuery(messages) ? await buildMeritListContext() : "";

  async function attemptGroqCall(historyLimit) {
    // Sirf instantly jawab dena hai, isliye sirf recent messages bhejte hain last conversation nhi.
    const trimmedMessages = messages.slice(-historyLimit);

    const groqMessages = [
      { role: "system", content: UNIVERSITY_CONTEXT + feeContext + meritContext + userNameNote },
      ...trimmedMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groqKeyEntry.key}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 2048,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Groq Error - ${groqKeyEntry.label}]`, data);
      const err = new Error(data.error?.message || `Groq API Error ${response.status}`);
      err.isTpmError = data.error?.code === "rate_limit_exceeded" && data.error?.type === "tokens";
      err.isQuotaError =
        response.status === 429 &&
        !err.isTpmError; // TPM ek alag category hai — agli key try karne ki bajaye trimmed retry behtar hai
      throw err;
    }

    let content = data.choices?.[0]?.message?.content || "No response received.";
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    return content;
  }

  try {
    const reply = await attemptGroqCall(8); // normal case — last 8 messages
    groqPool.recordAttempt(groqKeyEntry);
    return reply;
  } catch (err) {
    if (err.isTpmError) {
      // Bohot lambi conversation/message ki wajah se abhi bhi TPM cross ho gaya —
      // sirf latest question ke sath ek aakhri koshish karo (system prompt + last message)
      console.warn(`[Groq] TPM limit phir bhi cross hui (${groqKeyEntry.label}) — sirf latest message ke sath retry.`);
      const reply = await attemptGroqCall(1);
      groqPool.recordAttempt(groqKeyEntry);
      return reply;
    }
    throw err;
  }
}

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: "5mb" })); 
app.use(express.static(path.join(__dirname)));
 
// ===== PER-IP RATE LIMITING (taake ek user spam kare to sab ke liye quota khatam na ho) =====
// ===== RATE LIMIT KEY =====
function getRateLimitKey(req) {
  const id = req.body?.deviceId;
  if (typeof id === "string" && id.length > 0 && id.length <= 100) {
    return `dev:${id}`;
  }
  return `ip:${req.ip}`;
}

// Short-term limit: 1 minute mein zyada se zyada 8 messages per device (spam/bot protection)
const minuteLimiter = rateLimit({
  windowMs: 60 * 1000, 
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  validate: false,
  message: {
    error: "Too many messages were sent in a short time. Please wait a minute and try again.",
    rateLimited: true,
  },
});

const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  validate: false,
  message: {
    error: "You've reached your daily usage limit. Please try again tomorrow, or visit ul.edu.pk directly.",
    rateLimited: true,
  },
});
 
const feedbackLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  validate: false,
  message: {
    error: "You've reached today's feedback limit. Please try again tomorrow.",
    rateLimited: true,
  },
});

// ===== CHAT ENDPOINT =====
app.post("/api/chat", minuteLimiter, dailyLimiter, async (req, res) => {
  try {
    const { messages, userName } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    let reply;
    let usage = null;
    let provider = "gemini";
    let usedKeyLabel = null;

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const lastMsg = messages[messages.length - 1];

    const userNameNote = userName
      ? `\n\nCURRENT USER INFO:\n- User ka naam: ${userName}\n- Responses mein kabhi kabhi unhe "${userName}" keh kar address karo — especially jab koi naya topic start ho, koi important info do, ya koi warm/encouraging baat ho. Har message mein naam lena zaroori nahi — sirf jab natural lage.`
      : "";
    const feeContext = isFeeRelatedQuery(messages) ? "\n\n" + FEE_CONTEXT : "";
    const meritContext = isMeritListQuery(messages) ? await buildMeritListContext() : "";
    const contextWithName = UNIVERSITY_CONTEXT + feeContext + meritContext + userNameNote;

    async function attemptGemini(keyEntry) {
      geminiPool.recordAttempt(keyEntry);

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${keyEntry.key}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: contextWithName }] },
          contents: [...history, { role: "user", parts: [{ text: lastMsg.content }] }],
          generationConfig: { maxOutputTokens: 2048, temperature: 0.7 },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error(`[Gemini Error - ${keyEntry.label}]`, data);
        const msg = data.error?.message || `API Error ${response.status}`;
        const isQuotaError =
          response.status === 429 ||
          msg.toLowerCase().includes("quota") ||
          msg.toLowerCase().includes("rate limit");

        const err = new Error(msg);
        err.quotaExceeded = isQuotaError;
        throw err;
      }

      return data;
    }

    // ===== GEMINI: pool ki har available key try karo jab tak koi kaam kar jaye =====
    let geminiKeyEntry = geminiPool.getAvailableKey();
    let triedAnyGemini = false;

    while (geminiKeyEntry) {
      triedAnyGemini = true;
      try {
        const data = await attemptGemini(geminiKeyEntry);
        reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
        trackTokenUsage(data.usageMetadata);
        usage = getUsageSnapshot();
        usedKeyLabel = geminiKeyEntry.label;
        break; // success — loop se nikal jao
      } catch (err) {
        if (err.quotaExceeded) {
          geminiPool.markExhausted(geminiKeyEntry);
          geminiKeyEntry = geminiPool.getNextAvailableKey(geminiKeyEntry.label);
          continue; // agli key try karo
        }
        throw err; // koi aur (non-quota) error — seedha upar throw karo
      }
    }

    if (!reply) {
      // Saari Gemini keys exhaust ho gayi (ya koi key configure hi nahi thi) — Groq pe jao
      if (triedAnyGemini) {
        console.warn("[Fallback] Gemini pool ki saari keys exhaust — Groq (backup) pe switch ho raha hai.");
      } else {
        console.log("[Fallback] Koi Gemini key available nahi thi — seedha Groq use ho raha hai.");
      }
      provider = "groq";
    }

    if (provider === "groq") {
      if (!groqPool.hasAnyKey()) {
        const resetInfo = getQuotaResetTime();
        return res.status(429).json({
          error: "Gemini ki free limit khatam ho gayi hai, aur backup (Groq) configure nahi hai.",
          quotaExceeded: true,
          resetTimePKT: resetInfo.formatted,
          hoursRemaining: resetInfo.hoursRemaining,
        });
      }

      if (shouldNotifyFallback()) {
        return res.json({
          reply: `⚡ **Switching to Backup Model**

The default AI model has reached its free daily limit for today.
The system is automatically switching to a backup model so you can keep chatting normally.

> Please send your message again to get your answer.`,
          usage: null,
          provider: "groq",
          isFirstFallback: true,
        });
      }

      // ===== GROQ: pool ki har available key try karo jab tak koi kaam kar jaye =====
      let groqKeyEntry = groqPool.getAvailableKey();
      if (!groqKeyEntry) {
        const resetInfo = getQuotaResetTime();
        return res.status(429).json({
          error: "Gemini aur Groq — dono ki saari keys ki aaj ki limit khatam ho chuki hai.",
          quotaExceeded: true,
          resetTimePKT: resetInfo.formatted,
          hoursRemaining: resetInfo.hoursRemaining,
        });
      }

      while (groqKeyEntry) {
        try {
          reply = await callGroqChat(messages, userName, groqKeyEntry);
          usedKeyLabel = groqKeyEntry.label;
          break;
        } catch (err) {
          if (err.isQuotaError) {
            groqPool.markExhausted(groqKeyEntry);
            groqKeyEntry = groqPool.getNextAvailableKey(groqKeyEntry.label);
            continue;
          }
          throw err;
        }
      }

      if (!reply) {
        const resetInfo = getQuotaResetTime();
        return res.status(429).json({
          error: "Gemini aur Groq — dono ki saari keys ki aaj ki limit khatam ho chuki hai.",
          quotaExceeded: true,
          resetTimePKT: resetInfo.formatted,
          hoursRemaining: resetInfo.hoursRemaining,
        });
      }
    }

    res.json({ reply, usage, provider, isFirstFallback: false });
  } catch (err) {
    console.error("[Server Error]", err);
    sendErrorAlertEmail({
      endpoint: "/api/chat",
      errorMessage: err.stack || err.message || String(err),
      deviceId: req.body?.deviceId,
    }); // fire-and-forget — user ke response ko delay/block nahi karna
    res.status(500).json({ error: sanitizeError(err.message || "Internal server error") });
  }
});
 
// ===== PDF CHAT ENDPOINT =====
app.post("/api/pdf-chat", minuteLimiter, dailyLimiter, async (req, res) => {
  try {
    const { messages, pdfText, userName } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }
    if (!pdfText || typeof pdfText !== "string" || pdfText.trim().length === 0) {
      return res.status(400).json({ error: "pdfText required" });
    }

    const history = messages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));
    const lastMsg = messages[messages.length - 1];

    const MAX_PDF_CHARS = 60000;
    const safePdfText = pdfText.length > MAX_PDF_CHARS ? pdfText.slice(0, MAX_PDF_CHARS) : pdfText;

    const systemInstruction = `${PDF_CHAT_SYSTEM_PROMPT}\n\n=== UPLOADED PDF CONTENT (extracted text) ===\n${safePdfText}\n=== END OF PDF CONTENT ===`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${PDF_API_KEY}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [...history, { role: "user", parts: [{ text: lastMsg.content }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[Gemini PDF Chat Error]", data);
      const msg = data.error?.message || `API Error ${response.status}`;

      const isQuotaError =
        response.status === 429 ||
        msg.toLowerCase().includes("quota") ||
        msg.toLowerCase().includes("rate limit");

      if (isQuotaError) {
        const resetInfo = getQuotaResetTime();
        return res.status(429).json({
          error: sanitizeError(msg),
          quotaExceeded: true,
          resetTimePKT: resetInfo.formatted,
          hoursRemaining: resetInfo.hoursRemaining,
        });
      }

      return res.status(response.status).json({ error: sanitizeError(msg) });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
    trackTokenUsage(data.usageMetadata);
    res.json({ reply, usage: getUsageSnapshot() });
  } catch (err) {
    console.error("[Server Error - PDF Chat]", err);
    sendErrorAlertEmail({
      endpoint: "/api/pdf-chat",
      errorMessage: err.stack || err.message || String(err),
      deviceId: req.body?.deviceId,
    }); // fire-and-forget — user ke response ko delay/block nahi karna
    res.status(500).json({ error: sanitizeError(err.message || "Internal server error") });
  }
});

// ===== FEEDBACK ENDPOINT =====
app.post("/api/feedback", feedbackLimiter, async (req, res) => {
  try {
    const { rating, category, message, deviceId, name } = req.body;

    const ratingNum = Number(rating);
    if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
      return res.status(400).json({ error: "Rating must be an integer between 1 and 5." });
    }

    const validCategories = ["general", "bug", "feature"];
    const safeCategory = validCategories.includes(category) ? category : "general";

    const safeName = typeof name === "string" ? name.trim().slice(0, 50) : "";
    const safeMessage = typeof message === "string" ? message.trim().slice(0, 2000) : "";

    const entry = {
      name: safeName,
      rating: ratingNum,
      category: safeCategory,
      message: safeMessage,
      deviceId: typeof deviceId === "string" ? deviceId.slice(0, 100) : null,
      timestamp: new Date().toISOString(),
    };

    await sendFeedbackEmail(entry);

    res.json({ success: true });
  } catch (err) {
    console.error("[Server Error - Feedback]", err);
    res.status(500).json({ error: sanitizeError(err.message || "Internal server error") });
  }
});

// ===== MERIT LIST CHECKER — programs list =====
app.get("/api/merit-programs", async (req, res) => {
  try {
    const entries = await fetchMeritListIndex();
    const programs = [...new Set(entries.map((e) => e.program))].sort();
    res.json({ programs });
  } catch (err) {
    console.error("[Server Error - Merit Programs]", err);
    res.status(500).json({ error: sanitizeError(err.message || "Could not load programs.") });
  }
});

// ===== MERIT LIST CHECKER — deterministic search (koi AI involved nahi) =====
app.post("/api/merit-search", async (req, res) => {
  try {
    const { program, query } = req.body;

    if (!program || typeof program !== "string") {
      return res.status(400).json({ error: "Program is required." });
    }
    if (!query || typeof query !== "string" || query.trim().length === 0) {
      return res.status(400).json({ error: "Please enter your name or form number." });
    }

    const entries = await fetchMeritListIndex();
    const matchingEntries = entries.filter((e) => e.program === program);

    if (matchingEntries.length === 0) {
      return res.json({ found: false, message: `No merit list has been published yet for ${program}.` });
    }

    const searchTerm = query.trim().toLowerCase();
    const allMatches = [];

    for (const entry of matchingEntries) {
      if (!entry.detailUrl) continue;
       const { rows, instructions } = await fetchMeritListDetail(entry.detailUrl);
      const matches = rows.filter(
        (r) => r.formNo.toLowerCase() === searchTerm || r.studentName.toLowerCase().includes(searchTerm)
      );
      matches.forEach((m) =>
        allMatches.push({ ...m, meritListNumber: entry.meritListNumber, shift: entry.shift, lastDate: entry.lastDate, campus: instructions.campus, deadline: instructions.deadline })
      );
    }

    if (allMatches.length === 0) {
      return res.json({
        found: false,
        message: `No match found for "${query}" in ${program}'s published merit list(s). This could mean you weren't selected in this list yet, or there's a typo,  double check your Form No.`,
      });
    }

    res.json({ found: true, matches: allMatches });
  } catch (err) {
    console.error("[Server Error - Merit Search]", err);
    res.status(500).json({ error: sanitizeError(err.message || "Search failed.") });
  }
});

// ===== HEALTH CHECK =====
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", model: GEMINI_MODEL });
});

app.get("/api/usage", (req, res) => {
  res.json(getUsageSnapshot());
});

// ===== KEY POOL STATUS (debugging ke liye — kaunsi key kitni use hui) =====
app.get("/api/keys-status", (req, res) => {
  res.json({
    gemini: geminiPool.getStatus(),
    groq: groqPool.getStatus(),
  });
});

// ===== Costome 500 Error ====== Direct /500 URL se bhi dekha ja sake (testing ke liye)
app.get("/500", (req, res) => {
  res.status(500).sendFile(path.join(__dirname, "500.html"));
});

// ===== Status =====
app.get("/api/status", (req, res) => {
  res.json({environment:process.env.NODE_ENV === "production" ? "production" : "development"}); 
});

// ===== GLOBAL ERROR-HANDLING MIDDLEWARE =====
app.use((err, req, res, next) => {
  console.error("[Unhandled Error]", err);
  sendErrorAlertEmail({
    endpoint: req.originalUrl,
    errorMessage: err.stack || err.message || String(err),
    deviceId: req.body?.deviceId || req.query?.deviceId,
  });

  // API request thi (JSON chahiye) to JSON error do — HTML page nahi
  if (req.originalUrl.startsWith("/api/")) {
    return res.status(500).json({ error: sanitizeError(err.message || "Internal server error") });
  }

  // Warna (normal page request) — branded 500 page dikhao
  res.status(500).sendFile(path.join(__dirname, "500.html"));
});

app.listen(PORT, () => {
  console.log(`✅ UL AI server chal raha hai: http://localhost:${PORT}`);
});