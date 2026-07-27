// ============================================================
// MERIT LIST CHECKER — standalone feature file
// Server endpoints use karta hai:
//   GET  /api/merit-programs  → sab programs ki list
//   POST /api/merit-search    → { program, query } → results
//
// Ye file index.html mein app.js ke BAAD load honi chahiye.
// DOM refs: meritListScreen, meritProgramSelect,
//           meritQueryInput, meritFindBtn, meritResultArea
// ============================================================

// ===== DOM REFS =====
const meritListScreen   = document.getElementById("meritListScreen");
const meritProgramSelect = document.getElementById("meritProgramSelect");
const meritQueryInput   = document.getElementById("meritQueryInput");
const meritFindBtn      = document.getElementById("meritFindBtn");
const meritResultArea   = document.getElementById("meritResultArea");
const meritListBtn      = document.getElementById("meritListBtn"); // sidebar button

// ===== STATE =====
let meritListMode = false;
let meritProgramsLoaded = false;

// ===== SIDEBAR BUTTON LISTENER =====
if (meritListBtn) {
  meritListBtn.addEventListener("click", enterMeritListMode);
}

// ===== ENTER / EXIT MERIT LIST MODE =====
function enterMeritListMode() {
  // Kisi aur mode (jaise PDF Chat) se aa rahe hain to uska poora cleanup kar do
  if (typeof exitPdfChatMode === "function") exitPdfChatMode();

  meritListMode = true;
  clearMessages();
  showWelcome(false);

  document.querySelectorAll(".welcome-screen").forEach(el => el.classList.add("hidden"));
  meritListScreen.classList.remove("hidden");

  document.querySelectorAll(".feature-btn").forEach(btn => btn.classList.remove("active"));
  if (meritListBtn) meritListBtn.classList.add("active");
  document.querySelectorAll(".history-item-wrap.active").forEach(el => el.classList.remove("active"));

  closeSidebarMobile();
  document.body.classList.add("merit-mode");

  if (!meritProgramsLoaded) loadMeritPrograms();
}

function exitMeritListMode() {
  if (!meritListMode) return;
  meritListMode = false;
  meritListScreen.classList.add("hidden");
  document.body.classList.remove("merit-mode");
  if (meritListBtn) meritListBtn.classList.remove("active");
}

// ===== LOAD PROGRAMS DROPDOWN =====
async function loadMeritPrograms() {
  meritProgramSelect.innerHTML = '<option value="">Loading programs…</option>';
  meritProgramSelect.disabled = true;

  try {
    const res = await fetch("/api/merit-programs");
    const data = await res.json();

    if (!res.ok || !data.programs || data.programs.length === 0) {
      meritProgramSelect.innerHTML = '<option value="">No programs available right now</option>';
      return;
    }

    meritProgramSelect.innerHTML = '<option value="">— Select your program —</option>';
    data.programs.forEach(prog => {
      const opt = document.createElement("option");
      opt.value = prog;
      opt.textContent = prog;
      meritProgramSelect.appendChild(opt);
    });

    meritProgramSelect.disabled = false;
    meritProgramsLoaded = true;

  } catch (err) {
    meritProgramSelect.innerHTML = '<option value="">Could not load — check connection</option>';
    console.error("[Merit Programs Load Error]", err);
  }
}

// ===== SEARCH BUTTON =====
meritFindBtn.addEventListener("click", searchMeritList);

meritQueryInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") searchMeritList();
});

async function searchMeritList() {
  const program = meritProgramSelect.value.trim();
  const query   = meritQueryInput.value.trim();

  if (!program) {
    showMeritError("Please select your program first.");
    meritProgramSelect.focus();
    return;
  }
  if (!query) {
    showMeritError("Please enter your Form No or Full Name.");
    meritQueryInput.focus();
    return;
  }

  meritFindBtn.disabled = true;
  meritFindBtn.textContent = "Searching…";
  meritResultArea.innerHTML = `
    <div class="merit-loading">
      <div class="merit-spinner"></div>
      <span>Checking merit lists from ul.edu.pk…</span>
    </div>`;

  try {
    const res = await fetch("/api/merit-search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ program, query }),
    });

    const data = await res.json();

    if (!res.ok) {
      showMeritError(data.error || "Something went wrong. Please try again.");
      return;
    }

    if (!data.found) {
      showMeritNotFound(data.message, program);
      return;
    }

    showMeritResults(data.matches, program, query);

  } catch (err) {
    showMeritError("Could not reach the server. Check your connection and try again.");
    console.error("[Merit Search Error]", err);
  } finally {
    meritFindBtn.disabled = false;
    meritFindBtn.textContent = "Find My Result";
  }
}

