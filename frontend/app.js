const state = {
  tab: "chat",
  tone: localStorage.getItem("tone") || "savage",
  userName: localStorage.getItem("userName") || "",
  history: JSON.parse(localStorage.getItem("sigmaChatHistoryV2") || "[]"),
  selectedFiles: [],
  pdfSummary: JSON.parse(localStorage.getItem("sigmaPdfSummaryV1") || "null"),
  pdfHistory: JSON.parse(localStorage.getItem("sigmaPdfHistoryV1") || "[]"),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const chatLog = $("#chatLog");
const chatInput = $("#chatInput");
const apiKeyInput = $("#apiKey");
const modelSelect = $("#model");
const toneSelect = $("#tone");
const summaryModeSelect = $("#summaryMode");
const userNameLabel = $("#userName");
const toast = $("#toast");

apiKeyInput.value = localStorage.getItem("groqApiKey") || "";
modelSelect.value = localStorage.getItem("model") || "llama-3.1-8b-instant";
toneSelect.value = state.tone;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function getAiConfig() {
  return {
    api_key: apiKeyInput.value.trim() || null,
    model: modelSelect.value,
  };
}

function saveSettings() {
  localStorage.setItem("groqApiKey", apiKeyInput.value.trim());
  localStorage.setItem("model", modelSelect.value);
  localStorage.setItem("tone", toneSelect.value);
  state.tone = toneSelect.value;
}

function setLoading(isLoading) {
  $("#sendButton").disabled = isLoading;
  $("#attachPdf").disabled = isLoading;
  chatInput.disabled = isLoading;
}

function addMessage(role, htmlOrText, isHtml = false) {
  const article = document.createElement("article");
  article.className = `message ${role}`;

  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "Y" : "S";

  const body = document.createElement("div");
  body.className = "message-body";
  const name = document.createElement("strong");
  name.textContent = role === "user" ? "You" : "SavageBot AI";
  const content = document.createElement("p");
  if (isHtml) {
    content.remove();
    body.appendChild(name);
    const wrap = document.createElement("div");
    wrap.innerHTML = htmlOrText;
    body.appendChild(wrap);
  } else if (role === "assistant") {
    content.remove();
    body.appendChild(name);
    const wrap = document.createElement("div");
    wrap.className = "formatted-content";
    wrap.innerHTML = renderFormattedText(htmlOrText);
    body.appendChild(wrap);
  } else {
    content.textContent = htmlOrText;
    body.append(name, content);
  }

  article.append(avatar, body);
  chatLog.appendChild(article);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderChatHistory() {
  state.history.forEach((message) => addMessage(message.role === "assistant" ? "assistant" : "user", message.content));
}

function syncIdentity() {
  userNameLabel.textContent = state.userName || "Not set";
  if (state.userName) localStorage.setItem("userName", state.userName);
}

function switchTab(tab) {
  state.tab = tab;
  $$(".mode-item").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $("#toneWrap").classList.toggle("hidden", tab !== "chat");
  $("#summaryWrap").classList.toggle("hidden", tab !== "pdf");
  $("#attachPdf").classList.toggle("hidden", tab !== "pdf");
  $("#chatForm").classList.toggle("has-attach", tab === "pdf");
  $("#modeLabel").textContent = tab === "chat" ? "Savage Chat" : "PDF Summarizer";
  $("#workspaceTitle").textContent = tab === "chat" ? "SavageBot AI" : "PDF Summary Bot";
  chatInput.placeholder = tab === "chat" ? "Ask anything... lazy questions get roasted" : "Upload PDFs, then ask for summary or comparison...";
  $("#suggestions").innerHTML = tab === "chat"
    ? `
      <button type="button" data-prompt="My name is Sunny">Set my name</button>
      <button type="button" data-prompt="Explain RAG in simple words">Explain RAG</button>
      <button type="button" data-prompt="Prepare me for a GenAI project viva">Viva prep</button>
    `
    : `
      <button type="button" data-prompt="Summarize this PDF for exam revision">Exam summary</button>
      <button type="button" data-prompt="Compare these PDFs and rank them">Compare</button>
      <button type="button" data-prompt="Who is the strongest and why?">Best one?</button>
    `;
  bindSuggestions();
  $(".sidebar").classList.remove("open");
}

async function sendChat(message) {
  addMessage("user", message);
  state.history.push({ role: "user", content: message });
  setLoading(true);

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        user_name: state.userName || null,
        history: state.history.slice(-10),
        tone: toneSelect.value,
        ...getAiConfig(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Chat failed");
    if (data.user_name) state.userName = data.user_name;
    addMessage("assistant", data.reply);
    state.history.push({ role: "assistant", content: data.reply });
    localStorage.setItem("sigmaChatHistoryV2", JSON.stringify(state.history.slice(-20)));
    syncIdentity();
  } catch (error) {
    addMessage("assistant", `Backend says: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code class=\"inline-code\">$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function renderTextBlock(text) {
  const lines = text.split("\n");
  const chunks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();
    if (!line) {
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(`<li>${formatInline(lines[index].trim().replace(/^[-*]\s+/, ""))}</li>`);
        index += 1;
      }
      chunks.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(`<li>${formatInline(lines[index].trim().replace(/^\d+\.\s+/, ""))}</li>`);
        index += 1;
      }
      chunks.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^[-*]\s+/.test(lines[index].trim()) &&
      !/^\d+\.\s+/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    chunks.push(`<p>${formatInline(paragraph.join(" "))}</p>`);
  }

  return chunks.join("");
}

function renderFormattedText(text) {
  const source = String(text || "");
  const codeFence = /```([\w+-]*)\n?([\s\S]*?)```/g;
  let html = "";
  let lastIndex = 0;
  let match;

  while ((match = codeFence.exec(source)) !== null) {
    html += renderTextBlock(source.slice(lastIndex, match.index));
    const language = match[1] || "code";
    const code = escapeHtml(match[2].trim());
    html += `
      <div class="code-block">
        <div class="code-head">
          <span>${escapeHtml(language)}</span>
          <button type="button" data-copy-code>Copy</button>
        </div>
        <pre><code>${code}</code></pre>
      </div>
    `;
    lastIndex = match.index + match[0].length;
  }

  html += renderTextBlock(source.slice(lastIndex));
  return html || "<p></p>";
}

function renderSummary(data) {
  state.pdfSummary = data;
  state.pdfHistory = [];
  localStorage.setItem("sigmaPdfSummaryV1", JSON.stringify(data));
  localStorage.removeItem("sigmaPdfHistoryV1");
  const points = (data.key_points || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const actions = (data.action_items || []).map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const keywords = (data.keywords || []).map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join("");
  const cards = (data.study_cards || []).map((card) => `
    <div class="flashcard">
      <strong>${escapeHtml(card.question)}</strong>
      <p>${escapeHtml(card.answer)}</p>
    </div>
  `).join("");

  addMessage("assistant", `
    <div class="summary-card">
      <h3>${escapeHtml(data.title || "PDF Summary")}</h3>
      <p>${escapeHtml(data.overview || "")}</p>
      <h4>Key Points</h4>
      <ul>${points || "<li>No key points returned.</li>"}</ul>
      <h4>Study Flashcards</h4>
      <div class="flashcards">${cards || "<p>No flashcards returned.</p>"}</div>
      <h4>Keywords</h4>
      <div class="tag-row">${keywords || "<span class='tag'>None</span>"}</div>
      <h4>Action Items</h4>
      <ul>${actions || "<li>No action items returned.</li>"}</ul>
      <p><strong>Now ask follow-up questions about this PDF.</strong> I will answer from this summary, not hallucinate like a sleepy intern.</p>
    </div>
  `, true);
}

function renderComparison(data) {
  state.pdfSummary = data;
  state.pdfHistory = [];
  localStorage.setItem("sigmaPdfSummaryV1", JSON.stringify(data));
  localStorage.removeItem("sigmaPdfHistoryV1");
  const ranking = (data.ranking || []).map((item) => (
    `<li><strong>#${escapeHtml(item.rank)} ${escapeHtml(item.file_name)}</strong>: ${escapeHtml(item.reason)}</li>`
  )).join("");
  const rows = (data.comparison_table || []).map((row) => `
    <tr>
      <td>${escapeHtml(row.criterion)}</td>
      <td>${escapeHtml(row.winner)}</td>
      <td>${escapeHtml(row.notes)}</td>
    </tr>
  `).join("");
  const strengths = (data.strengths || []).map((item) => `
    <div class="flashcard">
      <strong>${escapeHtml(item.file_name)} strengths</strong>
      <ul>${(item.points || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
    </div>
  `).join("");
  const weaknesses = (data.weaknesses || []).map((item) => `
    <div class="flashcard">
      <strong>${escapeHtml(item.file_name)} weaknesses</strong>
      <ul>${(item.points || []).map((point) => `<li>${escapeHtml(point)}</li>`).join("")}</ul>
    </div>
  `).join("");

  addMessage("assistant", `
    <div class="summary-card">
      <h3>${escapeHtml(data.title || "PDF Comparison")}</h3>
      <p><strong>Verdict:</strong> ${escapeHtml(data.verdict || "No verdict returned.")}</p>
      <h4>Ranking</h4>
      <ol>${ranking || "<li>No ranking returned.</li>"}</ol>
      <h4>Comparison Table</h4>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Criterion</th><th>Winner</th><th>Notes</th></tr></thead>
          <tbody>${rows || "<tr><td colspan='3'>No table returned.</td></tr>"}</tbody>
        </table>
      </div>
      <h4>Strengths</h4>
      <div class="flashcards">${strengths || "<p>No strengths returned.</p>"}</div>
      <h4>Weaknesses</h4>
      <div class="flashcards">${weaknesses || "<p>No weaknesses returned.</p>"}</div>
      <h4>Recommendation</h4>
      <p>${escapeHtml(data.recommendation || "No recommendation returned.")}</p>
    </div>
  `, true);
}

async function askPdfFollowup(question, options = {}) {
  if (options.addUser !== false) {
    addMessage("user", question);
  }
  state.pdfHistory.push({ role: "user", content: question });
  setLoading(true);

  try {
    const response = await fetch("/api/pdf-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        summary: state.pdfSummary,
        history: state.pdfHistory.slice(-8),
        ...getAiConfig(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "PDF follow-up failed");
    addMessage("assistant", data.reply);
    state.pdfHistory.push({ role: "assistant", content: data.reply });
    localStorage.setItem("sigmaPdfHistoryV1", JSON.stringify(state.pdfHistory.slice(-8)));
  } catch (error) {
    addMessage("assistant", `PDF follow-up failed: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function summarizePdf(userPrompt) {
  if (!state.selectedFiles.length) {
    if (state.pdfSummary && userPrompt) {
      askPdfFollowup(userPrompt);
      return;
    }
    showToast("Upload a PDF first.");
    $("#pdfFile").click();
    return;
  }

  if (state.selectedFiles.length > 1) {
    comparePdfs(userPrompt || "Compare these PDFs and rank them");
    return;
  }

  addMessage("user", userPrompt || `Summarize ${state.selectedFiles[0].name}`);
  setLoading(true);
  const shouldAnswerAfterSummary = Boolean(
    userPrompt && !/summari[sz]e|summary|flashcards?|keywords?|action items?|notes?/i.test(userPrompt)
  );

  const formData = new FormData();
  formData.append("file", state.selectedFiles[0]);
  formData.append("mode", summaryModeSelect.value);
  const config = getAiConfig();
  if (config.api_key) formData.append("api_key", config.api_key);
  formData.append("model", config.model);

  try {
    const response = await fetch("/api/summarize", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Summary failed");
    renderSummary(data);
    if (shouldAnswerAfterSummary) {
      await askPdfFollowup(userPrompt, { addUser: false });
    }
  } catch (error) {
    addMessage("assistant", `PDF summary failed: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

async function comparePdfs(userPrompt) {
  if (state.selectedFiles.length < 2) {
    showToast("Upload at least two PDFs to compare.");
    return;
  }

  addMessage("user", userPrompt || "Compare these PDFs");
  setLoading(true);

  const formData = new FormData();
  state.selectedFiles.forEach((file) => formData.append("files", file));
  formData.append("mode", summaryModeSelect.value);
  formData.append("question", userPrompt || "Compare these PDFs and rank them.");
  const config = getAiConfig();
  if (config.api_key) formData.append("api_key", config.api_key);
  formData.append("model", config.model);

  try {
    const response = await fetch("/api/compare-pdfs", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Comparison failed");
    renderComparison(data);
  } catch (error) {
    addMessage("assistant", `PDF comparison failed: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function setFiles(files) {
  const pdfs = Array.from(files || []).filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) {
    showToast("Upload PDF files.");
    return;
  }
  state.selectedFiles = pdfs.slice(0, 5);
  state.pdfSummary = null;
  state.pdfHistory = [];
  localStorage.removeItem("sigmaPdfSummaryV1");
  localStorage.removeItem("sigmaPdfHistoryV1");
  $("#fileName").innerHTML = state.selectedFiles.map((file) => `<span class="pdf-chip">${escapeHtml(file.name)}</span>`).join("");
  $("#fileChip").classList.remove("hidden");
  const count = state.selectedFiles.length;
  addMessage(
    "assistant",
    count === 1
      ? `PDF loaded: ${state.selectedFiles[0].name}. Hit Send to summarize it, or ask a specific question.`
      : `${count} PDFs loaded. Ask me to compare, rank, select the best, or find differences. Finally, a useful task.`
  );
}

function bindSuggestions() {
  $$("#suggestions button").forEach((button) => {
    button.addEventListener("click", () => {
      chatInput.value = button.dataset.prompt;
      chatInput.focus();
    });
  });
}

async function checkHealth() {
  try {
    const response = await fetch("/api/health");
    const data = await response.json();
    $("#apiStatus").textContent = data.status === "ready" ? "Backend ready" : "Backend warming up";
  } catch {
    $("#apiStatus").textContent = "Backend offline";
  }
}

$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  chatInput.value = "";
  if (state.tab === "pdf") {
    if (state.pdfSummary && message && !/summari[sz]e|new summary|again/i.test(message)) {
      askPdfFollowup(message);
      return;
    }
    summarizePdf(message || "Summarize this PDF");
    return;
  }
  if (message) sendChat(message);
});

$$(".mode-item").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

$("#newChat").addEventListener("click", () => {
  localStorage.removeItem("sigmaChatHistoryV2");
  state.history = [];
  chatLog.innerHTML = "";
  addMessage("assistant", "Fresh chat. Tell me your name first, then ask something worthy.");
});

$("#attachPdf").addEventListener("click", () => $("#pdfFile").click());
$("#pdfFile").addEventListener("change", (event) => setFiles(event.target.files));
$("#clearFile").addEventListener("click", () => {
  state.selectedFiles = [];
  state.pdfSummary = null;
  state.pdfHistory = [];
  localStorage.removeItem("sigmaPdfSummaryV1");
  localStorage.removeItem("sigmaPdfHistoryV1");
  $("#pdfFile").value = "";
  $("#fileChip").classList.add("hidden");
});

$("#mobileMenu").addEventListener("click", () => $(".sidebar").classList.toggle("open"));
chatLog.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-code]");
  if (!button) return;
  const code = button.closest(".code-block")?.querySelector("code")?.innerText || "";
  await navigator.clipboard.writeText(code);
  button.textContent = "Copied";
  window.setTimeout(() => {
    button.textContent = "Copy";
  }, 1200);
});
apiKeyInput.addEventListener("change", saveSettings);
modelSelect.addEventListener("change", saveSettings);
toneSelect.addEventListener("change", saveSettings);

$("#clearSettings").addEventListener("click", () => {
  localStorage.removeItem("groqApiKey");
  localStorage.removeItem("model");
  localStorage.removeItem("tone");
  apiKeyInput.value = "";
  modelSelect.value = "llama-3.1-8b-instant";
  toneSelect.value = "savage";
  saveSettings();
  showToast("Settings reset.");
});

bindSuggestions();
renderChatHistory();
syncIdentity();
switchTab("chat");
checkHealth();
