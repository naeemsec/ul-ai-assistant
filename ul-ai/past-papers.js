// ============================================================
// PAST PAPER ANALYZER — standalone feature file
// Server endpoints:
//   GET /api/papers/programs          → programs list (Drive folders)
//   GET /api/papers/list?folderId=X   → papers for a program
//
// Shared helpers from app.js (global):
//   clearMessages, showWelcome, closeSidebarMobile, showToast
// ============================================================

// ===== DOM REFS =====
const pastPaperScreen     = document.getElementById("pastPaperScreen");
const paperProgramSelect  = document.getElementById("paperProgramSelect");
const paperNextBtn        = document.getElementById("paperNextBtn");
const paperListArea       = document.getElementById("paperListArea");
const paperPreviewArea    = document.getElementById("paperPreviewArea");
const pastPaperBtn        = document.getElementById("pastPaperBtn");

// ===== STATE =====
let pastPaperMode = false;
let programsLoaded = false;
let programFolderMap = {}; // { displayName: folderId }

// ===== SETUP — app.js se call hoga =====
function setupPastPaperListeners() {
  if (pastPaperBtn) {
    pastPaperBtn.addEventListener("click", enterPastPaperMode);
  }

  if (paperNextBtn) {
    paperNextBtn.addEventListener("click", loadPaperList);
  }
}

// ===== ENTER / EXIT =====
function enterPastPaperMode() {
  pastPaperMode = true;

  clearMessages();
  showWelcome(false);

  // Saari welcome screens hide karo
  document.querySelectorAll(".welcome-screen").forEach(el => el.classList.add("hidden"));
  pastPaperScreen.classList.remove("hidden");

  // Input area hide
  document.body.classList.add("past-paper-mode");

  // Sidebar highlights
  if (pastPaperBtn) pastPaperBtn.classList.add("active");
  document.querySelectorAll(".history-item-wrap.active").forEach(el => el.classList.remove("active"));
  if (typeof pdfChatBtn !== "undefined") pdfChatBtn?.classList.remove("active");
  if (typeof meritListBtn !== "undefined") meritListBtn?.classList.remove("active");

  closeSidebarMobile();

  // Programs load karo (pehli baar)
  if (!programsLoaded) loadPrograms();

  // Reset areas
  paperListArea.innerHTML = "";
  paperPreviewArea.classList.add("hidden");
  paperPreviewArea.innerHTML = "";
}

function exitPastPaperMode() {
  if (!pastPaperMode) return;
  pastPaperMode = false;
  pastPaperScreen.classList.add("hidden");
  document.body.classList.remove("past-paper-mode");
  if (pastPaperBtn) pastPaperBtn.classList.remove("active");
}

// ===== LOAD PROGRAMS DROPDOWN =====
async function loadPrograms() {
  paperProgramSelect.innerHTML = '<option value="">Loading programs…</option>';
  paperProgramSelect.disabled = true;

  try {
    const res = await fetch("/api/papers/programs");
    const data = await res.json();

    if (!res.ok || !data.programs || data.programs.length === 0) {
      paperProgramSelect.innerHTML = '<option value="">No programs found</option>';
      return;
    }

    paperProgramSelect.innerHTML = '<option value="">— Select your program —</option>';
    programFolderMap = {};

    data.programs.forEach(p => {
      programFolderMap[p.name] = p.folderId;
      const opt = document.createElement("option");
      opt.value = p.folderId;
      opt.textContent = p.name;
      paperProgramSelect.appendChild(opt);
    });

    paperProgramSelect.disabled = false;
    programsLoaded = true;

  } catch (err) {
    paperProgramSelect.innerHTML = '<option value="">Could not load — check connection</option>';
    console.error("[Past Papers - Load Programs Error]", err);
  }
}

