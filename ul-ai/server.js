// ===== UL AI BACKEND SERVER =====
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const rateLimit = require("express-rate-limit")

const app = express();

// ===== TRUST PROXY =====
// Agar app kisi reverse proxy/hosting service (Render, Railway, Vercel, Nginx, Cloudflare, waghera)
// ke peeche deploy hai, to yeh zaroori hai — warna Express ko real client IP kabhi nahi milega,
// aur sab requests ek hi (proxy ka) IP jese dikhengi (jo humara asal bug tha).
// "1" ka matlab hai: ek hop trust karo (jo aam PaaS setups ke liye sahi hai).
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;
// Main university chat ke liye alag key, PDF Chat ke liye alag key — dono ka
// quota independent rahega, ek dusre ko touch nahi karega.
const GEMINI_API_KEY_1 = process.env.GEMINI_API_KEY_1;
const PDF_API_KEY = process.env.PDF_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

if (!GEMINI_API_KEY_1) {
  console.error("❌ GEMINI_API_KEY_1 .env file mein nahi mili! .env.example dekho.");
}
if (!PDF_API_KEY) {
  console.error("❌ PDF_API_KEY .env file mein nahi mili — PDF Chat kaam nahi karega.");
}

// ===== GROQ (BACKUP MODEL — SIRF NORMAL CHAT KE LIYE, PDF Chat ko touch nahi karta) =====
// Jab Gemini ki (bohot chhoti, ~5/din) free limit khatam ho jaye, normal university chat
// automatically Groq pe switch ho jata hai taake user ko turant error na mile.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

if (!GROQ_API_KEY) {
  console.error("⚠️ GROQ_API_KEY .env file mein nahi mili — Gemini ki limit khatam hone par backup kaam nahi karega.");
}

