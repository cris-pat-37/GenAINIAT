const state = {
  tab: "chat",
  tone: localStorage.getItem("tone") || "savage",
  userName: localStorage.getItem("userName") || "",
  history: JSON.parse(localStorage.getItem("chatHistory") || "[]"),
  summaryMode: "deep",
  selectedFile: null,
  lastSummary: "",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const apiKeyInput = $("#apiKey");
const modelSelect = $("#model");
const chatLog = $("#chatLog");
const chatInput = $("#chatInput");
const userNameLabel = $("#userName");
const toneName = $("#toneName");
const toast = $("#toast");

apiKeyInput.value = localStorage.getItem("groqApiKey") || "";
modelSelect.value = localStorage.getItem("model") || "llama-3.1-8b-instant";

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
}

function setLoading(isLoading, label = "Thinking...") {
  const submit = $("#chatForm button");
  const summarize = $("#summarizeBtn");
  submit.disabled = isLoading;
  summarize.disabled = isLoading;
  if (isLoading) {
    summarize.dataset.original = summarize.textContent;
    summarize.textContent = label;
  } else if (summarize.dataset.original) {
    summarize.textContent = summarize.dataset.original;
  }
}

function addMessage(role, content) {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  const avatar = document.createElement("div");
  avatar.className = "avatar";
  avatar.textContent = role === "user" ? "Y" : "S";
  const bubble = document.createElement("div");
  bubble.className = "bubble";
  bubble.textContent = content;
  article.append(avatar, bubble);
  chatLog.appendChild(article);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderChatHistory() {
  state.history.forEach((message) => addMessage(message.role, message.content));
}

function syncIdentity() {
  userNameLabel.textContent = state.userName || "Not set";
  toneName.textContent = state.tone.charAt(0).toUpperCase() + state.tone.slice(1);
  localStorage.setItem("tone", state.tone);
  if (state.userName) {
    localStorage.setItem("userName", state.userName);
  }
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
        tone: state.tone,
        ...getAiConfig(),
      }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Chat failed");
    if (data.user_name) {
      state.userName = data.user_name;
    }
    addMessage("bot", data.reply);
    state.history.push({ role: "assistant", content: data.reply });
    localStorage.setItem("chatHistory", JSON.stringify(state.history.slice(-20)));
    syncIdentity();
  } catch (error) {
    addMessage("bot", `Backend says: ${error.message}`);
  } finally {
    setLoading(false);
  }
}

function switchTab(tab) {
  state.tab = tab;
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
  $("#chatPanel").classList.toggle("active", tab === "chat");
  $("#pdfPanel").classList.toggle("active", tab === "pdf");
  $("#modeSwitch").style.display = tab === "chat" ? "flex" : "none";
  $("#workspaceTitle").textContent = tab === "chat" ? "Savage AI Chat" : "PDF Intelligence Studio";
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

function setFile(file) {
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    showToast("Please choose a PDF file.");
    return;
  }
  state.selectedFile = file;
  $("#fileName").textContent = file.name;
}

function listItems(target, items) {
  const element = $(target);
  element.innerHTML = "";
  (items || []).forEach((item) => {
    const li = document.createElement("li");
    li.textContent = typeof item === "string" ? item : JSON.stringify(item);
    element.appendChild(li);
  });
}

function renderCards(cards) {
  const wrap = $("#studyCards");
  wrap.innerHTML = "";
  (cards || []).forEach((card) => {
    const node = document.createElement("div");
    node.className = "study-card";
    const question = document.createElement("strong");
    question.textContent = card.question || "Question";
    const answer = document.createElement("p");
    answer.textContent = card.answer || "";
    node.append(question, answer);
    wrap.appendChild(node);
  });
}

function renderKeywords(keywords) {
  const wrap = $("#keywords");
  wrap.innerHTML = "";
  (keywords || []).forEach((keyword) => {
    const span = document.createElement("span");
    span.className = "keyword";
    span.textContent = keyword;
    wrap.appendChild(span);
  });
}

