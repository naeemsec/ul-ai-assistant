// ============================================================
// DEVICE ID - CONFIGURATION
// ============================================================
const DEVICE_ID_KEY = "ul_ai_device_id";

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const CONFIG = {
  maxTokens: 1024,
};


// ===== STATE =====
let chatSessions = [];
let currentSessionId = null;
let isLoading = false;
let activeContextMenu = null;
let stopRequested = false;
let currentTypewriterResolve = null;
let userName = localStorage.getItem("ul_ai_username") || "";
 
// ===== DOM REFS =====
const sidebar        = document.getElementById("sidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const sidebarToggle  = document.getElementById("sidebarToggle");
const newChatBtn     = document.getElementById("newChatBtn");
const themeToggle    = document.getElementById("themeToggle");
const messageInput   = document.getElementById("messageInput");
const sendBtn        = document.getElementById("sendBtn");
const messagesEl     = document.getElementById("messages");
const welcomeScreen  = document.getElementById("welcomeScreen");
const chatHistory    = document.getElementById("chatHistory");
const settingsBtn    = document.getElementById("settingsBtn");
const settingsModal  = document.getElementById("settingsModal");

// ===== FEEDBACK DOM REFS =====
const feedbackFab          = document.getElementById("feedbackFab");
const feedbackModal        = document.getElementById("feedbackModal");
const closeFeedback        = document.getElementById("closeFeedback");
const feedbackStars        = document.getElementById("feedbackStars");
const feedbackName         = document.getElementById("feedbackName");
const feedbackCategoryRow  = document.getElementById("feedbackCategoryRow");
const feedbackMessage      = document.getElementById("feedbackMessage");
const feedbackSendBtn      = document.getElementById("feedbackSendBtn");

let feedbackRating = 0;
let feedbackCategory = "general";
const aboutModal     = document.getElementById("aboutModal");
const closeSettings  = document.getElementById("closeSettings");
const closeAbout     = document.getElementById("closeAbout");
const openAboutBtn   = document.getElementById("openAboutBtn");

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  loadSessions();
  setupEventListeners();
  autoResize(document.getElementById("messageInput"));
  updateEnvironmentBadge();
  loadInitialTokenUsage(); 

  if (window.innerWidth <= 768) {
    sidebar.classList.add("collapsed");
  }
  if (chatSessions.length > 0) {
    currentSessionId = chatSessions[0].id;
    switchSession(currentSessionId);
  } else {
    showWelcome(true);
  }

  if (!userName) {
    setTimeout(() => showNameDialog(), 600);
  } else {
    updateWelcomeGreeting();
  }

  updateUserBadge();
  document.getElementById("userBadge").addEventListener("click", () => {
    showNameDialog();
  });
});
 
let isProductionEnv = false;

