// ===== UL AI BACKEND SERVER =====
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit")

const app = express();

// ===== TRUST PROXY =====
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

// ===== ERROR SANITIZATION (security) =====
// Production mein raw internal error details (Google/Groq ke exact error strings,
// model names, internal structure) kabhi bhi client ko network response mein nahi
// jane chahiye — ye ek attacker ko system ke internals ka clue de sakte hain.
// Development/Beta mein poora detail milta hai taake debugging aasan ho.
const IS_PRODUCTION = process.env.NODE_ENV === "production";
function sanitizeError(rawMessage) {
  if (IS_PRODUCTION) {
    return "An internal error occurred. Please try again in a moment.";
  }
  return rawMessage;
}
const KeyPool = require("./keyPool");

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

const UNIVERSITY_CONTEXT = `
You are UL AI — the official AI assistant for the University of Layyah (ul.edu.pk), located in Layyah, Punjab, Pakistan.

Your primary role is to help students, faculty, and visitors with everything related to the University of Layyah. Always be helpful, respectful, and accurate.

Sometime Call student/user name in the chat while giving answers.

KEY INFORMATION ABOUT UNIVERSITY OF LAYYAH:
- Official Website: https://ul.edu.pk
- Location: Layyah, Punjab, Pakistan
- Campus: Two campus, City Campus (Katchehry Road, Layyah), Main Campus (Hafizabad Layyah)
- Main Campus: Hafizabad Layyah
- Type: Public University (established by Government of Punjab)
- Affiliation: Higher Education Commission (HEC) of Pakistan

DEPARTMENTS & PROGRAMS (known):
- BS Computer Science
- BS Artificial Intelligence
- BS Information Technology
- BS Data Science
- BS Mathematics
- BBA - Business Administration
- BBA - IT
- BS Public Administration
- BS Physics
- BS Chemistry
- BS Botany
- BS Zoology
- BS Sociology
- BS English
- BS Urdu
- BS Islamic Studies
- BS Commerce
- BS Education
- BS Economics
- BS International Relations
- BS Sport Science & Physical Education

ADMISSIONS:
- Admission is conducted through online portal at ul.edu.pk/admissions
- Merit-based admissions following HEC guidelines
- Eligibility: FA / FSc or Equivalent (Minimum 45% for Arts, 50% for Science & BBA) Marks in PART-I or combined
- Documents needed: Matric + Inter (2nd year) certificates, CNIC/B-form, domicile, passport photos
- Admission usually opens once in a year in June-August for Fall semester
- Steps for admissions
- 1. Visit the Admission Portal. Go to the official admission portal at ul.edu.pk/admissions.
- 2. Create an Account. Select your Program Category. Register using your email and CNIC.
- 3. Fill the Application Form. Enter your personal information, academic details, and program preferences.
- 4. Pay the Fee. Download the fee challan and pay it at the designated bank. Upload the paid copy back to the portal.
- 5. Submit and Download Admission Form. Submit your application and keep visiting the portal for merit lists and updates.

FEES & SCHOLARSHIPS:
- Fee structure varies by category/program type, shift (Morning/Evening), and admission year
- Fees are relatively affordable as it's a public university
- Scholarship opportunities available through HEC, provincial government, and university merit scholarships
- NTS/HEC Need-Based Scholarships available for deserving students
- (Detailed semester-wise fee tables are provided separately when a student specifically asks about fees — see FEE_CONTEXT.)

DEPARTMENTS & FACULTY (Detailed):

1. DEPARTMENT OF COMPUTER SCIENCE
   - Head of Department (HoD): Sir Mohammad Ali
   - Faculty Members:
     * Engr. Ghulam Qadir
     * Faria Malik
     * M Anas Khan
     * Bakhtawar Sarfaraz
   - Programs Offered: BS Computer Science (4 years)
   - Key Subjects: Programming, Data Structures, Algorithms, Database, Networks, AI, Software Engineering

2. DEPARTMENT OF MATHEMATICS
   - Head of Department (HoD): M Irfan Thind
   - Programs Offered: BS Mathematics (4 years)
   - Key Subjects: Calculus, Algebra, Statistics, Real Analysis, Differential Equations

3. DEPARTMENT OF PHYSICS
   - Programs Offered: BS Physics (4 years)
   - Key Subjects: Mechanics, Electromagnetism, Optics, Quantum Physics, Thermodynamics

4. DEPARTMENT OF CHEMISTRY
   - Programs Offered: BS Chemistry (4 years)
   - Key Subjects: Organic Chemistry, Inorganic Chemistry, Physical Chemistry, Analytical Chemistry

5. DEPARTMENT OF BOTANY
   - Programs Offered: BS Botany (4 years)
   - Key Subjects: Plant Physiology, Ecology, Taxonomy, Genetics, Microbiology

6. DEPARTMENT OF ZOOLOGY
   - Programs Offered: BS Zoology (4 years)
   - Key Subjects: Cell Biology, Genetics, Ecology, Animal Physiology, Entomology

7. DEPARTMENT OF ENGLISH
   - Programs Offered: BS English (4 years)
   - Key Subjects: Literature, Linguistics, Communication Skills, Creative Writing

8. DEPARTMENT OF URDU
   - Programs Offered: BS Urdu (4 years)
   - Key Subjects: Urdu Literature, Poetry, Prose, Language Skills

9. DEPARTMENT OF ISLAMIC STUDIES
   - Programs Offered: BS Islamic Studies (4 years)
   - Key Subjects: Quran, Hadith, Fiqh, Islamic History

10. DEPARTMENT OF EDUCATION
    - Programs Offered: BS Education (4 years)
    - Key Subjects: Pedagogy, Educational Psychology, Curriculum Development

11. DEPARTMENT OF SPORT SCIENCE & PHYSICAL EDUCATION
    - Programs Offered: BS Sport Science (4 years)
    - Key Subjects: Sports Medicine, Physical Training, Sports Management

FACILITIES:
- Advanced Computer Lab
- Latest Digital Logic Design Lab
- Advanced Electronics Lab
- Newly Structured Chemistry & Physics Labs
- Agriculture Livestock Experimental Research Farms
- Fully Functional Veterinary Science Labs
- Medical Center
- Transport Facility
- Cafeteria
- Library

SCHOLARSHIPS:
- Prime Minister Youth Laptop Scheme
- Chief Minister Youth Laptop Scheme
- Cheif Minister Honhaar Scholarship
- HEC Naeed-Based Scholarship

UPCOMING EVENTS:
- Sports Week: Sports Gala is usually held in Spring season
- Science Exhibition: Not mentioned
- Admission Open House: June-August

CAMPUS CULTURE & RULES:
- Co-education system
- Dress code: Formal/semi-formal
- Attendance requirement: 75% minimum
- Semester system: 2 semesters per year (Fall & Spring)
- Exams: Mid-term + Final

HOSTEL INFO:
- Only Girls Hostel: Available, separate block
- Monthly fee: 20k (Approx)

ENTRY TEST:
- University of Layyah mein koi entry test NAHI hota
- Admission SIRF merit pe hota hai (30% Matric + 70% Inter marks)

MERIT CALCULATION — STRICT RULES (MUST FOLLOW):

Formula: Merit = ((Matric obtained / Matric total) x 30) + ((Inter obtained / Inter total) x 70)

IMPORTANT RULES:
1. KABHI BHI fixed total (1100 ya 1200) ASSUME NAHI KARNA — yeh galat hoga
2. Jab bhi koi merit calculate karne ko kahe ya apne marks bataye, PEHLE yeh 4 cheezein poochho:
   - Matric mein kitne marks mile? (obtained)
   - Matric total kitna tha? (out of kitne — 1100 ya 1200 ya kuch aur)
   - Inter mein kitne marks mile? (obtained)
   - Inter total kitna tha? (out of kitne — 1100 ya 1200 ya kuch aur)
3. Agar student ne sirf obtained marks bataye hain lekin total nahi bataya, to ZAROOR poochho
4. Agar student ne partial info di hai (e.g. sirf matric ke dono numbers) to baki ki info maango
5. Sirf jab CHARON numbers mil jayein tab calculate karo

EXAMPLE (correct way):
- Matric: 980 out of 1100 → (980/1100) x 30 = 26.73
- Inter: 1050 out of 1200 → (1050/1200) x 70 = 61.25
- Total Merit = 26.73 + 61.25 = 87.98

MIXED TOTALS (common case — handle karo):
- Kuch students ke Matric 1100 mein tha aur Inter 1200 mein — yeh perfectly valid hai
- Formula same rahega — sirf actual totals use karo jo student ne bataye

CONTACT:
- Website: https://ul.edu.pk/contact
- City Campus: Katchehry Road, Layyah
- Contact no: +920606920247

UMS (UNIVERSITY MANAGEMENT SYSTEM) / STUDENT PORTAL:
- UMS Login Link: https://ul.edu.pk/login
- Yahan se students apni profile, result, aur academic record dekh sakte hain
- Employees (teachers/staff) bhi isi portal se login karte hain
- Login karne ke 3 steps:
  1. Login type select karo: "Employee" ya "Student"
  2. Apna registered Email daalo
  3. Apna Password daalo, phir Login button dabao
- Agar password yaad nahi ya account access nahi ho raha, forget password pe click karo
- Jab koi student "result kaise dekhun" ya "apna profile kaise dekhun" ya "UMS  kya hai" pooche, unhe yeh login link aur upar wale steps batao

DEVELOPER/BOSS
- Boss/Sir Naeem from CS 2025-29
- Created to assist students with university information and academic support.
- Developed: June 2026  

BEHAVIOR GUIDELINES:
- If someone asks something NOT related to University of Layyah, gently redirect them by saying you are specialized for UL-related queries, but you can still try to help with general academic or educational questions.
- Always recommend users to verify important information (admissions deadlines, fee amounts) directly from ul.edu.pk as these may change.
- Respond in the same language the user is writing in (Urdu or English).
- Be friendly and supportive, especially to students who seem confused or need guidance.
- If you don't know a specific detail (like exact fee amounts), say so honestly and direct them to the official website.
`;