// ===== LOAD PAPERS TABLE =====
async function loadPaperList() {
  const folderId = paperProgramSelect.value;
  const programName = paperProgramSelect.options[paperProgramSelect.selectedIndex]?.text;

  if (!folderId) {
    showToast("⚠️ Please select a program first.");
    return;
  }

  // Reset preview
  paperPreviewArea.classList.add("hidden");
  paperPreviewArea.innerHTML = "";

  // Loading state
  paperNextBtn.disabled = true;
  paperNextBtn.textContent = "Loading…";
  paperListArea.innerHTML = `
    <div class="merit-loading">
      <div class="merit-spinner"></div>
      <span>Fetching papers from Google Drive…</span>
    </div>`;

  try {
    const res = await fetch(`/api/papers/list?folderId=${encodeURIComponent(folderId)}`);
    const data = await res.json();

    if (!res.ok) {
      paperListArea.innerHTML = `<div class="merit-result-card error"><div class="merit-result-icon">⚠️</div><div class="merit-result-msg">${data.error || "Something went wrong."}</div></div>`;
      return;
    }

    if (!data.papers || data.papers.length === 0) {
      paperListArea.innerHTML = `
        <div class="merit-result-card not-found">
          <div class="merit-result-icon">📭</div>
          <div class="merit-result-title">No Papers Yet</div>
          <div class="merit-result-msg">No past papers have been uploaded for <strong>${programName}</strong> yet. Check back later!</div>
        </div>`;
      return;
    }

    renderPaperTable(data.papers, programName);

  } catch (err) {
    paperListArea.innerHTML = `<div class="merit-result-card error"><div class="merit-result-icon">⚠️</div><div class="merit-result-msg">Could not reach server. Please try again.</div></div>`;
    console.error("[Past Papers - Load List Error]", err);
  } finally {
    paperNextBtn.disabled = false;
    paperNextBtn.textContent = "Show Papers";
  }
}

// ===== RENDER TABLE =====
function renderPaperTable(papers, programName) {
  let html = `
    <div class="merit-results-header" style="margin-bottom:10px">
      📄 <strong>${papers.length} paper${papers.length > 1 ? "s" : ""}</strong> found for <strong>${programName}</strong>
    </div>
    <table class="paper-table">
      <thead>
        <tr>
          <th>Semester</th>
          <th>Year</th>
          <th>Subject</th>
          <th>Exam</th>
          <th>Paper #</th>
          <th></th>
        </tr>
      </thead>
      <tbody>`;

  papers.forEach(p => {
    const examBadge = p.examType === "Mid"
      ? `<span class="paper-badge mid">Mid</span>`
      : p.examType === "Final"
      ? `<span class="paper-badge final">Final</span>`
      : `<span class="paper-badge quiz">Quiz</span>`;

    html += `
      <tr class="paper-row" data-fileid="${p.fileId}" data-subject="${p.subject}" data-exam="${p.examType}" data-year="${p.year}" data-sem="${p.semester}">
        <td>Sem ${p.semester}</td>
        <td>${p.year}</td>
        <td>${p.subject}</td>
        <td>${examBadge}</td>
        <td>#${p.paperNo}</td>
        <td><button class="paper-view-btn">View</button></td>
      </tr>`;
  });

  html += `</tbody></table>`;
  paperListArea.innerHTML = html;

  // Row click → preview
  paperListArea.querySelectorAll(".paper-row").forEach(row => {
    row.addEventListener("click", () => {
      const fileId = row.dataset.fileid;
      const label = `${row.dataset.subject} — ${row.dataset.exam} ${row.dataset.year} (Sem ${row.dataset.sem})`;
      openPaperPreview(fileId, label);
    });
  });
}

// ===== PAPER PREVIEW =====
function openPaperPreview(fileId, label) {
  const previewUrl = `https://drive.google.com/file/d/${fileId}/preview`;
  const openUrl   = `https://drive.google.com/file/d/${fileId}/view`;

  paperPreviewArea.classList.remove("hidden");
  paperPreviewArea.innerHTML = `
    <div class="paper-preview-header">
      <span style="color:var(--text-secondary);font-size:13px">${label}</span>
      <a href="https://drive.google.com/uc?export=download&id=${fileId}" download>⬇ Download PDF</a>
    </div>
    <iframe
      class="paper-preview-frame"
      src="${previewUrl}"
      allowfullscreen
    ></iframe>`;
  // Smooth scroll to preview
  paperPreviewArea.scrollIntoView({ behavior: "smooth", block: "start" });
}