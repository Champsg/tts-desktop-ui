/**
 * Kokoro Desktop UI - Authentic Speechify UI/UX Engine
 * Features:
 * - Floating Dock with Speechify signature Big Play button, Rewind/Forward 15s
 * - Dual Highlighting: Sentence background tint + active word focus
 * - Click-to-Read: Click any word to jump immediately to that spot
 * - Smooth auto-scrolling to keep active reading centered
 * - Themes: Dark, Sepia (Warm Kindle), Light (Clean Paper)
 * - Typography customization: Sans / Serif, scalable font size
 * - Kokoro-82M streaming audio & WebSocket pipeline
 */

// Application State
const state = {
  backendUrl: localStorage.getItem('tts_backend_url') || 'http://localhost:8000',
  apiKey: localStorage.getItem('tts_api_key') || '',
  sessionId: null,
  ws: null,
  chunks: new Map(), // chunkId -> metadata
  orderedChunkIds: [],
  currentPlayingIndex: -1,
  activeChunkId: null,
  activeTimings: [], // array of { word, start, end, index }
  playbackRate: 1.0,
  isPlaying: false,
  currentBlobUrl: null,
  selectedVoice: 'af_bella',
  wordsElements: [], // rendered span elements by global index
  sentenceElements: [], // rendered sentence spans
  totalWords: 0,
  durationTotalSec: 0,
  elapsedSec: 0,
  theme: localStorage.getItem('speechify_theme') || 'dark',
  font: localStorage.getItem('speechify_font') || 'sans',
  fontSize: parseInt(localStorage.getItem('speechify_font_size') || '22', 10)
};

// DOM Elements
const elements = {
  // Top Bar
  readingTabBtn: document.getElementById('readingTabBtn'),
  editorTabBtn: document.getElementById('editorTabBtn'),
  appearanceBtn: document.getElementById('appearanceBtn'),
  appearanceMenu: document.getElementById('appearanceMenu'),
  fontSizeSlider: document.getElementById('fontSizeSlider'),
  fontSizeDisplay: document.getElementById('fontSizeDisplay'),
  decreaseFontBtn: document.getElementById('decreaseFontBtn'),
  increaseFontBtn: document.getElementById('increaseFontBtn'),
  themeSwatches: document.querySelectorAll('.theme-swatch'),
  fontChips: document.querySelectorAll('.font-chip'),
  connectionBadge: document.getElementById('connectionBadge'),
  connectionText: document.getElementById('connectionText'),
  serverConfigBtn: document.getElementById('serverConfigBtn'),

  // Config Modal
  settingsModal: document.getElementById('settingsModal'),
  closeSettingsBtn: document.getElementById('closeSettingsBtn'),
  saveSettingsBtn: document.getElementById('saveSettingsBtn'),
  testConnectionBtn: document.getElementById('testConnectionBtn'),
  backendUrlInput: document.getElementById('backendUrlInput'),
  apiKeyInput: document.getElementById('apiKeyInput'),

  // Stages
  mainScrollContainer: document.getElementById('mainScrollContainer'),
  editorContainer: document.getElementById('editorContainer'),
  readingContainer: document.getElementById('readingContainer'),
  textInput: document.getElementById('textInput'),
  charCount: document.getElementById('charCount'),
  wordCount: document.getElementById('wordCount'),
  estReadTime: document.getElementById('estReadTime'),
  wordsDisplay: document.getElementById('wordsDisplay'),
  readingProgressPercent: document.getElementById('readingProgressPercent'),

  // Dock Controls (Bella Only)
  speedPickerBtn: document.getElementById('speedPickerBtn'),
  speedDisplayVal: document.getElementById('speedDisplayVal'),
  speedMenu: document.getElementById('speedMenu'),
  speedSlider: document.getElementById('speedSlider'),
  speedChips: document.querySelectorAll('.speed-chip'),

  skipBackBtn: document.getElementById('skipBackBtn'),
  mainPlayPauseBtn: document.getElementById('mainPlayPauseBtn'),
  playIcon: document.getElementById('playIcon'),
  pauseIcon: document.getElementById('pauseIcon'),
  skipForwardBtn: document.getElementById('skipForwardBtn'),

  currentTimeLabel: document.getElementById('currentTimeLabel'),
  totalTimeLabel: document.getElementById('totalTimeLabel'),
  scrubBarTrack: document.getElementById('scrubBarTrack'),
  playbackProgressBar: document.getElementById('playbackProgressBar'),

  pipelineToggleBtn: document.getElementById('pipelineToggleBtn'),
  pipelineDrawer: document.getElementById('pipelineDrawer'),
  closePipelineBtn: document.getElementById('closePipelineBtn'),
  queueBadge: document.getElementById('queueBadge'),
  chunkList: document.getElementById('chunkList'),

  audioElement: document.getElementById('audioElement'),
  toastMessage: document.getElementById('toastMessage')
};