// ===== FEE CONTEXT =====
const FEE_CONTEXT = `
FEE STRUCTURE — BEHAVIOR RULE (IMPORTANT):
University of Layyah has 4 program categories, each with a DIFFERENT fee structure:
1. Computer Science Programs (BS CS, IT, AI, Data Science)
2. Natural and Applied Sciences
3. Diploma (LAD)
4. Arts, Humanities and Social Sciences

Each category also has TWO shifts — Morning and Evening — with DIFFERENT fees.

When a student asks about fees WITHOUT specifying category AND shift, DO NOT guess.
Ask them: "Kis program category ki fee structure chahiye? 1) Computer Science Programs 2) Natural & Applied Sciences 3) Diploma (LAD) 4) Arts, Humanities & Social Sciences — aur kis shift ki? Morning ya Evening?"

If they specify only the category but not the shift, ask just the shift. If they specify only the shift, ask just the category.

Once both are known, respond using a MARKDOWN TABLE with semester-wise fees AND a bold total row at the end, in this exact style:

| Semester | Fee (PKR) |
|----------|-----------|
| 1st Semester | 44,300 |
| 2nd Semester | 41,500 |
| 3rd Semester | 44,800 |
| 4th Semester | 48,430 |
| 5th Semester | 52,423 |
| 6th Semester | 56,815 |
| 7th Semester | 61,647 |
| 8th Semester | 65,000 |
| **Total** | **414,915** |

FEE DATA BY CATEGORY AND SHIFT (Session 2026):

=== 1. COMPUTER SCIENCE PROGRAMS (BS CS / IT / AI / Data Science) ===

--- Morning Shift ---
1st Semester: 44,300
2nd Semester: 41,500
3rd Semester: 44,800
4th Semester: 48,430
5th Semester: 52,423
6th Semester: 56,815
7th Semester: 61,647
8th Semester: 66,962
Total: 416,877

--- Evening Shift ---
1st Semester: 49,800
2nd Semester: 47,700
3rd Semester: 51,770
4th Semester: 56,247
5th Semester: 61,172
6th Semester: 66,589
7th Semester: 72,548
8th Semester: 79,103
Total: 484,929

=== 2. NATURAL AND APPLIED SCIENCES ===

--- Morning Shift ---
1st Semester: 38,300
2nd Semester: 34,900
3rd Semester: 37,540
4th Semester: 40,444
5th Semester: 43,638
6th Semester: 47,152
7th Semester: 51,017
8th Semester: 55,269
Total: 348,260

--- Evening Shift ---
1st Semester: 47,300
2nd Semester: 44,800
3rd Semester: 48,430
4th Semester: 51,423
5th Semester: 56,815
6th Semester: 64,647
7th Semester: 66,962
8th Semester: 72,808
Total: 454,185

=== 3. DIPLOMA (LAD) ===
(Note: Diploma may have fewer semesters — delete unused rows below if so)

--- Morning Shift ---
1st Semester: 28,300
2nd Semester: 23,900
3rd Semester: 25,440
4th Semester: 27,134
Total: 104,774

--- Evening Shift ---
1st Semester: 32,300
2nd Semester: 28,300
3rd Semester: 30,280
4th Semester: 32,458
Total: 123,338

=== 4. ARTS, HUMANITIES AND SOCIAL SCIENCES ===

--- Morning Shift ---
1st Semester: 34,300
2nd Semester: 30,500
3rd Semester: 32,700
4th Semester: 35,120
5th Semester: 37,782
6th Semester: 40,710
7th Semester: 43,931
8th Semester: 47,474
Total: 302,517

--- Evening Shift ---
1st Semester: 42,300
2nd Semester: 39,300
3rd Semester: 42,380
4th Semester: 45,768
5th Semester: 49,495
6th Semester: 53,594
7th Semester: 58,104
8th Semester: 63,064
Total: 394,005

NOTE: This fee data is for Session 2026. If a student asks about a different admission year, tell them fees may vary and recommend checking ul.edu.pk/page/fee-structure for the exact updated figures, since fee structures are revised periodically.
`;

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

