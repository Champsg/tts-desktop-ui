# Kokoro Desktop UI for PC

A fast, modern Speechify-style desktop reader for PCs that directly interacts with the `voiceabckend` Kokoro-82M TTS engine.

---

## 🚀 Features

- **Karaoke-style Synchronized Word Highlighting**: Highlights words in real-time as Kokoro speaks, using sub-second alignment timestamps.
- **Interactive Click-to-Jump**: Click any word in the text to immediately jump audio playback and speech generation to that word.
- **Voice Selection**: Choose from 9 built-in Kokoro voices (`af_bella`, `af_sarah`, `am_michael`, `am_adam`, `bf_emma`, etc.).
- **Live Pipeline Monitor**: Visual monitor for chunks being buffered, generated, and read over WebSocket.
- **Pitch & Speed Control**: Smooth playback speed adjustment (0.5x to 2.5x).
- **Import Documents**: Easily import text files (`.txt`, `.md`).
- **No Dependencies Required**: Works in any browser without needing Flutter or heavy frameworks.

---

## 🏃 How to Run on PC

1. **Start the Voice Backend first**:
   Double click `voiceabckend\run_backend.bat` (starts at `http://localhost:8000`).

2. **Launch the Desktop UI**:
   Double click [run_ui.bat](file:///c:/Users/shuja/OneDrive/Desktop/TTS/desktop_ui/run_ui.bat) inside this folder, or open [index.html](file:///c:/Users/shuja/OneDrive/Desktop/TTS/desktop_ui/index.html) in your browser.