// DEFAULT SPEECHIFY SAMPLE
const SAMPLE_ARTICLE = `Welcome to Speechify Studio on your PC!

Speechify gives you superpowers by turning any text, document, or book into natural, human-like speech. Powered by the Kokoro-82M AI model, speech is synthesized with studio-grade clarity.

Notice how the words highlight as the voice reads: the active sentence is gently highlighted, while each word lights up in perfect synchrony with the audio.

You can click any word on the screen to instantly jump reading to that sentence. Change reading speeds from 1.0x up to 3.0x, or switch between dark, warm sepia, and paper light themes for a comfortable reading experience.`;

// INITIALIZATION
function init() {
  applyTheme(state.theme);
  applyFont(state.font);
  applyFontSize(state.fontSize);

  elements.backendUrlInput.value = state.backendUrl;
  elements.apiKeyInput.value = state.apiKey;
  elements.textInput.value = SAMPLE_ARTICLE;

  setupEventListeners();
  updateTextCounts();
  renderReadingView(elements.textInput.value);
  checkBackendHealth();

  // Periodic health check
  setInterval(checkBackendHealth, 5000);
}

// SETUP EVENT LISTENERS
function setupEventListeners() {
  // Mode Switches
  elements.readingTabBtn.addEventListener('click', () => switchTab('reading'));
  elements.editorTabBtn.addEventListener('click', () => switchTab('editor'));

  // Editor Actions
  elements.textInput.addEventListener('input', () => {
    updateTextCounts();
    renderReadingView(elements.textInput.value);
  });

  // Appearance Popover
  elements.appearanceBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.appearanceMenu.classList.toggle('hidden');
    elements.speedMenu.classList.add('hidden');
  });

  elements.themeSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
      elements.themeSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      applyTheme(swatch.dataset.theme);
    });
  });

  elements.fontChips.forEach(chip => {
    chip.addEventListener('click', () => {
      elements.fontChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      applyFont(chip.dataset.font);
    });
  });

  elements.fontSizeSlider.addEventListener('input', (e) => applyFontSize(parseInt(e.target.value, 10)));
  elements.decreaseFontBtn.addEventListener('click', () => applyFontSize(Math.max(16, state.fontSize - 2)));
  elements.increaseFontBtn.addEventListener('click', () => applyFontSize(Math.min(36, state.fontSize + 2)));

  // Speed Picker Popover
  elements.speedPickerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.speedMenu.classList.toggle('hidden');
    elements.appearanceMenu.classList.add('hidden');
  });

  elements.speedSlider.addEventListener('input', (e) => setSpeed(parseFloat(e.target.value)));
  elements.speedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      elements.speedChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      setSpeed(parseFloat(chip.dataset.speed));
    });
  });

  // Pipeline Drawer Toggle
  elements.pipelineToggleBtn.addEventListener('click', () => {
    elements.pipelineDrawer.classList.toggle('hidden');
  });
  elements.closePipelineBtn.addEventListener('click', () => {
    elements.pipelineDrawer.classList.add('hidden');
  });

  // Global Click to close popovers
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown-wrap') && !e.target.closest('.popover-menu') && !e.target.closest('.speed-dropdown')) {
      elements.appearanceMenu.classList.add('hidden');
      elements.speedMenu.classList.add('hidden');
    }
  });

  // Backend Settings Modal
  elements.serverConfigBtn.addEventListener('click', () => elements.settingsModal.classList.remove('hidden'));
  elements.closeSettingsBtn.addEventListener('click', () => elements.settingsModal.classList.add('hidden'));
  elements.saveSettingsBtn.addEventListener('click', () => {
    state.backendUrl = elements.backendUrlInput.value.trim().replace(/\/$/, '');
    state.apiKey = elements.apiKeyInput.value.trim();
    localStorage.setItem('tts_backend_url', state.backendUrl);
    localStorage.setItem('tts_api_key', state.apiKey);
    elements.settingsModal.classList.add('hidden');
    checkBackendHealth();
    showToast("Settings saved");
  });
  elements.testConnectionBtn.addEventListener('click', checkBackendHealth);

  // Playback Buttons
  elements.mainPlayPauseBtn.addEventListener('click', handleMainPlayPause);
  elements.skipBackBtn.addEventListener('click', handleSkipBack);
  elements.skipForwardBtn.addEventListener('click', handleSkipForward);

  // Scrubber Click
  elements.scrubBarTrack.addEventListener('click', handleScrubClick);

  // Keyboard Shortcuts: Spacebar to toggle Play/Pause
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.code === 'Space') {
      e.preventDefault();
      handleMainPlayPause();
    } else if (e.code === 'ArrowLeft') {
      handleSkipBack();
    } else if (e.code === 'ArrowRight') {
      handleSkipForward();
    }
  });

  // HTML Audio Events
  elements.audioElement.addEventListener('ended', onAudioEnded);
  elements.audioElement.addEventListener('pause', stopHighPrecisionSync);
  elements.audioElement.addEventListener('play', startHighPrecisionSync);
}