// ===== PDF CHAT — SYSTEM PROMPT =====
const PDF_CHAT_SYSTEM_PROMPT = `
You are UL AI Assistant's PDF Learning Assistant.
Your job is to answer questions strictly using the uploaded PDF as the primary source of truth.

When a user uploads a PDF:
1. Understand the complete document before answering.
2. Answer only from the PDF content whenever possible.
3. If the answer is not available in the document, clearly state that the information is not present in the uploaded PDF instead of making assumptions.
4. Explain concepts in a student-friendly manner with simple language.
5. When appropriate, mention the relevant chapter, section, or page number.
6. Generate concise summaries, detailed explanations, important points, definitions, examples, and exam-oriented notes upon request.
7. Help students prepare for exams by identifying key concepts, repeated ideas, and likely important topics.
8. Never fabricate information that does not exist in the uploaded document.
9. Maintain an academic and professional tone.
10. Your goal is to help students understand the document, not merely quote it.
`;

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
const GMAIL_CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const GMAIL_CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const GMAIL_REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const FEEDBACK_EMAIL_USER = process.env.FEEDBACK_EMAIL_USER;
const FEEDBACK_EMAIL_TO = process.env.FEEDBACK_EMAIL_TO || FEEDBACK_EMAIL_USER;

if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
  console.error("⚠️ Gmail API credentials .env mein nahi mili — feedback emails nahi bhej payenge.");
}