function drawConceptMap(edges = []) {
  const canvas = $("#conceptCanvas");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const concepts = [...new Set(edges.flatMap((edge) => [edge.source, edge.target]).filter(Boolean))].slice(0, 9);
  if (!concepts.length) {
    ctx.fillStyle = "#65706c";
    ctx.font = "600 15px Inter";
    ctx.fillText("Concept links will appear after summarizing.", 26, 44);
    return;
  }

  const cx = rect.width / 2;
  const cy = rect.height / 2;
  const radius = Math.min(rect.width, rect.height) * 0.34;
  const nodes = concepts.map((label, index) => {
    const angle = (Math.PI * 2 * index) / concepts.length - Math.PI / 2;
    return {
      label,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });

  ctx.lineWidth = 1.5;
  edges.slice(0, 14).forEach((edge) => {
    const source = nodes.find((node) => node.label === edge.source);
    const target = nodes.find((node) => node.label === edge.target);
    if (!source || !target) return;
    ctx.strokeStyle = "rgba(23, 107, 91, 0.32)";
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();
  });

  nodes.forEach((node, index) => {
    const fill = index % 3 === 0 ? "#176b5b" : index % 3 === 1 ? "#d95742" : "#3d6ca8";
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(node.x - 54, node.y - 22, 108, 44, 8);
    ctx.fill();
    ctx.fillStyle = "white";
    ctx.font = "700 11px Inter";
    ctx.textAlign = "center";
    const text = node.label.length > 16 ? `${node.label.slice(0, 15)}...` : node.label;
    ctx.fillText(text, node.x, node.y + 4);
  });
}

async function summarizePdf() {
  if (!state.selectedFile) {
    showToast("Choose a PDF first.");
    return;
  }

  const formData = new FormData();
  formData.append("file", state.selectedFile);
  formData.append("mode", state.summaryMode);
  const config = getAiConfig();
  if (config.api_key) formData.append("api_key", config.api_key);
  formData.append("model", config.model);

  setLoading(true, "Summarizing...");
  try {
    const response = await fetch("/api/summarize", { method: "POST", body: formData });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Summary failed");

    $("#summaryTitle").textContent = data.title || "PDF Summary";
    $("#overview").textContent = data.overview || "";
    listItems("#keyPoints", data.key_points);
    renderCards(data.study_cards);
    renderKeywords(data.keywords);
    listItems("#actions", data.action_items);
    drawConceptMap(data.concept_map);
    $("#pdfMeta").textContent = `${data.meta.pages} pages | ${data.meta.seconds}s`;
    state.lastSummary = [
      data.title,
      data.overview,
      ...(data.key_points || []),
    ].filter(Boolean).join("\n\n");
    showToast("Summary ready.");
  } catch (error) {
    showToast(error.message);
  } finally {
    setLoading(false);
  }
}

$$(".nav-button").forEach((button) => {
  button.addEventListener("click", () => switchTab(button.dataset.tab));
});

$$("#modeSwitch button").forEach((button) => {
  button.addEventListener("click", () => {
    state.tone = button.dataset.tone;
    $$("#modeSwitch button").forEach((item) => item.classList.toggle("active", item === button));
    syncIdentity();
  });
});

$$("#summaryMode button").forEach((button) => {
  button.addEventListener("click", () => {
    state.summaryMode = button.dataset.mode;
    $$("#summaryMode button").forEach((item) => item.classList.toggle("active", item === button));
  });
});

$("#chatForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;
  chatInput.value = "";
  sendChat(message);
});

$$(".quick-prompts button").forEach((button) => {
  button.addEventListener("click", () => {
    chatInput.value = button.dataset.prompt;
    chatInput.focus();
  });
});

apiKeyInput.addEventListener("change", saveSettings);
modelSelect.addEventListener("change", saveSettings);

$("#clearSettings").addEventListener("click", () => {
  localStorage.removeItem("groqApiKey");
  localStorage.removeItem("model");
  apiKeyInput.value = "";
  modelSelect.value = "llama-3.1-8b-instant";
  showToast("Settings reset.");
});

$("#chooseFile").addEventListener("click", () => $("#pdfFile").click());
$("#pdfFile").addEventListener("change", (event) => setFile(event.target.files[0]));
$("#summarizeBtn").addEventListener("click", summarizePdf);

$("#copySummary").addEventListener("click", async () => {
  if (!state.lastSummary) {
    showToast("No summary to copy yet.");
    return;
  }
  await navigator.clipboard.writeText(state.lastSummary);
  showToast("Summary copied.");
});

const dropZone = $("#dropZone");
dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});
dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragging"));
dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  setFile(event.dataTransfer.files[0]);
});

window.addEventListener("resize", () => drawConceptMap([]));

renderChatHistory();
syncIdentity();
switchTab("chat");
drawConceptMap([]);
checkHealth();
