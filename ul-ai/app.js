// ===== CONFIGURATION =====
// NOTE: API key aur university context ab backend (server.js) mein hain — secure!
// Frontend sirf /api/chat endpoint ko call karta hai.
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
 
// ===== DOM REFS =====
const sidebar        = document.getElementById("sidebar");
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
const aboutModal     = document.getElementById("aboutModal");
const closeSettings  = document.getElementById("closeSettings");
const closeAbout     = document.getElementById("closeAbout");
const openAboutBtn   = document.getElementById("openAboutBtn");
 
// const ta = document.getElementById("messageInput");

// ta.addEventListener("input", () => {
//     console.log(
//         "height =", ta.style.height,
//         "scrollHeight =", ta.scrollHeight
//     );
// });

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
  loadSessions();
  setupEventListeners();
  autoResize(document.getElementById("messageInput"));
 
  // BUG FIX: Tab switch pe naya chat mat banao — pehla existing session restore karo
  if (chatSessions.length > 0) {
    currentSessionId = chatSessions[0].id;
    switchSession(currentSessionId);
  } else {
    // Pehli baar open — sirf welcome show karo, empty chat mat banao
    showWelcome(true);
  }
});
 
function setupEventListeners() {
  sidebarToggle.addEventListener("click", toggleSidebar);
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
  closeSettings.addEventListener("click", () => settingsModal.classList.remove("open"));
  closeAbout.addEventListener("click", () => aboutModal.classList.remove("open"));
  openAboutBtn.addEventListener("click", () => {
    settingsModal.classList.remove("open");
    aboutModal.classList.add("open");
  });
 
  // Close modals on backdrop click
  settingsModal.addEventListener("click", (e) => { if (e.target === settingsModal) settingsModal.classList.remove("open"); });
  aboutModal.addEventListener("click", (e) => { if (e.target === aboutModal) aboutModal.classList.remove("open"); });
 
  // Close context menu on outside click
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
}
 
// ===== SIDEBAR =====
function toggleSidebar() {
  sidebar.classList.toggle("collapsed");
}
 