async function getGmailAccessToken() {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "Failed to get Gmail access token");
  return data.access_token;
}

function base64UrlEncode(str) {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function encodeMimeHeader(str) {
  return `=?UTF-8?B?${Buffer.from(str, "utf-8").toString("base64")}?=`;
}

async function sendFeedbackEmail(entry) {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    throw new Error("Email not configured on server.");
  }

  const categoryLabel = { general: "💬 General Feedback", bug: "🐛 Bug Report", feature: "✨ Feature Request" };
  const stars = "★".repeat(entry.rating) + "☆".repeat(5 - entry.rating);
  const subject = `${categoryLabel[entry.category]} — ${entry.rating}/5 stars`;
  const bodyText = `Rating: ${stars} (${entry.rating}/5)
Category: ${categoryLabel[entry.category]}
${entry.name ? `Name: ${entry.name}\n` : ""}Time: ${new Date(entry.timestamp).toLocaleString()}
Device: ${entry.deviceId || "unknown"}

Message:
${entry.message || "(no message provided)"}`;

  const rawMessage = [
    `From: "UL AI Feedback" <${FEEDBACK_EMAIL_USER}>`,
    `To: ${FEEDBACK_EMAIL_TO}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    bodyText,
  ].join("\n");

  const accessToken = await getGmailAccessToken();

  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: base64UrlEncode(rawMessage) }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Gmail API Error ${response.status}`);
  }
}