async function updateEnvironmentBadge() {
  const badge = document.getElementById("topbarBadge");
  if (!badge) return;
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    isProductionEnv = data.environment === "production";
    badge.textContent = isProductionEnv ? "Live" : "Beta";
  } catch (e) {
    badge.textContent = "Beta";
  }
}
function setupEventListeners() {
  sidebarToggle.addEventListener("click", toggleSidebar);
  sidebarBackdrop.addEventListener("click", toggleSidebar);
  newChatBtn.addEventListener("click", startNewChat);
  themeToggle.addEventListener("click", toggleTheme);
  sendBtn.addEventListener("click", () => {
    if (isLoading) {
      handleStop();
    } else {
      handleSend();
    }
  });
  settingsBtn.addEventListener("click", () => settingsModal.classList.add("open"));

  feedbackFab.addEventListener("click", () => {
    resetFeedbackForm();
    feedbackModal.classList.add("open");
  });
  closeFeedback.addEventListener("click", () => feedbackModal.classList.remove("open"));
  feedbackModal.addEventListener("click", (e) => { if (e.target === feedbackModal) feedbackModal.classList.remove("open"); });

  feedbackStars.querySelectorAll(".star-btn").forEach((star) => {
    star.addEventListener("click", () => {
      feedbackRating = parseInt(star.dataset.value, 10);
      updateStarDisplay();
    });
  });

  feedbackCategoryRow.querySelectorAll(".feedback-cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      feedbackCategory = btn.dataset.cat;
      feedbackCategoryRow.querySelectorAll(".feedback-cat-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  feedbackSendBtn.addEventListener("click", submitFeedback);
  closeSettings.addEventListener("click", () => settingsModal.classList.remove("open"));
  
  if (openAboutBtn) {
    openAboutBtn.addEventListener("click", () => {
        settingsModal.classList.remove("open");
        aboutModal.classList.add("open");
    });
  }
 
  settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.remove("open"); });
 
  document.addEventListener("click", () => closeContextMenu());
 
  messageInput.addEventListener("input", () => {
    autoResize(messageInput);
  });
 
  messageInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading) handleSend();
    }
  });

  // ===== FEATURE NAV BUTTONS (Smart Notes+Quiz / GPA Calculator — coming soon) =====
  document.querySelectorAll(".feature-btn:not(#pdfChatBtn):not(#meritListBtn):not(#pastPaperBtn)").forEach((btn) => {
    btn.addEventListener("click", () => {
      showToast(`🚧 ${btn.dataset.feature} is currently under development. It will be available soon!`);
    });
  });

  // ===== PDF CHAT (poora setup pdf-chat.js mein hai) =====
  setupPdfChatListeners();
  setupPastPaperListeners();
}
let toastTimeout = null;
function showToast(message) {
  let toast = document.getElementById("ulToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "ulToast";
    toast.className = "ul-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove("show");
  }, 2800);
}

function updateStarDisplay() {
  feedbackStars.querySelectorAll(".star-btn").forEach((star) => {
    const val = parseInt(star.dataset.value, 10);
    star.classList.toggle("filled", val <= feedbackRating);
  });
}

function resetFeedbackForm() {
  feedbackName.value = "";
  feedbackRating = 0;
  feedbackCategory = "general";
  feedbackMessage.value = "";
  updateStarDisplay();
  feedbackCategoryRow.querySelectorAll(".feedback-cat-btn").forEach((b) => b.classList.remove("active"));
  feedbackCategoryRow.querySelector('[data-cat="general"]').classList.add("active");
}

async function submitFeedback() {
  if (feedbackRating < 1) {
    showToast("⭐ Please select a star rating first.");
    return;
  }

  feedbackSendBtn.disabled = true;
  feedbackSendBtn.textContent = "Sending...";

  try {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: feedbackName.value.trim(),
        rating: feedbackRating,
        category: feedbackCategory,
        message: feedbackMessage.value.trim(),
        deviceId: getDeviceId(),
      }),
    });

    const data = await parseJsonSafely(response);

    if (!response.ok) {
      throw new Error(data.error || "Something went wrong.");
    }

    feedbackModal.classList.remove("open");
    showToast("🙏 Thanks for your feedback!");
  } catch (err) {
    console.error("[Feedback Error]", err);
    showToast("⚠️ Could not send feedback. Please try again.");
  } finally {
    feedbackSendBtn.disabled = false;
    feedbackSendBtn.textContent = "Send Feedback";
  }
}
 
// ===== SIDEBAR =====
function toggleSidebar() {
  sidebar.classList.toggle("collapsed");

  if (window.innerWidth <= 768) {
    const isExpanded = !sidebar.classList.contains("collapsed");
    if (isExpanded) {
      sidebarBackdrop.classList.add("active");
    } else {
      sidebarBackdrop.classList.remove("active");
    }
  } else {
    sidebarBackdrop.classList.remove("active");
  }
}

function closeSidebarMobile() {
  if (window.innerWidth <= 768) {
    sidebar.classList.add("collapsed");
    sidebarBackdrop.classList.remove("active");
  }
}

window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    sidebarBackdrop.classList.remove("active");
  }
});

// ===== THEME =====
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  themeToggle.querySelector(".theme-icon").textContent = isDark ? "☀️" : "🌙";
  themeToggle.querySelector("span:last-child").textContent = isDark ? "Light Mode" : "Dark Mode";
}
 