// THEMES & STYLING
function applyTheme(themeName) {
  state.theme = themeName;
  document.documentElement.setAttribute('data-theme', themeName);
  localStorage.setItem('speechify_theme', themeName);
}

function applyFont(fontName) {
  state.font = fontName;
  document.documentElement.setAttribute('data-font', fontName);
  localStorage.setItem('speechify_font', fontName);
}

function applyFontSize(size) {
  state.fontSize = size;
  document.documentElement.style.setProperty('--font-size', `${size}px`);
  elements.fontSizeSlider.value = size;
  elements.fontSizeDisplay.textContent = `${size}px`;
  localStorage.setItem('speechify_font_size', size);
}

function setSpeed(rate) {
  state.playbackRate = rate;
  elements.speedDisplayVal.textContent = `${rate.toFixed(1)}x`;
  elements.speedSlider.value = rate;
  elements.audioElement.playbackRate = rate;
  if (currentSourceNode) {
    try { currentSourceNode.playbackRate.value = rate; } catch (e) {}
  }
}

function switchTab(mode) {
  if (mode === 'reading') {
    elements.readingTabBtn.classList.add('active');
    elements.editorTabBtn.classList.remove('active');
    elements.readingContainer.classList.remove('hidden');
    elements.editorContainer.classList.add('hidden');
  } else {
    elements.readingTabBtn.classList.remove('active');
    elements.editorTabBtn.classList.add('active');
    elements.readingContainer.classList.add('hidden');
    elements.editorContainer.classList.remove('hidden');
  }
}

function updateTextCounts() {
  const text = elements.textInput.value;
  const chars = text.length;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  elements.charCount.textContent = `${chars.toLocaleString()} characters`;
  elements.wordCount.textContent = `${words.toLocaleString()} words`;
  const mins = Math.max(1, Math.round(words / 180));
  elements.estReadTime.textContent = `~${mins} min read`;
}

function showToast(msg) {
  elements.toastMessage.textContent = msg;
  elements.toastMessage.classList.remove('hidden');
  elements.toastMessage.style.opacity = '1';
  setTimeout(() => {
    elements.toastMessage.style.opacity = '0';
    setTimeout(() => elements.toastMessage.classList.add('hidden'), 200);
  }, 2200);
}

// API REQUEST HELPER
function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (state.apiKey) {
    headers['X-API-Key'] = state.apiKey;
    headers['Authorization'] = `Bearer ${state.apiKey}`;
  }
  return headers;
}

// BACKEND HEALTH CHECK
async function checkBackendHealth() {
  try {
    const res = await fetch(`${state.backendUrl}/health`, { headers: getHeaders() });
    if (res.ok) {
      const data = await res.json();
      const dev = data.model && data.model.device ? data.model.device.toUpperCase() : 'CPU';
      elements.connectionBadge.className = 'status-indicator-pill';
      elements.connectionText.textContent = `Online (${dev})`;
      return true;
    }
  } catch (err) {
    // Offline
  }
  elements.connectionBadge.className = 'status-indicator-pill offline';
  elements.connectionText.textContent = 'Backend Offline';
  return false;
}