// ===== RESULT RENDERERS =====
function showMeritError(msg) {
  meritResultArea.innerHTML = `
    <div class="merit-result-card error">
      <div class="merit-result-icon">⚠️</div>
      <div class="merit-result-msg">${msg}</div>
    </div>`;
}

function showMeritNotFound(msg, program) {
  meritResultArea.innerHTML = `
    <div class="merit-result-card not-found">
      <div class="merit-result-icon">😔</div>
      <div class="merit-result-title">Not Found</div>
      <div class="merit-result-msg">${msg}</div>
      <div class="merit-result-hint">
        💡 Tip: Try searching with your Form No for exact match.<br>
        You can also check directly at 
        <a href="https://ul.edu.pk/program_merit_list" target="_blank">ul.edu.pk/program_merit_list</a>
      </div>
    </div>`;
}

function showMeritResults(matches, program, query) {
  const plural = matches.length > 1 ? `${matches.length} results` : "1 result";

  let html = `
    <div class="merit-results-header">
      ✅ Found <strong>${plural}</strong> for "<em>${query}</em>" in <strong>${program}</strong>
    </div>`;

  matches.forEach((m, i) => {
    // Merit % — agar available hai to badge
    const meritBadge = m.meritPercent
      ? `<span class="merit-percent-badge">${m.meritPercent}%</span>`
      : "";

    // Last date badge
    const lastDateBadge = m.lastDate
      ? `<span class="merit-lastdate">📅 Confirm by: <strong>${m.lastDate}</strong></span>`
      : "";

    html += `
      <div class="merit-result-card found">
        <div class="merit-card-top">
          <div class="merit-card-name">
            ${m.studentName || "—"}
            ${meritBadge}
          </div>
          <div class="merit-card-list-tag">${m.meritListNumber || "Merit List"} • ${m.shift || ""}</div>
        </div>

        <div class="merit-card-grid">
          <div class="merit-card-field">
            <span class="field-label">Sr #</span>
            <span class="field-value">${m.srNo || "—"}</span>
          </div>
          <div class="merit-card-field">
            <span class="field-label">Form No</span>
            <span class="field-value">${m.formNo || "—"}</span>
          </div>
          <div class="merit-card-field">
            <span class="field-label">Father's Name</span>
            <span class="field-value">${m.fatherName || "—"}</span>
          </div>
          <div class="merit-card-field">
            <span class="field-label">Inter Marks</span>
            <span class="field-value">${m.interObtain || "—"} / ${m.interTotal || "—"}</span>
          </div>
          <div class="merit-card-field">
            <span class="field-label">Matric Marks</span>
            <span class="field-value">${m.matricObtain || "—"} / ${m.matricTotal || "—"}</span>
          </div>
          <div class="merit-card-field">
            <span class="field-label">Hafiz Quran</span>
            <span class="field-value">${m.hafizQuran || "—"}</span>
          </div>
        </div>

        ${lastDateBadge}
      </div>`;
  });

  html += `
    <div class="merit-docs-tip">
      <div class="merit-docs-title">📋 Required Documents for Admission</div>
      <ul class="merit-docs-list">
        <li>All original academic certificates/degrees</li>
        <li>Two (02) sets of photocopies of all certificates/degrees</li>
        <li>Five (05) recent passport-size photographs</li>
        <li>Original CNIC / Form-B and a photocopy</li>
        <li>Affidavit</li>
        <li>Original Fee Challan</li>
      </ul>
      ${(matches[0]?.campus || matches[0]?.lastDate) ? `
      <div class="merit-docs-deadline">
        Candidates are advised to visit the <strong class="merit-campus-name">${matches[0]?.campus || "University Campus"}</strong> on or before <strong>${matches[0]?.lastDate || ""}</strong> for document verification and completion of admission formalities.
      </div>` : ""}
    </div>`;

  meritResultArea.innerHTML = html;
}