// ===== USER NAME =====
function showNameDialog() {
  if (document.getElementById("nameDialog")) return;

  const overlay = document.createElement("div");
  overlay.id = "nameDialog";
  overlay.className = "modal-overlay open";
  overlay.innerHTML = `
    <div class="modal" style="max-width:380px">
      <div class="modal-header">
        <div class="modal-title">👋 Welcome to UL AI</div>
      </div>
      <div class="modal-body" style="padding:24px 20px">
        <p style="margin-bottom:16px;color:var(--text-secondary);font-size:14px">
          Please enter your name so I can address you personally:
        </p>
        <input 
          type="text" 
          id="nameInput" 
          class="setting-input" 
          placeholder="Enter your name here..." 
          maxlength="30"
          style="margin-bottom:16px"
          autofocus
        />
        <button class="save-btn" id="saveNameBtn" style="width:100%">Start Session→</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const input = document.getElementById("nameInput");
  const btn = document.getElementById("saveNameBtn");

  function saveName() {
    const name = input.value.trim();
    if (!name) {
      input.style.borderColor = "var(--accent)";
      input.placeholder = "Naam zaroor likhein!";
      input.focus();
      return;
    }
    userName = name;
    localStorage.setItem("ul_ai_username", name);
    overlay.remove();
    updateWelcomeGreeting();
    updateUserBadge();
  }

  btn.addEventListener("click", saveName);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") saveName();
  });
  setTimeout(() => input.focus(), 100);
}

function updateWelcomeGreeting() {
  const subEl = document.querySelector(".welcome-sub");
  if (!subEl) return;

  let greetEl = document.getElementById("welcomeGreeting");
  if (!greetEl) {
    greetEl = document.createElement("p");
    greetEl.id = "welcomeGreeting";
    greetEl.className = "welcome-greeting";
    subEl.insertAdjacentElement("afterend", greetEl);
  }

  const greetings = [
    { before: "Kaise hain aap, ",  name: userName, after: "? 😊" },
    { before: "Welcome back, ",    name: userName, after: "! 👋" },
    { before: "Hello ",            name: userName, after: ", kya poochna hai? 🎓" },
    { before: "Aaj main aapki kya madad kar sakta hoon, ", name: userName, after: "?" },
  ];
  const g = greetings[Math.floor(Math.random() * greetings.length)];
  const fullText = g.before + g.name + g.after;
  const nameStart = g.before.length;
  const nameEnd   = nameStart + g.name.length;

  greetEl.innerHTML = "";
  let i = 0;
  const speed = 40;

  function typeChar() {
    if (i < fullText.length) {
      const typed = fullText.slice(0, i + 1);
      if (i < nameStart) {
        greetEl.innerHTML = typed + '<span class="cursor">|</span>';
      } else if (i < nameEnd) {
        greetEl.innerHTML = g.before + `<strong>${typed.slice(nameStart)}</strong>` + '<span class="cursor">|</span>';
      } else {
        greetEl.innerHTML = g.before + `<strong>${g.name}</strong>` + typed.slice(nameEnd) + '<span class="cursor">|</span>';
      }
      i++;
      setTimeout(typeChar, speed);
    } else {
      greetEl.innerHTML = g.before + `<strong>${g.name}</strong>` + g.after;
    }
  }

  typeChar();
}

function getUserInitial() {
  if (userName && userName.trim()) {
    return userName.trim()[0].toUpperCase();
  }
  return "U";
}

function updateUserBadge() {
  const el = document.getElementById("userBadgeName");
  if (!el) return;
  el.textContent = userName || "User";
}

// ===== CHAT SESSIONS =====
function loadSessions() {
  try {
    const saved = localStorage.getItem("ul_ai_sessions");
    if (saved) chatSessions = JSON.parse(saved);
  } catch (_) { chatSessions = []; }
  renderHistory();
}
 
function saveSessions() {
  localStorage.setItem("ul_ai_sessions", JSON.stringify(chatSessions));
}
 
function startNewChat() {
  exitPdfChatMode();

  if (typeof exitMeritListMode === "function") exitMeritListMode();
  if (typeof exitPastPaperMode === "function") exitPastPaperMode();
  
  const existing = getSession();
  if (existing && existing.messages.length === 0) {
    clearMessages();
    showWelcome(true);
    messageInput.focus();
    closeSidebarMobile();
    return;
  }
 
  const id = Date.now().toString();
  const session = { id, title: "New Chat", messages: [] };
  chatSessions.unshift(session);
  currentSessionId = id;
  saveSessions();
  renderHistory();
  clearMessages();
  showWelcome(true);
  messageInput.focus();
  closeSidebarMobile();
}
 
function switchSession(id) {
  exitPdfChatMode();
  if (typeof exitMeritListMode === "function") exitMeritListMode();
  if (typeof exitPastPaperMode === "function") exitPastPaperMode();

  currentSessionId = id;
  const session = getSession();
  clearMessages();
  if (session.messages.length > 0) {
    showWelcome(false);
    session.messages.forEach(m => renderMessage(m.role, m.content));
  } else {
    showWelcome(true);
  }
  renderHistory();
  closeSidebarMobile();
}
 
function getSession() {
  return chatSessions.find(s => s.id === currentSessionId);
}
 
function deleteSession(id) {
  chatSessions = chatSessions.filter(s => s.id !== id);
  saveSessions();
  if (currentSessionId === id) {
    if (chatSessions.length > 0) {
      switchSession(chatSessions[0].id);
    } else {
      startNewChat();
    }
  } else {
    renderHistory();
  }
}
 
function renameSession(id) {
  const session = chatSessions.find(s => s.id === id);
  if (!session) return;
  const newTitle = prompt("Enter a new chat name:", session.title);
  if (newTitle && newTitle.trim()) {
    session.title = newTitle.trim();
    saveSessions();
    renderHistory();
  }
}
 
// ===== CONTEXT MENU =====
function closeContextMenu() {
  if (activeContextMenu) {
    activeContextMenu.remove();
    activeContextMenu = null;
  }
}
 
function showContextMenu(e, sessionId) {
  e.stopPropagation();
  e.preventDefault();
  closeContextMenu();
 
  const menu = document.createElement("div");
  menu.className = "context-menu";
  menu.innerHTML = `
    <div class="ctx-item" id="ctx-rename">
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>
      Rename
    </div>
    <div class="ctx-item danger" id="ctx-delete">
      <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
      Delete
    </div>
  `;
 
  // Position near the button
  const rect = e.target.closest(".history-item-wrap").getBoundingClientRect();
  menu.style.top = rect.bottom + "px";
  menu.style.left = rect.left + "px";
 
  document.body.appendChild(menu);
  activeContextMenu = menu;
 
  menu.querySelector("#ctx-rename").addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    renameSession(sessionId);
  });
  menu.querySelector("#ctx-delete").addEventListener("click", (ev) => {
    ev.stopPropagation();
    closeContextMenu();
    deleteSession(sessionId);
  });
}
 
function renderHistory() {
  const items = chatSessions.slice(0, 20);
  chatHistory.innerHTML = "";
  items.forEach(s => {
    const wrap = document.createElement("div");
    wrap.className = "history-item-wrap" + (s.id === currentSessionId ? " active" : "");
    wrap.dataset.id = s.id;
 
    const title = document.createElement("span");
    title.className = "history-title";
    title.textContent = s.title;
    title.addEventListener("click", () => switchSession(s.id));
 
    const menuBtn = document.createElement("button");
    menuBtn.className = "history-menu-btn";
    menuBtn.title = "Options";
    menuBtn.innerHTML = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
    menuBtn.addEventListener("click", (e) => showContextMenu(e, s.id));
 
    wrap.appendChild(title);
    wrap.appendChild(menuBtn);
    chatHistory.appendChild(wrap);
  });
}
 
// ===== MESSAGES =====
function clearMessages() {
  messagesEl.innerHTML = "";
}
 
function showWelcome(show) {
  welcomeScreen.classList.toggle("hidden", !show);
}
 
function renderMessage(role, content) {
  const normalizedRole = (role === "assistant") ? "ai" : role;

  const div = document.createElement("div");
  div.className = `message ${normalizedRole}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = normalizedRole === "user" ? getUserInitial() : "UL";

  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = formatText(content);

  div.appendChild(avatar);
  div.appendChild(bubble);

  if (normalizedRole === "ai") {
    div.appendChild(createCopyButton(content));
  }

  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
}