// RENDER SPEECHIFY DUAL-HIGHLIGHTING ARTICLE
function renderReadingView(text) {
  elements.wordsDisplay.innerHTML = '';
  state.wordsElements = [];
  state.sentenceElements = [];

  if (!text.trim()) {
    elements.wordsDisplay.innerHTML = '<div style="color: var(--text-tertiary); text-align: center; padding: 40px;">No text to read. Switch to "Edit Text" to paste your reading.</div>';
    return;
  }

  // Split into paragraphs
  const paragraphs = text.split(/\n+/);
  let globalWordIdx = 0;
  let sentenceIdx = 0;

  paragraphs.forEach(para => {
    if (!para.trim()) return;
    const pEl = document.createElement('p');
    pEl.style.marginBottom = '1.4em';

    // Split paragraph into sentences by punctuation (. ! ?)
    const sentenceTokens = para.split(/([.!?]+["']?\s*)/g);
    let currentSentenceSpan = null;

    for (let i = 0; i < sentenceTokens.length; i += 2) {
      const sentText = sentenceTokens[i];
      const punct = sentenceTokens[i + 1] || '';
      if (!sentText && !punct) continue;

      currentSentenceSpan = document.createElement('span');
      currentSentenceSpan.className = 'sentence-wrap';
      currentSentenceSpan.dataset.sentenceId = sentenceIdx++;
      state.sentenceElements.push(currentSentenceSpan);

      // Parse words in this sentence
      const combined = sentText + punct;
      const tokens = combined.split(/(\s+)/);

      tokens.forEach(tok => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) {
          currentSentenceSpan.appendChild(document.createTextNode(tok));
        } else {
          const wSpan = document.createElement('span');
          wSpan.className = 'word-span';
          wSpan.textContent = tok;
          wSpan.dataset.wordIndex = globalWordIdx;
          wSpan.dataset.sentenceParentId = currentSentenceSpan.dataset.sentenceId;

          // Click-to-Read (Jump to word)
          wSpan.addEventListener('click', (e) => {
            e.stopPropagation();
            jumpToWord(parseInt(wSpan.dataset.wordIndex, 10));
          });

          currentSentenceSpan.appendChild(wSpan);
          state.wordsElements.push(wSpan);
          globalWordIdx++;
        }
      });

      pEl.appendChild(currentSentenceSpan);
    }

    elements.wordsDisplay.appendChild(pEl);
  });

  state.totalWords = globalWordIdx;
}

// PLAYBACK START & MANAGEMENT
let audioCtx = null;
let currentSourceNode = null;
let webAudioStartTime = 0;
let webAudioAnimFrame = null;

async function handleMainPlayPause() {
  // If not currently in a session or paused, start or resume
  if (!state.sessionId || !state.isPlaying) {
    if (state.sessionId && elements.audioElement.paused && elements.audioElement.src) {
      resumePlayback();
    } else {
      await startFreshSession();
    }
  } else {
    pausePlayback();
  }
}

async function startFreshSession() {
  // Unlock browser audio context
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const text = elements.textInput.value.trim();
  if (!text) {
    showToast('Please enter text to read');
    return;
  }

  showToast('Starting Kokoro session...');
  switchTab('reading');

  try {
    const res = await fetch(`${state.backendUrl}/session`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        text: text,
        voice: state.selectedVoice,
        start_at_word: 0
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create session' }));
      throw new Error(err.detail || `Server error (${res.status})`);
    }

    const data = await res.json();
    state.sessionId = data.sessionId;
    state.chunks.clear();
    state.orderedChunkIds = [];

    if (data.chunks && data.chunks.length > 0) {
      data.chunks.forEach(c => {
        state.chunks.set(c.chunkId, c);
        state.orderedChunkIds.push(c.chunkId);
      });
    }

    renderChunkQueue();
    connectWebSocket(state.sessionId);

    state.isPlaying = true;
    updatePlayPauseUI(true);

    state.currentPlayingIndex = 0;
    waitForAndPlayChunk(0);

  } catch (err) {
    console.error('Session creation failed:', err);
    showToast(`Error: ${err.message}`);
    updatePlayPauseUI(false);
  }
}

function updatePlayPauseUI(playing) {
  state.isPlaying = playing;
  if (playing) {
    elements.playIcon.classList.add('hidden');
    elements.pauseIcon.classList.remove('hidden');
  } else {
    elements.playIcon.classList.remove('hidden');
    elements.pauseIcon.classList.add('hidden');
  }
}

function pausePlayback() {
  updatePlayPauseUI(false);
  stopHighPrecisionSync();
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.suspend();
  }
  elements.audioElement.pause();
  showToast('Paused');
}