// ===== UNIVERSITY CONTEXT — backend mein, frontend ko nazar nahi aata =====
const UNIVERSITY_CONTEXT = `
You are UL AI — the official AI assistant for the University of Layyah (ul.edu.pk), located in Layyah, Punjab, Pakistan.

Your primary role is to help students, faculty, and visitors with everything related to the University of Layyah. Always be helpful, respectful, and accurate.

KEY INFORMATION ABOUT UNIVERSITY OF LAYYAH:
- Official Website: https://ul.edu.pk
- Location: Layyah, Punjab, Pakistan
- Campus: Two campus, City Campus (Katchehry Road, Layyah), Main Campus (Hafizabad Layyah)
- Main Campus: Hafizabad Layyah
- Type: Public University (established by Government of Punjab)
- Affiliation: Higher Education Commission (HEC) of Pakistan

DEPARTMENTS & PROGRAMS (known):
- Department of Computer Science
- Department of Mathematics
- Department of Physics
- Department of Chemistry
- Department of Botany
- Department of Zoology
- Department of English
- Department of Urdu
- Department of Islamic Studies
- Department of Education
- Department of Sport Science & Physical Education

ADMISSIONS:
- Admission is conducted through online portal at ul.edu.pk/admissions
- Merit-based admissions following HEC guidelines
- Documents needed: Matric and Inter (2nd year) certificates, CNIC/B-form, domicile, passport photos
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

UPCOMING EVENTS:
- Sports Week: Sports Gala is usually held in Spring season
- Science Exhibition: Not mentioned
- Admission Open House: June-August

CAMPUS CULTURE & RULES:
- Co-education system
- Dress code: Formal/semi-formal
- Attendance requirement: 75% minimum
- Semester system: 2 semesters per year (Spring & Fall)
- Exams: Mid-term + Final

HOSTEL INFO:
- Boys Hostel: Available
- Girls Hostel: Available, separate block
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

// ===== FEE CONTEXT (alag rakha hai — sirf fee-related sawal par UNIVERSITY_CONTEXT ke =====
// sath jodte hain, taake har normal message ke sath ye bara fee data na jaye aur
// token usage kam ho. Dekho isFeeRelatedQuery() aur uska use /api/chat mein.)
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
// False-positive (kabhi kabhi zaroorat na hone par bhi include ho jana) theek hai, koi
// nuksan nahi; false-negative (fee context miss ho jana) se bachna zyada zaroori hai.
const FEE_KEYWORDS = [
  "fee", "fees", "tuition", "cost", "charges", "dues", "installment",
  "kharcha", "kharche", "paisa", "paise", "fee structure",
  "semester fee", "admission fee", "morning shift", "evening shift",
  "kitne paise", "kitni fee", "how much",
];

function isFeeRelatedQuery(messages) {
  // Last 4 messages check karo (sirf latest question nahi) — taake agar AI ne
  // pehle "kis category?" poocha ho aur student sirf "CS, morning" reply kare
  // (jisme "fee" lafz na ho), tab bhi context sahi mile.
  const recentText = messages.slice(-4).map((m) => m.content).join(" ").toLowerCase();
  return FEE_KEYWORDS.some((keyword) => recentText.includes(keyword));
}

// ===== PDF CHAT — SYSTEM PROMPT (ab /api/pdf-chat endpoint isay use karta hai) =====
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

// ===== QUOTA RESET TIME CALCULATOR =====
// Gemini free tier quota midnight PT (Pacific Time) par reset hota hai.
// Yeh function woh exact instant nikal kar Pakistan Time (PKT) mein convert karta hai.
function getQuotaResetTime() {
  const now = new Date();
 
  // "Agar abhi Pacific Time mein date/time kya hai" — yeh string nikalo
  const ptString = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const ptNow = new Date(ptString);
 
  // Agla midnight PT (yaani PT ke hisaab se "kal ka 12:00 AM")
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
// Ye Google ke asal account-level quota se LIVE sync nahi hai — sirf humara apna
// tracked estimate hai, jo Gemini ke har response ke "usageMetadata" se count karta hai.
// Ye sirf ek helpful andaza/dashboard hai — Google ka real quota isse bilkul independent
// hai (upar chat mein detail se explain kiya gaya hai).
//
// File mein isliye save karte hain taake server restart (Ctrl+C, crash, redeploy) hone par
// bhi aaj ka count na kho jaye.
//
// NOTE (Render free tier): Render ka free plan ephemeral filesystem use karta hai — matlab
// agar aap naya code deploy karte hain (git push se redeploy), to poori filesystem fresh
// ban jati hai aur ye file bhi reset ho jayegi. Sirf normal restart (jaise process crash se
// khud-ba-khud restart, bina naye deploy ke) mein file surakshit rehti hai. Agar Render pe
// bhi deploys ke through persist karna ho, to paid "Render Disk" ya koi external storage
// (jaise ek chhota database) chahiye hoga.
const DAILY_TOKEN_BUDGET = 250000; // <-- yahan apna estimated daily token budget daalein
const USAGE_FILE = path.join(__dirname, "token-usage.json");

let dailyTokensUsed = 0;
let usageTrackerDatePT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });

// ===== Startup pe purana saved usage load karo (agar file mojood ho aur aaj ki hi ho) =====
try {
  if (fs.existsSync(USAGE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(USAGE_FILE, "utf-8"));
    if (saved.date === usageTrackerDatePT) {
      dailyTokensUsed = saved.used || 0;
      console.log(`✅ Token usage file se load hui: ${dailyTokensUsed} tokens (aaj, ${usageTrackerDatePT})`);
    } else {
      console.log("ℹ️ Purani usage file mili lekin purane din ki hai — 0 se shuru kar rahe hain.");
    }
  }
} catch (err) {
  console.error("⚠️ Token usage file load nahi ho saki:", err.message);
}

// ===== Har update ke baad file mein save karo (async, taake request slow na ho) =====
function saveUsageToFile() {
  fs.writeFile(
    USAGE_FILE,
    JSON.stringify({ date: usageTrackerDatePT, used: dailyTokensUsed }),
    (err) => {
      if (err) console.error("⚠️ Token usage file save nahi ho saki:", err.message);
    }
  );
}

function trackTokenUsage(usageMetadata) {
  const todayPT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  if (todayPT !== usageTrackerDatePT) {
    // Naya din (PT ke hisaab se, jahan Gemini quota bhi reset hota hai) — counter reset karo
    dailyTokensUsed = 0;
    usageTrackerDatePT = todayPT;
  }
  if (usageMetadata?.totalTokenCount) {
    dailyTokensUsed += usageMetadata.totalTokenCount;
  }
  saveUsageToFile();
}

function getUsageSnapshot() {
  const todayPT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  if (todayPT !== usageTrackerDatePT) {
    dailyTokensUsed = 0;
    usageTrackerDatePT = todayPT;
    saveUsageToFile();
  }
  const percent = Math.min(100, Math.round((dailyTokensUsed / DAILY_TOKEN_BUDGET) * 100));
  return { used: dailyTokensUsed, limit: DAILY_TOKEN_BUDGET, percent };
}

// ============================================================
// GEMINI LOCAL USAGE TRACKER (Groq fallback decide karne ke liye)
// ============================================================
// Gemini ki asal free limit bohot chhoti hai (~5 RPD, ~5 RPM — December 2025 mein
// Google ne cut kar di). Hum khud in dono ko track karte hain taake:
// 1. Jab pata ho ke Gemini already exhausted hai, seedha Groq try karein (ek wasted,
//    guaranteed-fail Gemini call na karein)
// 2. Agar Gemini phir bhi real 429 de de (kisi aur wajah se, jaise races), tab bhi
//    neeche wala try/catch Groq pe fallback kar dega.
//
// NOTE: Google apni free-tier limits kabhi bhi badal sakta hai — agar aage chal kar
// number change ho to yahan GEMINI_RPD_LIMIT / GEMINI_RPM_LIMIT update kar dein,
// ya .env mein GEMINI_RPD_LIMIT / GEMINI_RPM_LIMIT set kar dein (code change ki
// zaroorat nahi hogi).
const GEMINI_RPD_LIMIT = parseInt(process.env.GEMINI_RPD_LIMIT, 10) || 5;
const GEMINI_RPM_LIMIT = parseInt(process.env.GEMINI_RPM_LIMIT, 10) || 5;

let geminiRequestTimestamps = []; // pichle 60 seconds ki attempts (RPM ke liye)
let geminiDailyCount = 0;
let geminiDailyDatePT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });

function canUseGeminiNow() {
  const todayPT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  if (todayPT !== geminiDailyDatePT) {
    geminiDailyCount = 0;
    geminiDailyDatePT = todayPT;
  }
  const now = Date.now();
  geminiRequestTimestamps = geminiRequestTimestamps.filter((t) => now - t < 60 * 1000);

  return geminiDailyCount < GEMINI_RPD_LIMIT && geminiRequestTimestamps.length < GEMINI_RPM_LIMIT;
}

// Ye har Gemini ATTEMPT (chahay success ho ya fail) ke turant pehle call karo —
// kyunke Google ke RPM/RPD ke against fail hui request bhi shayad count hoti hai.
function recordGeminiAttempt() {
  geminiRequestTimestamps.push(Date.now());
  geminiDailyCount++;
}

// Poore din mein sirf EK dafa "backup model pe switch ho gaya" wala notice dikhana hai —
// baaki saari Groq-powered responses bilkul normal (bina kisi indication ke) dikhni chahiye.
let fallbackNotifiedDatePT = null;

function shouldNotifyFallback() {
  const todayPT = new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" });
  if (fallbackNotifiedDatePT !== todayPT) {
    fallbackNotifiedDatePT = todayPT;
    return true; // aaj ka pehla switch — notify karo
  }
  return false; // aaj already notify ho chuka hai
}

// ===== GROQ BACKUP CALL (sirf normal chat ke liye — PDF Chat isay use nahi karta) =====
async function callGroqChat(messages, userName) {
  const userNameNote = userName
    ? `\n\nCURRENT USER INFO:\n- User ka naam: ${userName}\n- Responses mein kabhi kabhi unhe "${userName}" keh kar address karo — especially jab koi naya topic start ho, koi important info do, ya koi warm/encouraging baat ho. Har message mein naam lena zaroori nahi — sirf jab natural lage.`
    : "";
  const feeContext = isFeeRelatedQuery(messages) ? "\n\n" + FEE_CONTEXT : "";

  async function attemptGroqCall(historyLimit) {
    // Groq ki TPM limit Gemini se kaafi chhoti hai — lambi conversations mein poori
    // history bhejne se request TPM cap cross kar sakti hai. Backup model ka kaam
    // sirf turant ka jawab dena hai, isliye sirf recent messages bhejte hain.
    const trimmedMessages = messages.slice(-historyLimit);

    const groqMessages = [
      { role: "system", content: UNIVERSITY_CONTEXT + feeContext + userNameNote },
      ...trimmedMessages.map((m) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
      })),
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: groqMessages,
        temperature: 0.7,
        max_tokens: 2048,
        // NOTE: 'reasoning_format' yahan jaanbujh kar nahi bheja — ye sirf reasoning-capable
        // models (jaise qwen3) support karte hain; normal instruct models (jaise llama-4-scout)
        // is param pe error dete hain. Isliye hum sirf neeche wali <think> stripping (jo har
        // model ke sath safely kaam karti hai) pe hi rely karte hain.
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[Groq Error]", data);
      const err = new Error(data.error?.message || `Groq API Error ${response.status}`);
      err.isTpmError = data.error?.code === "rate_limit_exceeded" && data.error?.type === "tokens";
      throw err;
    }

    let content = data.choices?.[0]?.message?.content || "No response received.";

    // Safety net: agar (reasoning-capable) model ne <think>...</think> content ke
    // andar bhej diya ho, to usay yahan se hata dein. Non-reasoning models ke liye
    // ye simply kuch nahi karega (koi <think> tag nahi milega to no-op rahega).
    content = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    return content;
  }

  try {
    return await attemptGroqCall(8); // normal case — last 8 messages
  } catch (err) {
    if (err.isTpmError) {
      // Bohot lambi conversation/message ki wajah se abhi bhi TPM cross ho gaya —
      // sirf latest question ke sath ek aakhri koshish karo (system prompt + last message)
      console.warn("[Groq] TPM limit phir bhi cross hui — sirf latest message ke sath retry.");
      return await attemptGroqCall(1);
    }
    throw err;
  }
}

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json({ limit: "5mb" })); // PDF extracted text bhejne ke liye default 100kb limit kaafi nahi thi
app.use(express.static(path.join(__dirname))); // index.html, style.css, app.js serve karega
 
// ===== PER-IP RATE LIMITING (taake ek user spam kare to sab ke liye quota khatam na ho) =====
// Har IP address ko apni alag limit milti hai — yeh Gemini ki overall free quota se
// chhoti rakhi gayi hai taake ek user, baqi sab students ke liye service down na kar sake.
 
// ===== RATE LIMIT KEY =====
// Login system nahi hai, isliye frontend ek anonymous deviceId (localStorage mein) generate
// karta hai aur har request ke saath bhejta hai. Hum isay IP ki jagah primary key banate hain,
// taake university WiFi/NAT ke peeche jo bohot saare students ek hi public IP share karte hain,
// unko ek dusre ki limit ka nuksan na ho — har device/browser ki apni alag, fair limit hogi.
function getRateLimitKey(req) {
  const id = req.body?.deviceId;
  if (typeof id === "string" && id.length > 0 && id.length <= 100) {
    return `dev:${id}`;
  }
  // deviceId na mile (purana cached page, JS disabled, waghera) to IP pe fallback karo
  return `ip:${req.ip}`;
}

// Short-term limit: 1 minute mein zyada se zyada 8 messages per device (spam/bot protection)
const minuteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getRateLimitKey,
  validate: false, // custom keyGenerator use kar rahe hain, built-in IP validation warnings skip karo
  message: {
    error: "Bohat zyada messages bhej diye thoray waqt mein. Mehrbani ferma kar 1 minute ruk kar dobara try karein.",
    rateLimited: true,
  },
});

// Daily limit: 1 din mein zyada se zyada 60 messages per device
// (taake ek hi user, university ke sab students ke liye daily Gemini quota na khatam kar de)
const dailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
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
 
// ===== CHAT ENDPOINT =====
// Frontend yahan POST request bhejega: { messages: [...] }
app.post("/api/chat", minuteLimiter, dailyLimiter, async (req, res) => {
  try {
    const { messages, userName } = req.body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "messages array required" });
    }

    let reply;
    let usage = null;
    let provider = "gemini";

    if (canUseGeminiNow()) {
      try {
        recordGeminiAttempt();

        const history = messages.slice(0, -1).map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));
        const lastMsg = messages[messages.length - 1];

        // User ka naam context mein add karo taake AI naturally use kare
        const userNameNote = userName
          ? `\n\nCURRENT USER INFO:\n- User ka naam: ${userName}\n- Responses mein kabhi kabhi unhe "${userName}" keh kar address karo — especially jab koi naya topic start ho, koi important info do, ya koi warm/encouraging baat ho. Har message mein naam lena zaroori nahi — sirf jab natural lage.`
          : "";
        // Fee-related sawal ho tabhi FEE_CONTEXT jodo — taake normal messages mein
        // ye bara fee data na jaye aur token usage kam rahe.
        const feeContext = isFeeRelatedQuery(messages) ? "\n\n" + FEE_CONTEXT : "";
        const contextWithName = UNIVERSITY_CONTEXT + feeContext + userNameNote;

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY_1}`;

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
          console.error("[Gemini Error]", data);
          const msg = data.error?.message || `API Error ${response.status}`;

          // ===== RATE LIMIT / QUOTA DETECTION =====
          const isQuotaError =
            response.status === 429 ||
            msg.toLowerCase().includes("quota") ||
            msg.toLowerCase().includes("rate limit");

          if (isQuotaError) {
            const err = new Error(msg);
            err.quotaExceeded = true;
            throw err;
          }

          throw new Error(msg);
        }

        reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
        trackTokenUsage(data.usageMetadata); // token usage tracker (permanent)
        usage = getUsageSnapshot();
      } catch (err) {
        if (err.quotaExceeded) {
          console.warn("[Fallback] Gemini ki limit khatam — Groq (backup) pe switch ho raha hai.");
          provider = "groq";
        } else {
          throw err; // koi aur (unexpected) error — normal error handling mein jaye
        }
      }
    } else {
      console.log("[Fallback] Gemini ka apna tracked budget (RPM/RPD) khatam — seedha Groq use ho raha hai.");
      provider = "groq";
    }

    if (provider === "groq") {
      if (!GROQ_API_KEY) {
        // Backup configure hi nahi hai — asal Gemini quota error dikhao (jaisa pehle hota tha)
        const resetInfo = getQuotaResetTime();
        return res.status(429).json({
          error: "Gemini ki free limit khatam ho gayi hai, aur backup (Groq) configure nahi hai.",
          quotaExceeded: true,
          resetTimePKT: resetInfo.formatted,
          hoursRemaining: resetInfo.hoursRemaining,
        });
      }

      // Poore din mein sirf pehli baar switch hone par sirf ek notice bhejo —
      // is turn ka actual jawab skip karo (Groq call bhi waste nahi hoti). User
      // ko dobara message bhejna hoga, tab se saari responses bilkul normal hongi.
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

      reply = await callGroqChat(messages, userName);
    }

    res.json({ reply, usage, provider, isFirstFallback: false });
  } catch (err) {
    console.error("[Server Error]", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});
 