// ===== COPY BUTTON =====
function createCopyButton(textContent) {
  const wrap = document.createElement("div");
  wrap.className = "msg-actions";

  const btn = document.createElement("button");
  btn.className = "copy-btn";
  btn.title = "Copy";
  btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;

  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(textContent);
      btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/></svg>`;
      btn.classList.add("copied");
      setTimeout(() => {
        btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>`;
        btn.classList.remove("copied");
      }, 1500);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  });

  wrap.appendChild(btn);
  return wrap;
}

// ===== TYPEWRITER EFFECT (word-by-word, fast) =====
function typewriterMessage(text) {
  const div = document.createElement("div");
  div.className = "message ai";
 
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "UL";
 
  const bubble = document.createElement("div");
  bubble.className = "bubble";
 
  div.appendChild(avatar);
  div.appendChild(bubble);
  messagesEl.appendChild(div);
 
  return new Promise(resolve => {
    currentTypewriterResolve = resolve;
    const words = text.split(/(\s+)/);
    let i = 0;
    const speed = 18;
 
    function typeWord() {
      if (stopRequested) {
        bubble.innerHTML = formatText(words.slice(0, i).join(""));
        const actionsWrap1 = createCopyButton(words.slice(0, i).join(""));
        div.appendChild(actionsWrap1);
        actionsWrap1.appendChild(createSpeakerButton(words.slice(0, i).join("")));
        currentTypewriterResolve = null;
        resolve();
        return;
      }
      if (i < words.length) {
        const partial = words.slice(0, i + 1).join("");
        bubble.innerHTML = formatText(partial) + '<span class="cursor">|</span>';
        i++;
        scrollToBottom();
        setTimeout(typeWord, speed);
      } else {
        bubble.innerHTML = formatText(text);
        const actionsWrap2 = createCopyButton(text);
        div.appendChild(actionsWrap2);
        actionsWrap2.appendChild(createSpeakerButton(text));
        currentTypewriterResolve = null;
        resolve();
      }
    }
    typeWord();
  });
}
 