function resumePlayback() {
  updatePlayPauseUI(true);
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  elements.audioElement.play();
  startHighPrecisionSync();
  showToast('Playing');
}

// WEBSOCKET FOR BUFFER STREAMING
function connectWebSocket(sessionId) {
  if (state.ws) state.ws.close();

  const wsProto = state.backendUrl.startsWith('https') ? 'wss' : 'ws';
  const cleanHost = state.backendUrl.replace(/^https?:\/\//, '');
  let wsUrl = `${wsProto}://${cleanHost}/ws/${sessionId}`;
  if (state.apiKey) wsUrl += `?token=${encodeURIComponent(state.apiKey)}`;

  state.ws = new WebSocket(wsUrl);

  state.ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'chunk_ready') {
        if (state.chunks.has(msg.chunkId)) {
          const c = state.chunks.get(msg.chunkId);
          c.status = 'ready';
          c.duration = msg.duration;
        }
        renderChunkQueue();
      } else if (msg.type === 'chunk_generating') {
        if (state.chunks.has(msg.chunkId)) {
          state.chunks.get(msg.chunkId).status = 'generating';
          renderChunkQueue();
        }
      }
    } catch (e) {}
  };
}

function renderChunkQueue() {
  elements.queueBadge.textContent = `${state.chunks.size} Chunk${state.chunks.size === 1 ? '' : 's'}`;
  elements.chunkList.innerHTML = '';

  state.orderedChunkIds.forEach((id, idx) => {
    const chunk = state.chunks.get(id);
    const item = document.createElement('div');
    item.className = `chunk-card ${chunk.status}`;
    item.innerHTML = `
      <span class="chunk-title">${chunk.chunkId}</span>
      <span class="chunk-status-badge ${chunk.status}">${chunk.status}</span>
    `;
    elements.chunkList.appendChild(item);
  });
}

// CHUNK PLAYBACK CONTROLLER
async function waitForAndPlayChunk(index) {
  if (index >= state.orderedChunkIds.length) {
    showToast('Finished reading document');
    handleStopPlayback();
    return;
  }

  const chunkId = state.orderedChunkIds[index];
  state.activeChunkId = chunkId;

  // 1. Fetch metadata with sub-second timestamps
  try {
    const metaRes = await fetch(`${state.backendUrl}/tts/chunk/${chunkId}`, { headers: getHeaders() });
    if (!metaRes.ok) throw new Error(`HTTP ${metaRes.status}`);

    const meta = await metaRes.json();

    // Check if generating
    if (meta.status !== 'ready') {
      setTimeout(() => {
        if (state.isPlaying && state.currentPlayingIndex === index) {
          waitForAndPlayChunk(index);
        }
      }, 400);
      return;
    }

    state.activeTimings = meta.words || [];

    // 2. Fetch WAV audio
    const audioUrl = `${state.backendUrl}/tts/chunk/${chunkId}/audio`;
    const audioRes = await fetch(audioUrl, { headers: getHeaders() });

    if (audioRes.status === 202) {
      setTimeout(() => {
        if (state.isPlaying && state.currentPlayingIndex === index) {
          waitForAndPlayChunk(index);
        }
      }, 400);
      return;
    }

    if (audioRes.status !== 200) {
      throw new Error(`Audio download failed: ${audioRes.status}`);
    }

    const audioBlob = await audioRes.blob();
    const objectUrl = URL.createObjectURL(audioBlob);

    if (state.currentBlobUrl) URL.revokeObjectURL(state.currentBlobUrl);
    state.currentBlobUrl = objectUrl;

    elements.audioElement.src = objectUrl;
    elements.audioElement.playbackRate = state.playbackRate;
    elements.audioElement.volume = 1.0;

    try {
      await elements.audioElement.play();
      startHighPrecisionSync();
    } catch (playErr) {
      // Direct Web Audio fallback if HTML5 is blocked
      await playViaWebAudio(audioBlob);
    }

  } catch (err) {
    console.error('Play chunk error:', err);
    showToast(`Error in chunk: ${err.message}`);
  }
}

