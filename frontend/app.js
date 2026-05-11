const state = {
  tab: "chat",
  tone: localStorage.getItem("tone") || "savage",
  userName: localStorage.getItem("userName") || "",
  history: JSON.parse(localStorage.getItem("chatHistory") || "[]"),
  summaryMode: "deep",
  selectedFile: null,
  lastSummary: "",
  neuralCards: [],
  neuralEdges: [],
  neuralNodes: [],
  activeCard: 0,
  draggingNode: null,
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
const demoCards = [
  {
    question: "Demo: What is the document's main idea?",
    answer: "The center node represents the main summary. Drag it to reshape the learning graph.",
  },
  {
    question: "Demo: Which concepts are connected?",
    answer: "Related flashcards are linked by animated neural paths, like a visual study map.",
  },
  {
    question: "Demo: How do I revise faster?",
    answer: "Click any node to inspect its answer, then use keywords and actions for quick revision.",
  },
  {
    question: "Demo: What happens after upload?",
    answer: "Your real PDF replaces this demo with AI-generated cards, concepts, and summary points.",
  },
];

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
  if (window.innerWidth <= 1120) {
    $(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
  const selected = (cards || [])[state.activeCard];
  if (!selected) {
    wrap.innerHTML = `
      <div class="study-card placeholder">
        <strong>No card selected</strong>
        <p>Click a node in the neural map after summarizing.</p>
      </div>
    `;
    return;
  }

  const node = document.createElement("div");
  node.className = "study-card";
  const question = document.createElement("strong");
  question.textContent = selected.question || "Question";
  const answer = document.createElement("p");
  answer.textContent = selected.answer || "";
  node.append(question, answer);
  wrap.appendChild(node);
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

function createDefaultNodes(cards) {
  const stage = $("#neuralStage");
  const rect = stage.getBoundingClientRect();
  const width = Math.max(rect.width, 720);
  const height = Math.max(rect.height, 520);
  const cx = width / 2 - 90;
  const cy = height / 2 - 56;
  const radiusX = Math.min(width * 0.32, 260);
  const radiusY = Math.min(height * 0.28, 190);
  const palette = ["#3ee7d1", "#ff6b6b", "#f6c85f", "#6aa6ff", "#9f7aea", "#5ce1a8"];

  return cards.map((card, index) => {
    const angle = (Math.PI * 2 * index) / Math.max(cards.length, 1) - Math.PI / 2;
    return {
      id: `card-${index}`,
      cardIndex: index,
      label: card.question || `Flashcard ${index + 1}`,
      answer: card.answer || "",
      x: cx + Math.cos(angle) * radiusX,
      y: cy + Math.sin(angle) * radiusY,
      z: index % 2 === 0 ? "42px" : "-18px",
      tilt: `${index % 2 === 0 ? -7 : 7}deg`,
      color: palette[index % palette.length],
    };
  });
}

function buildNeuralEdges(cards, conceptEdges = []) {
  const cardEdges = cards.slice(1).map((_, index) => ({
    source: `card-${index}`,
    target: `card-${index + 1}`,
  }));
  const loopEdge = cards.length > 2 ? [{ source: "card-0", target: `card-${cards.length - 1}` }] : [];
  return [...cardEdges, ...loopEdge, ...(conceptEdges || []).slice(0, 5)];
}

function renderNeuralNetwork(cards = [], conceptEdges = []) {
  const wrap = $("#neuralNodes");
  wrap.innerHTML = "";
  state.neuralCards = cards;
  state.activeCard = 0;
  state.neuralNodes = createDefaultNodes(cards);
  state.neuralEdges = buildNeuralEdges(cards, conceptEdges);
  $("#emptyNetwork").classList.toggle("hidden", cards.length > 0);

  state.neuralNodes.forEach((node) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "neural-node";
    button.dataset.nodeId = node.id;
    button.style.setProperty("--x", `${node.x}px`);
    button.style.setProperty("--y", `${node.y}px`);
    button.style.setProperty("--z", node.z);
    button.style.setProperty("--tilt", node.tilt);
    button.style.setProperty("--node-color", node.color);
    button.innerHTML = `<strong>${node.label}</strong><span>${node.answer}</span>`;
    button.addEventListener("pointerdown", startNodeDrag);
    button.addEventListener("click", () => selectNode(node.cardIndex));
    wrap.appendChild(button);
  });

  renderCards(cards);
  selectNode(0);
  drawConceptMap();
}

function selectNode(index) {
  state.activeCard = index;
  $$(".neural-node").forEach((node) => {
    node.classList.toggle("active", Number(node.dataset.nodeId.replace("card-", "")) === index);
  });
  renderCards(state.neuralCards);
  drawConceptMap();
}

function startNodeDrag(event) {
  const element = event.currentTarget;
  const node = state.neuralNodes.find((item) => item.id === element.dataset.nodeId);
  if (!node) return;
  element.setPointerCapture(event.pointerId);
  element.classList.add("dragging");
  state.draggingNode = {
    node,
    element,
    startX: event.clientX,
    startY: event.clientY,
    originX: node.x,
    originY: node.y,
  };
}

function moveNodeDrag(event) {
  if (!state.draggingNode) return;
  const { node, element, startX, startY, originX, originY } = state.draggingNode;
  node.x = originX + event.clientX - startX;
  node.y = originY + event.clientY - startY;
  element.style.setProperty("--x", `${node.x}px`);
  element.style.setProperty("--y", `${node.y}px`);
  drawConceptMap();
}

function endNodeDrag() {
  if (!state.draggingNode) return;
  state.draggingNode.element.classList.remove("dragging");
  state.draggingNode = null;
}

function drawConceptMap() {
  const canvas = $("#conceptCanvas");
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  canvas.width = Math.floor(rect.width * scale);
  canvas.height = Math.floor(rect.height * scale);
  ctx.scale(scale, scale);
  ctx.clearRect(0, 0, rect.width, rect.height);

  const nodes = state.neuralNodes || [];
  if (!nodes.length) {
    ctx.strokeStyle = "rgba(62, 231, 209, 0.14)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 42; i += 1) {
      const x = (i * 91) % rect.width;
      const y = (i * 57) % rect.height;
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    return;
  }

  const time = Date.now() / 900;
  ctx.lineWidth = 2;
  state.neuralEdges.forEach((edge, index) => {
    const source = nodes.find((node) => node.id === edge.source) || nodes[index % nodes.length];
    const target = nodes.find((node) => node.id === edge.target) || nodes[(index + 2) % nodes.length];
    if (!source || !target) return;
    const sourceX = source.x + 90;
    const sourceY = source.y + 56;
    const targetX = target.x + 90;
    const targetY = target.y + 56;
    const pulse = (Math.sin(time + index) + 1) / 2;
    const gradient = ctx.createLinearGradient(sourceX, sourceY, targetX, targetY);
    gradient.addColorStop(0, source.color);
    gradient.addColorStop(0.5, `rgba(255, 255, 255, ${0.18 + pulse * 0.18})`);
    gradient.addColorStop(1, target.color);
    ctx.strokeStyle = gradient;
    ctx.globalAlpha = 0.34 + pulse * 0.28;
    ctx.beginPath();
    ctx.moveTo(sourceX, sourceY);
    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2 - 42;
    ctx.quadraticCurveTo(midX, midY, targetX, targetY);
    ctx.stroke();
  });
  ctx.globalAlpha = 1;

  nodes.forEach((node) => {
    ctx.fillStyle = node.color;
    ctx.shadowColor = node.color;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(node.x + 90, node.y + 56, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.shadowBlur = 0;
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
    renderNeuralNetwork(data.study_cards || [], data.concept_map || []);
    renderKeywords(data.keywords);
    listItems("#actions", data.action_items);
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

window.addEventListener("pointermove", moveNodeDrag);
window.addEventListener("pointerup", endNodeDrag);
window.addEventListener("resize", () => {
  if (state.neuralCards.length) {
    renderNeuralNetwork(state.neuralCards, []);
  } else {
    drawConceptMap();
  }
});

window.setInterval(() => {
  if (state.tab === "pdf") drawConceptMap();
}, 1200);

renderChatHistory();
syncIdentity();
switchTab("chat");
renderNeuralNetwork(demoCards, []);
$("#pdfMeta").textContent = "Demo network";
checkHealth();