function renderTyping() {
  const div = document.createElement("div");
  div.className = "message ai";
  div.id = "typingIndicator";
 
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = "UL";
 
  const bubble = document.createElement("div");
  bubble.className = "bubble typing-bubble";
  bubble.innerHTML = "<span></span><span></span><span></span>";
 
  div.appendChild(avatar);
  div.appendChild(bubble);
  messagesEl.appendChild(div);
  scrollToBottom();
}
 
function removeTyping() {
  const el = document.getElementById("typingIndicator");
  if (el) el.remove();
}
 
function scrollToBottom() {
  const container = document.getElementById("chatContainer");
  container.scrollTop = container.scrollHeight;
}
 
function formatText(text) {
  const lines = text.split("\n");
  let html = "";
  let inList = false;
  let i = 0;

  while (i < lines.length) {
    let line = lines[i];

    // ===== TABLE DETECTION =====
    const isTableRow = /^\|.+\|$/.test(line.trim());
    const nextLine = lines[i + 1] || "";
    const isSeparatorNext = /^\|?[\s\-:|]+\|?$/.test(nextLine.trim()) && nextLine.includes("-");

    if (isTableRow && isSeparatorNext) {
      if (inList) { html += "</ul>"; inList = false; }

      // Header row
      const headerCells = line.trim().slice(1, -1).split("|").map(c => c.trim());
      html += `<div class="table-wrap"><table class="md-table"><thead><tr>`;
      headerCells.forEach(cell => { html += `<th>${inline(cell)}</th>`; });
      html += `</tr></thead><tbody>`;

      i += 2; 
      // Body rows
      while (i < lines.length && /^\|.+\|$/.test(lines[i].trim())) {
        const rowCells = lines[i].trim().slice(1, -1).split("|").map(c => c.trim());
        html += `<tr>`;
        rowCells.forEach(cell => { html += `<td>${inline(cell)}</td>`; });
        html += `</tr>`;
        i++;
      }

      html += `</tbody></table></div>`;
      continue;
    }

    // Headings: ### ## #
    if (/^### (.+)/.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h3>${inline(line.replace(/^### /, ""))}</h3>`;
    } else if (/^## (.+)/.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h2>${inline(line.replace(/^## /, ""))}</h2>`;
    } else if (/^# (.+)/.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<h1>${inline(line.replace(/^# /, ""))}</h1>`;
    }
    // Bullet list: * or -
    else if (/^[\*\-] (.+)/.test(line)) {
      if (!inList) { html += "<ul>"; inList = true; }
      html += `<li>${inline(line.replace(/^[\*\-] /, ""))}</li>`;
    }
    // Numbered list: 1. 2. etc
    else if (/^\d+\. (.+)/.test(line)) {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<li style="list-style:decimal;margin-left:18px">${inline(line.replace(/^\d+\. /, ""))}</li>`;
    }
    // Horizontal rule
    else if (/^---+$/.test(line.trim())) {
      if (inList) { html += "</ul>"; inList = false; }
      html += "<hr>";
    }
    // Empty line
    else if (line.trim() === "") {
      if (inList) { html += "</ul>"; inList = false; }
      html += "<br>";
    }
    // Normal paragraph
    else {
      if (inList) { html += "</ul>"; inList = false; }
      html += `<p>${inline(line)}</p>`;
    }

    i++;
  }

  if (inList) html += "</ul>";
  return html;
}

function inline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}
 
function handleStop() {
  stopRequested = true;
  if (currentTypewriterResolve) {
    currentTypewriterResolve();
    currentTypewriterResolve = null;
  }
  removeTyping();
  isLoading = false;
  setSendMode();
  messageInput.focus();
}

function setStopMode() {
  sendBtn.disabled = false;
  sendBtn.title = "Stop";
  sendBtn.style.background = "#ef4444";
  sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`;
}

function setSendMode() {
  sendBtn.title = "Send (Enter)";
  sendBtn.style.background = "";
  sendBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>`;
  sendBtn.disabled = false;
}

async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;

  if (pdfChatMode) {
    if (isExtractingPdf) {
      showToast("⏳ Your PDF is being processed. Please wait...");
      return;
    }
    if (!attachedPdfText) {
      showToast("📎 Please attach a PDF first.");
      return;
    }
  }

  if (!currentSessionId || !getSession()) {
    const id = Date.now().toString();
    const newSession = { id, title: "New Chat", messages: [] };
    chatSessions.unshift(newSession);
    currentSessionId = id;
    saveSessions();
    renderHistory();
  }

  showWelcome(false);

  if (pdfChatMode) {
    pdfChatMessages.push({ role: "user", content: text });
    renderMessage("user", text);
    showPdfRestartBtn();
  } else {
    const session = getSession();
    session.messages.push({ role: "user", content: text });
    renderMessage("user", text);
    if (session.messages.length === 1) {
      session.title = text.length > 40 ? text.substring(0, 40) + "…" : text;
      renderHistory();
    }
  }
 
  messageInput.value = "";
  messageInput.style.height = "24px";

  isLoading = true;
  stopRequested = false;
  setStopMode();
  renderTyping();

  if (!pdfChatMode) saveSessions();
 
  try {
    let reply;

    if (pdfChatMode && attachedPdfText) {
      reply = await callPdfChatAPI(pdfChatMessages, attachedPdfText);
    } else {
      const result = await callGeminiAPI(getSession().messages);
      reply = result.reply;
    }
    removeTyping();

    if (pdfChatMode) {
      pdfChatMessages.push({ role: "assistant", content: reply });
    } else {
      getSession().messages.push({ role: "assistant", content: reply });
    }
    await typewriterMessage(reply);
    if (!pdfChatMode) saveSessions();
  } catch (err) {
    removeTyping();
 
    console.error("[UL AI Error]", err);
 
    const msg = err.message || "";
    let userMsg = "";
 
    if (msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("not valid") || msg.toLowerCase().includes("invalid")) {
      userMsg = `⚠️ **Internal Issue**
 
Sorry, something went wrong on our end just now.
Let me notify **Boss Naeem** about this issue. He will investigate it as soon as possible.
 
> *If it's urgent, please visit [ul.edu.pk](https://ul.edu.pk) directly.*${isProductionEnv ? "" : `
 
---
🔧 *Dev Info: ${msg}*`}`;
 
    } else if (err.rateLimited) {
      userMsg = `🐢 **Slow Down a Little**

You've sent quite a few messages in a short time.
This limit exists so that **all students** can use UL AI fairly — one user shouldn't overload the system.
⏱️ Please wait a few minutes and try again.`;

    } else if (err.quotaExceeded) {
      const resetTime = err.resetTimePKT || "midnight";
      const hours = err.hoursRemaining;
      const hoursText = hours ? ` (in about **${hours} hours**)` : "";

      userMsg = `⏳ **Today's Limit Reached**

UL AI's free daily limit has just been reached.
🕐 It will reset at: **${resetTime}** Pakistan time${hoursText}
Please try again after that — everything will work normally.

> *If it's urgent, please visit [ul.edu.pk](https://ul.edu.pk) directly.*`;

    } else if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("429")) {
      userMsg = `⏳ **Please Try Again Shortly**
 
The system is receiving a lot of requests right now (rate limit).
Please wait **1-2 minutes** and try again.
> *If the problem continues, visit [ul.edu.pk](https://ul.edu.pk).*`;
 
    } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("failed")) {
      userMsg = `📡 **Check Your Internet Connection**
 
Couldn't connect to the server. Please check:
- Is your **internet** working properly?
- Are you using a **VPN**? Try turning it off.
- **Refresh** the page and try again.`;
 
    } else {
      userMsg = `⚠️ **Internal Issue**
 
Sorry, an unexpected error occurred.
Let me notify **Boss Naeem** about this issue. He will investigate it as soon as possible.
 
> *If it's urgent, please visit [ul.edu.pk](https://ul.edu.pk) directly.*${isProductionEnv ? "" : `
 
---
🔧 *Dev Info: ${msg}*`}`;
    }
 
    if (pdfChatMode) {
      pdfChatMessages.push({ role: "assistant", content: userMsg });
    } else {
      getSession().messages.push({ role: "assistant", content: userMsg });
      saveSessions();
    }
    renderMessage("ai", userMsg);
  }
 
  isLoading = false;
  setSendMode();
  messageInput.focus();
}