// ===== PDF CHAT ENDPOINT =====
// Frontend yahan POST request bhejega: { messages: [...], pdfText: "..." }
// pdfText client-side (pdf.js) se extract hoke aata hai — server pe koi file store nahi hoti.
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

    // Server-side safety cap bhi lagao (client-side cap ke ilawa — defense in depth)
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
          error: msg,
          quotaExceeded: true,
          resetTimePKT: resetInfo.formatted,
          hoursRemaining: resetInfo.hoursRemaining,
        });
      }

      return res.status(response.status).json({ error: msg });
    }

    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
    trackTokenUsage(data.usageMetadata); // token usage tracker (permanent)
    res.json({ reply, usage: getUsageSnapshot() });
  } catch (err) {
    console.error("[Server Error - PDF Chat]", err);
    res.status(500).json({ error: err.message || "Internal server error" });
  }
});

// ===== HEALTH CHECK =====
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", model: GEMINI_MODEL });
});

// Token usage bar ke liye — page load pe initial value dikhane ke liye.
app.get("/api/usage", (req, res) => {
  res.json(getUsageSnapshot());
});

// ===== Status =====
app.get("/api/status", (req, res) => {
  res.json({environment:process.env.NODE_ENV === "production" ? "production" : "development"});
});
 
app.listen(PORT, () => {
  console.log(`✅ UL AI server chal raha hai: http://localhost:${PORT}`);
});