// ===== THEME =====
function toggleTheme() {
  const html = document.documentElement;
  const isDark = html.getAttribute("data-theme") === "dark";
  html.setAttribute("data-theme", isDark ? "light" : "dark");
  themeToggle.querySelector(".theme-icon").textContent = isDark ? "☀️" : "🌙";
  themeToggle.querySelector("span:last-child").textContent = isDark ? "Light Mode" : "Dark Mode";
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
  // Agar current session already empty hai to naya mat banao
  const existing = getSession();
  if (existing && existing.messages.length === 0) {
    clearMessages();
    showWelcome(true);
    messageInput.focus();
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
}
 
function switchSession(id) {
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
  const newTitle = prompt("Chat ka naya naam likhein:", session.title);
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
  const div = document.createElement("div");
  div.className = `message ${role}`;
 
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "U" : "UL";
 
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.innerHTML = formatText(content);
 
  div.appendChild(avatar);
  div.appendChild(bubble);
  messagesEl.appendChild(div);
  scrollToBottom();
  return div;
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
    // Split into words (keep spaces)
    const words = text.split(/(\s+)/);
    let i = 0;
    const speed = 18; // ms per word — lower = faster
 
    function typeWord() {
      if (stopRequested) {
        // Stop pe jo text abhi tak type hua hai wahi dikhao
        bubble.innerHTML = formatText(words.slice(0, i).join(""));
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
 
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
 
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
  }
 
  if (inList) html += "</ul>";
  return html;
}
 
// Inline formatting: bold, italic, code, links
function inline(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.*?)\*/g, "<em>$1</em>")
    .replace(/`(.*?)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
}
 
// ===== STOP GENERATION =====
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

// ===== BUTTON MODE SWITCH =====
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

// ===== SEND MESSAGE =====
// ===== SEND MESSAGE =====
async function handleSend() {
  const text = messageInput.value.trim();
  if (!text || isLoading) return;

  // Agar koi session nahi hai to naya banao
  if (!currentSessionId || !getSession()) {
    const id = Date.now().toString();
    const newSession = { id, title: "New Chat", messages: [] };
    chatSessions.unshift(newSession);
    currentSessionId = id;
    saveSessions();
    renderHistory();
  }

  const session = getSession();
  showWelcome(false);
 
  session.messages.push({ role: "user", content: text });
  renderMessage("user", text);
 
  if (session.messages.length === 1) {
    session.title = text.length > 40 ? text.substring(0, 40) + "…" : text;
    renderHistory();
  }
 
  messageInput.value = "";
  messageInput.style.height = "24px";

  isLoading = true;
  stopRequested = false;
  setStopMode();
  renderTyping();
  saveSessions();
 
  try {
    const reply = await callGeminiAPI(session.messages);
    removeTyping();
    session.messages.push({ role: "assistant", content: reply });
    await typewriterMessage(reply);
    saveSessions();
  } catch (err) {
    removeTyping();
 
    // ===== DEBUG: Console pe full error dekho (development ke liye) =====
    console.error("[UL AI Error]", err);
 
    // ===== ERROR TYPE DETECT KARO =====
    const msg = err.message || "";
    let userMsg = "";
 
    if (msg.toLowerCase().includes("api key") || msg.toLowerCase().includes("not valid") || msg.toLowerCase().includes("invalid")) {
      // Development mein: actual error dikhao
      // Production mein: professional message
      userMsg = `⚠️ **Internal Issue**
 
Mujhe afsos hai, abhi kuch technical masla aa gaya hai.
 
Main **Boss Naeem** se rabta kar raha hoon taake ye jald fix ho sake.
 
> *Agar urgent kaam hai to seedha [ul.edu.pk](https://ul.edu.pk) visit karein.*
 
---
🔧 *Dev Info: ${msg}*`;
 
    } else if (msg.toLowerCase().includes("quota") || msg.toLowerCase().includes("limit") || msg.toLowerCase().includes("429")) {
      userMsg = `⏳ **Thori Dair Baad Try Karein**
 
Abhi system pe bohot zyada requests aa rahi hain (rate limit).
 
Kripya **1-2 minute** baad dobara try karein.
 
> *Agar problem continue ho to [ul.edu.pk](https://ul.edu.pk) visit karein.*`;
 
    } else if (msg.toLowerCase().includes("network") || msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("failed")) {
      userMsg = `📡 **Internet Connection Check Karein**
 
Server se connection nahi ho paya. Yeh check karein:
- **Internet** sahi kaam kar raha hai?
- **VPN** use ho rahi hai? Band kar ke try karein.
- Page **refresh** kar ke dobara try karein.`;
 
    } else {
      userMsg = `⚠️ **Internal Issue**
 
Mujhe afsos hai, ek unexpected error aaya hai.
 
Main **Boss Naeem** se rabta kar raha hoon taake ye jald fix ho sake.
 
> *Agar urgent kaam hai to seedha [ul.edu.pk](https://ul.edu.pk) visit karein.*
 
---
🔧 *Dev Info: ${msg}*`;
    }
 
    session.messages.push({ role: "assistant", content: userMsg });
    renderMessage("ai", userMsg);
    saveSessions();
  }
 
  isLoading = false;
  setSendMode();
  messageInput.focus();
}
 
// ===== BACKEND API CALL (Secure — API key backend mein chupi hai) =====
async function callGeminiAPI(messages) {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages })
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `Server Error ${response.status}`);
  }

  return data.reply || "No response received.";
}

// ===== SUGGESTION CARDS =====
function sendSuggestion(text) {
  messageInput.value = text;
  handleSend();
}
 
// ===== AUTO RESIZE TEXTAREA =====
function autoResize(el) {
  el.style.height = "0px";
  el.style.height = el.scrollHeight + "px";
}