// WEB AUDIO BUFFER FALLBACK
async function playViaWebAudio(blob) {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  if (currentSourceNode) {
    try { currentSourceNode.stop(); } catch (e) {}
  }

  currentSourceNode = audioCtx.createBufferSource();
  currentSourceNode.buffer = audioBuffer;
  currentSourceNode.playbackRate.value = state.playbackRate;
  currentSourceNode.connect(audioCtx.destination);

  webAudioStartTime = audioCtx.currentTime;
  currentSourceNode.start(0);

  const dur = audioBuffer.duration;
  elements.totalTimeLabel.textContent = `-${formatTime(dur)}`;

  function syncLoop() {
    if (!state.isPlaying) return;
    const elapsed = (audioCtx.currentTime - webAudioStartTime) * state.playbackRate;
    if (elapsed <= dur) {
      const pct = Math.min(100, (elapsed / dur) * 100);
      elements.playbackProgressBar.style.width = `${pct}%`;
      elements.currentTimeLabel.textContent = formatTime(elapsed);
      elements.totalTimeLabel.textContent = `-${formatTime(Math.max(0, (dur - elapsed) / state.playbackRate))}`;

      // High precision binary search for word highlight in Web Audio mode
      if (state.activeTimings && state.activeTimings.length > 0) {
        const timings = state.activeTimings;
        let low = 0;
        let high = timings.length - 1;
        let matchedIdx = -1;

        while (low <= high) {
          const mid = (low + high) >> 1;
          const t = timings[mid];
          if (elapsed >= t.start && elapsed <= t.end) {
            matchedIdx = mid;
            break;
          } else if (elapsed < t.start) {
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }

        if (matchedIdx === -1 && high >= 0 && high < timings.length) {
          if (elapsed >= timings[high].start) {
            matchedIdx = high;
          }
        }

        if (matchedIdx !== -1) {
          highlightWordAndSentence(timings[matchedIdx].index);
        }
      }
      webAudioAnimFrame = requestAnimationFrame(syncLoop);
    }
  }
  cancelAnimationFrame(webAudioAnimFrame);
  webAudioAnimFrame = requestAnimationFrame(syncLoop);

  currentSourceNode.onended = () => {
    cancelAnimationFrame(webAudioAnimFrame);
    onAudioEnded();
  };
}

// SYNCHRONIZED TIMINGS & DUAL HIGHLIGHTING
// High-precision RAF loop driven by actual hardware audio clock
let rafSyncId = null;

function startHighPrecisionSync() {
  stopHighPrecisionSync();

  function syncFrame() {
    if (!state.isPlaying) return;

    if (!elements.audioElement.paused && elements.audioElement.duration) {
      const curTime = elements.audioElement.currentTime;
      const dur = elements.audioElement.duration || 1;

      // Update scrub bar and time indicators
      const pct = Math.min(100, (curTime / dur) * 100);
      elements.playbackProgressBar.style.width = `${pct}%`;
      elements.currentTimeLabel.textContent = formatTime(curTime);
      elements.totalTimeLabel.textContent = `-${formatTime(Math.max(0, (dur - curTime) / state.playbackRate))}`;

      // Accurate Word Tracking (Binary Search on audio timeline)
      if (state.activeTimings && state.activeTimings.length > 0) {
        const timings = state.activeTimings;
        // Find matching word
        let low = 0;
        let high = timings.length - 1;
        let matchedIdx = -1;

        while (low <= high) {
          const mid = (low + high) >> 1;
          const t = timings[mid];
          if (curTime >= t.start && curTime <= t.end) {
            matchedIdx = mid;
            break;
          } else if (curTime < t.start) {
            high = mid - 1;
          } else {
            low = mid + 1;
          }
        }

        // If in between words (inter-word gap), keep the closest current word
        if (matchedIdx === -1 && high >= 0 && high < timings.length) {
          if (curTime >= timings[high].start) {
            matchedIdx = high;
          }
        }

        if (matchedIdx !== -1) {
          highlightWordAndSentence(timings[matchedIdx].index);
        }
      }
    }

    rafSyncId = requestAnimationFrame(syncFrame);
  }

  rafSyncId = requestAnimationFrame(syncFrame);
}

function stopHighPrecisionSync() {
  if (rafSyncId) {
    cancelAnimationFrame(rafSyncId);
    rafSyncId = null;
  }
}

// SPEECHIFY SIGNATURE: HIGHLIGHT SENTENCE + WORD + AUTO-SCROLL
function highlightWordAndSentence(globalWordIdx) {
  const targetWord = state.wordsElements[globalWordIdx];
  if (!targetWord) return;

  // Clear previous word highlight
  document.querySelectorAll('.word-span.current-reading').forEach(el => el.classList.remove('current-reading'));
  targetWord.classList.add('current-reading');

  // Highlight parent sentence
  const sentenceId = targetWord.dataset.sentenceParentId;
  document.querySelectorAll('.sentence-wrap.active-sentence').forEach(el => {
    if (el.dataset.sentenceId !== sentenceId) el.classList.remove('active-sentence');
  });

  const activeSentence = document.querySelector(`.sentence-wrap[data-sentence-id="${sentenceId}"]`);
  if (activeSentence) {
    activeSentence.classList.add('active-sentence');
  }

  // Update progress percentage
  if (state.totalWords > 0) {
    const readPct = Math.round((globalWordIdx / state.totalWords) * 100);
    elements.readingProgressPercent.textContent = `${readPct}% read`;
  }

  // Smooth auto-scroll to keep active line centered
  const container = elements.mainScrollContainer;
  const wordRect = targetWord.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  if (wordRect.top < containerRect.top + 100 || wordRect.bottom > containerRect.bottom - 120) {
    targetWord.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function onAudioEnded() {
  state.currentPlayingIndex++;
  if (state.currentPlayingIndex < state.orderedChunkIds.length) {
    waitForAndPlayChunk(state.currentPlayingIndex);
  } else {
    handleStopPlayback();
  }
}

function handleStopPlayback() {
  state.isPlaying = false;
  updatePlayPauseUI(false);
  stopHighPrecisionSync();
  if (currentSourceNode) {
    try { currentSourceNode.stop(); } catch (e) {}
  }
  if (webAudioAnimFrame) cancelAnimationFrame(webAudioAnimFrame);
  elements.audioElement.pause();
  elements.audioElement.currentTime = 0;
  elements.playbackProgressBar.style.width = '0%';
  document.querySelectorAll('.word-span.current-reading').forEach(el => el.classList.remove('current-reading'));
  document.querySelectorAll('.sentence-wrap.active-sentence').forEach(el => el.classList.remove('active-sentence'));
}

// SKIP CONTROLS: 10 SECONDS (OR TO PREVIOUS/NEXT WORD BOUNDARY)
function handleSkipBack() {
  if (elements.audioElement.src) {
    const targetTime = Math.max(0, elements.audioElement.currentTime - 10);
    elements.audioElement.currentTime = targetTime;
    showToast('Rewind 10s');
    // Immediate highlight update
    updateHighlightAtTime(targetTime);
  }
}

function handleSkipForward() {
  if (elements.audioElement.src) {
    const dur = elements.audioElement.duration || 9999;
    const targetTime = Math.min(dur, elements.audioElement.currentTime + 10);
    elements.audioElement.currentTime = targetTime;
    showToast('Skip 10s');
    // Immediate highlight update
    updateHighlightAtTime(targetTime);
  }
}

function updateHighlightAtTime(t) {
  if (state.activeTimings && state.activeTimings.length > 0) {
    const timings = state.activeTimings;
    for (let i = 0; i < timings.length; i++) {
      if (t >= timings[i].start && t <= timings[i].end) {
        highlightWordAndSentence(timings[i].index);
        break;
      }
    }
  }
}

// CLICK-TO-READ (JUMP TO WORD)
function jumpToWord(wordIndex) {
  if (!state.sessionId) {
    // If not started, start reading from word
    startFreshSession();
    return;
  }

  // Find chunk containing this word
  for (let i = 0; i < state.orderedChunkIds.length; i++) {
    const chunk = state.chunks.get(state.orderedChunkIds[i]);
    if (chunk && wordIndex >= chunk.wordStartIndex && wordIndex < (chunk.wordStartIndex + chunk.wordCount)) {
      state.currentPlayingIndex = i;
      waitForAndPlayChunk(i);
      highlightWordAndSentence(wordIndex);
      showToast(`Jumped to word #${wordIndex + 1}`);
      break;
    }
  }
}

// SCRUB BAR CLICK
function handleScrubClick(e) {
  const rect = elements.scrubBarTrack.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const pct = Math.max(0, Math.min(1, clickX / rect.width));
  if (elements.audioElement.duration) {
    elements.audioElement.currentTime = pct * elements.audioElement.duration;
  }
}

function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Run on load
document.addEventListener('DOMContentLoaded', init);
