// ============================================================
// PDF CHAT — poora feature isi file mein hai (app.js se alag)
// Isay app.js se PEHLE load hona chahiye (index.html mein <script>
// order dekhein), taake iske variables/functions dusre scripts ko
// available hon.
//
// Ye file app.js ke shared helpers use karti hai (jo global scope
// mein already maujood hain): showToast, renderMessage, clearMessages,
// showWelcome, closeSidebarMobile, renderHistory, getDeviceId,
// parseJsonSafely, getSession, saveSessions
// ============================================================

// ===== DOM REFS (PDF Chat specific) =====
const pdfChatBtn       = document.getElementById("pdfChatBtn");
const pdfChatScreen    = document.getElementById("pdfChatScreen");
const attachBtn        = document.getElementById("attachBtn");
const pdfFileInput     = document.getElementById("pdfFileInput");
const attachedFileChip = document.getElementById("attachedFileChip");

// ===== PDF CHAT STATE =====
let pdfChatMode = false;
let attachedPdfFile = null;
let attachedPdfText = null;
let isExtractingPdf = false;
let pdfChatMessages = []; // PDF chat ka apna alag messages store — normal sessions se bilkul alag

// pdf.js worker setup (CDN se load hui hai)
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
}

// ===== EVENT LISTENERS SETUP =====
function setupPdfChatListeners() {
  // ===== PDF CHAT BUTTON =====
  pdfChatBtn.addEventListener("click", enterPdfChatMode);

  // ===== ATTACH (PDF) BUTTON =====
  attachBtn.addEventListener("click", () => pdfFileInput.click());

  pdfFileInput.addEventListener("change", async () => {
    const file = pdfFileInput.files[0];
    if (!file) return;

    if (file.type !== "application/pdf") {
      showToast("⚠️ Sirf PDF files allowed hain.");
      pdfFileInput.value = "";
      return;
    }

    attachedPdfFile = file;
    attachedPdfText = null;
    showAttachedFile(file);

    // Agar guidelines screen abhi khuli hai to hata do
    if (pdfChatMode) {
      pdfChatScreen.classList.add("hidden");
    }

    isExtractingPdf = true;
    setAttachedFileStatus("processing");
    showToast("📄 PDF process ho rahi hai, thoda intezar karein...");

    try {
      const text = await extractPdfText(file);

      if (!text || text.trim().length < 20) {
        showToast("⚠️ Is PDF se text nahi mil saka — shayad ye scanned/image-based PDF hai.");
        setAttachedFileStatus("error");
        attachedPdfText = null;
      } else {
        // Safety cap — bohot lambi PDF ho to sirf shuru ka hissa bhejo (quota bachane ke liye)
        const MAX_CHARS = 60000;
        attachedPdfText = text.length > MAX_CHARS
          ? text.slice(0, MAX_CHARS) + "\n\n[...PDF bohot lambi hai, sirf shuru ka hissa include kiya gaya hai...]"
          : text;
        setAttachedFileStatus("ready");
        showToast(`✅ "${file.name}" ready hai — ab is PDF ke baare mein poochain!`);
      }
    } catch (err) {
      console.error("[PDF Extract Error]", err);
      showToast("⚠️ PDF process nahi ho saki. Dobara try karein.");
      setAttachedFileStatus("error");
      attachedPdfText = null;
    }

    isExtractingPdf = false;
  });
}

// ===== PDF TEXT EXTRACTION (pdf.js, client-side) =====
async function extractPdfText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(" ");
    fullText += `\n\n--- Page ${i} ---\n${pageText}`;
  }
  return fullText.trim();
}