// ============================================================
// ERROR ALERT EMAIL — jab bhi koi unexpected server error aaye (jo
// user ko "Internal Issue / Boss Naeem" wala generic message dikhata
// hai), Boss ko turant email chali jaye — pooora dev-info ke sath
// (jo production mein user ko kabhi nahi dikhta).
// ============================================================
// Simple cooldown — agar koi bug baar baar trigger ho raha ho (jaise
// koi loop mein fail ho raha ho), to Boss ka inbox spam na ho.
const ERROR_ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5 minute
let lastErrorAlertSentAt = 0;

async function sendErrorAlertEmail({ endpoint, errorMessage, deviceId }) {
  if (!GMAIL_CLIENT_ID || !GMAIL_CLIENT_SECRET || !GMAIL_REFRESH_TOKEN) {
    return; // Email configure nahi hai — chup chaap skip karo, user experience block nahi honi chahiye
  }

  const now = Date.now();
  if (now - lastErrorAlertSentAt < ERROR_ALERT_COOLDOWN_MS) {
    console.log("[Error Alert] Cooldown active — email skip ki gayi (console log dekh lein).");
    return;
  }
  lastErrorAlertSentAt = now;

  try {
    const subject = `🚨 UL AI Server Error — ${endpoint}`;
    const bodyText = `An internal server error occurred on UL AI.

Endpoint: ${endpoint}
Time: ${new Date().toLocaleString()}
Device ID: ${deviceId || "unknown"}

--- Dev Info (raw error, users never see this) ---
${errorMessage}`;

    const rawMessage = [
      `From: "UL AI Alerts" <${FEEDBACK_EMAIL_USER}>`,
      `To: ${FEEDBACK_EMAIL_TO}`,
      `Subject: ${encodeMimeHeader(subject)}`,
      `Content-Type: text/plain; charset="UTF-8"`,
      "",
      bodyText,
    ].join("\n");

    const accessToken = await getGmailAccessToken();

    await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: base64UrlEncode(rawMessage) }),
    });
  } catch (emailErr) {
    // Ye fail bhi ho jaye to koi masla nahi — user ko normal error message hi milega,
    // bas Boss ko extra alert nahi milegi is dafa.
    console.error("[Error Alert Email Failed]", emailErr);
  }
}

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
// PAST PAPERS — Google Drive API, folder hi index hai (koi manual JSON nahi)
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
// ke andar per-key handle hoti hai — is se upar dekhein.
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
// groqKeyEntry = geminiPool jaisa ek { key, label, ... } object jo groqPool se milta hai.
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
// Login system nahi hai, isliye frontend ek anonymous deviceId (localStorage mein) generate
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

// ===== Status =====
app.get("/api/status", (req, res) => {
  res.json({environment:process.env.NODE_ENV === "production" ? "production" : "development"}); // development
});
 
app.listen(PORT, () => {
  console.log(`✅ UL AI server chal raha hai: http://localhost:${PORT}`);
});