function updateTokenUsageBar(usage) {
  const pctEl = document.getElementById("tokenUsagePct");
  if (!pctEl || !usage) return;

  const percent = Math.max(0, Math.min(100, usage.percent ?? 0));
  pctEl.textContent = `${percent}% Used`;
}

async function loadInitialTokenUsage() {
  try {
    const res = await fetch("/api/usage");
    const data = await res.json();
    updateTokenUsageBar(data);
  } catch (_) {
    // Chup chaap ignore 
  }
}

async function parseJsonSafely(response) {
  const raw = await response.text();
  try {
    return JSON.parse(raw);
  } catch (_) {
    console.error("[Non-JSON Response]", raw.slice(0, 300));
    throw new Error(
      response.status === 413
        ? "PDF/message is too large (payload limit is crossed)."
        : response.status === 404
        ? "Server route nahi mila — server restart karna hoga."
        : `Server ne unexpected response diya (status ${response.status}).`
    );
  }
}

async function callGeminiAPI(messages) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, deviceId: getDeviceId() })
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

  if (data.usage) updateTokenUsageBar(data.usage);

  return {
    reply: data.reply || "No response received.",
    provider: data.provider || "gemini",
    isFirstFallback: !!data.isFirstFallback,
  };
}

function sendSuggestion(text) {
  messageInput.value = text;
  handleSend();
}
 
function autoResize(el) {
  const maxHeight = 220; 

  el.style.overflowY = "hidden";
  el.style.height = "auto";
  const newHeight = el.scrollHeight;

  if (newHeight > maxHeight) {
    el.style.height = maxHeight + "px";
    el.style.overflowY = "auto"; 
  } else {
    el.style.height = newHeight + "px";
    el.style.overflowY = "hidden";
  }
}