// ===== PDF CHAT MODE =====
function enterPdfChatMode() {
  pdfChatMode = true;
  clearMessages();
  showWelcome(false);

  // Pichli PDF chat messages restore karo (agar koi thi)
  if (pdfChatMessages.length > 0) {
    pdfChatScreen.classList.add("hidden"); // guidelines mat dikhao, messages dikhao
    pdfChatMessages.forEach(m => renderMessage(m.role, m.content));
    // Restart button dikhao (sirf PDF chat mein)
    showPdfRestartBtn();
  } else {
    pdfChatScreen.classList.remove("hidden"); // pehli baar — guidelines dikhao
  }

  closeSidebarMobile();
  messageInput.focus();

  // Highlight PDF Chat button, hata do "Recent Chats" wali active highlight
  pdfChatBtn.classList.add("active");
  document.querySelectorAll(".history-item-wrap.active").forEach(el => el.classList.remove("active"));
  messageInput.placeholder = "Ask anything about your PDF...";
}

function exitPdfChatMode() {
  if (!pdfChatMode) return;
  pdfChatMode = false;
  pdfChatScreen.classList.add("hidden");
  // Note: pdfChatMessages aur attachedPdf clear NAHI karte — wapas click pe restore honge
  // Sirf UI reset karo
  hidePdfRestartBtn();

  // PDF Chat button ki highlight hatao, wapas current session ki highlight lagao
  pdfChatBtn.classList.remove("active");
  messageInput.placeholder = "Ask anything about University of Layyah...";
  renderHistory();
}

function showPdfRestartBtn() {
  let btn = document.getElementById("pdfRestartBtn");
  if (!btn) {
    btn = document.createElement("button");
    btn.id = "pdfRestartBtn";
    btn.className = "pdf-restart-btn";
    btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg> New PDF Chat`;
    btn.addEventListener("click", resetPdfChat);
    // Input area ke upar lagao
    const inputArea = document.querySelector(".input-area");
    inputArea.insertBefore(btn, inputArea.firstChild);
  }
  btn.style.display = "flex";
}

function hidePdfRestartBtn() {
  const btn = document.getElementById("pdfRestartBtn");
  if (btn) btn.style.display = "none";
}

function resetPdfChat() {
  // PDF chat bilkul fresh start
  pdfChatMessages = [];
  clearMessages();
  clearAttachedFile();
  pdfChatScreen.classList.remove("hidden");
  hidePdfRestartBtn();
  messageInput.placeholder = "Ask anything about your PDF...";
}

function showAttachedFile(file) {
  attachedFileChip.innerHTML = `
    <span class="chip-icon">📄</span>
    <span class="chip-name">${file.name}</span>
    <span class="chip-status processing" id="chipStatus">Processing…</span>
    <button class="chip-remove" id="removeAttachedFile" title="Remove">✕</button>
  `;
  attachedFileChip.classList.add("show");
  document.getElementById("removeAttachedFile").addEventListener("click", clearAttachedFile);
}

function setAttachedFileStatus(status) {
  const el = document.getElementById("chipStatus");
  if (!el) return;
  if (status === "processing") { el.textContent = "Processing…"; el.className = "chip-status processing"; }
  else if (status === "ready") { el.textContent = "Ready"; el.className = "chip-status ready"; }
  else if (status === "error") { el.textContent = "Error"; el.className = "chip-status error"; }
}

function clearAttachedFile() {
  attachedPdfFile = null;
  attachedPdfText = null;
  isExtractingPdf = false;
  pdfFileInput.value = "";
  attachedFileChip.classList.remove("show");
  attachedFileChip.innerHTML = "";
}

// ===== BACKEND API CALL — PDF CHAT (extracted PDF text + question) =====
async function callPdfChatAPI(messages, pdfText) {
  const response = await fetch("/api/pdf-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, pdfText, deviceId: getDeviceId() })
  });

  const data = await parseJsonSafely(response);

  if (!response.ok) {
    const error = new Error(data.error || `Server Error ${response.status}`);
    if (data.quotaExceeded) {
      error.quotaExceeded = true;
      error.resetTimePKT = data.resetTimePKT;
      error.hoursRemaining = data.hoursRemaining;
    }
    if (data.rateLimited) {
      error.rateLimited = true;
    }
    throw error;
  }

  // Token usage bar update karo (updateTokenUsageBar function app.js mein hai)
  if (data.usage) updateTokenUsageBar(data.usage);

  return data.reply || "No response received.";
}