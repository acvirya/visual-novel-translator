<div align="center">

# 🌸 Visual Novel Translator

**A lightweight desktop app for translating untranslated Visual Novels in real-time with customizable transparent subtitles, zero-latency script lookup, and AI-powered translation.**

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D5?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](LICENSE)

<br />

[**⬇️ Download Latest Installer**](https://github.com/acvirya/visual-novel-translator/releases/latest) • [**📖 User Guide**](#-how-to-use) • [**💡 Best Practices**](#-recommended-workflow) • [**⌨️ Hotkeys**](#%EF%B8%8F-global-hotkeys)

</div>

---

> [!NOTE]
> **Active Development**: This project is currently in active development. Features, user experience, and performance optimizations are actively being refined. Feedback and bug reports are warmly welcome!

---

## 💡 What is Visual Novel Translator?

**Visual Novel Translator** is designed to **live translate** visual novels without modifying game files. 

Unlike romhacking or script repacking tools (which require extracting game archives, modifying script codes, and repacking files back into the game engine), this application works **alongside your running game**:
- Captures Japanese dialogue in real-time as you play (via **Textractor Game Hooking** or **Screen OCR**).
- Displays smooth, translated subtitles directly over your game using a **Transparent Subtitle Overlay**.
- Leverages a local **Script Knowledge Base** so pre-translated dialogue lines appear instantly with zero API lag and 100% accurate context.

---

## 🎯 Key Features

### 1. 🪟 Transparent Subtitle Overlay (HUD)
- **Click-Through Mode**: Displays subtitles on top of your game without interfering with your mouse clicks or gameplay.
- **Full Customization**: Change font styles, font sizes, text outlines, background opacity, colors, and positioning.
- **Aesthetic Presets**: Choose from built-in themes (*Classic*, *Glassmorphism*, *Cyberpunk*, *Cinematic*, *RPG Box*) or customize your own look.

### 2. 🎮 Two Capture Modes
- **Game Hooking (Textractor Engine)**: Hooks directly into 32-bit & 64-bit game processes to read text straight from game memory with minimal delay. Supports combined threads and separate speaker/dialogue threads with automatic synchronization.
- **Screen OCR Capture** *(Windows 11 only)*: For games that cannot be hooked (browser games, emulators, or non-hookable engines), simply select screen regions over the dialogue box to capture text directly using Windows 11's built-in high-speed OCR.

> [!IMPORTANT]
> **Windows 11 Requirement for OCR**: The built-in Screen OCR feature uses the native Windows 11 high-speed OCR API (`Windows.Media.Ocr` / OneOCR). If you are running Windows 10 or older, please use the **Textractor Hook** mode.

### 3. 📚 Local Script Database & Knowledge Base
- **Zero-Latency Lookups**: Pre-load translated script files (`.json`, `.jsonl`, `.txt`) into the app. When you encounter a line in-game, the app performs an instant in-memory lookup ($< 0.1\text{ms}$) instead of making online API requests.
- **Smart Matching**: Uses multi-tier fuzzy and canonical matching with speaker-alias compensation (e.g. matching prologue alias *「クラスメイト」* with character name *「章吾」*).
- **Auto-Learning**: Translations processed during your gameplay session can be automatically saved to your local database for future playthroughs.

### 4. ⚡ Batch Script Translator
- **Build Your Knowledge Base Offline**: Translate extracted script files (`.json`, `.jsonl`, `.txt`) in bulk using OpenRouter AI models or free translation before you play.
- **Auto-Save & Resume**: Supports batching, automatic progress checkpointing, and retry recovery so long translation jobs never lose progress.

### 5. 🤖 Flexible Translation Engines
- **Free Translators (No API Key Needed)**: Instant out-of-the-box translation using Google Translate and DeepL Free.
- **AI Models (OpenRouter)**: Connect your OpenRouter API key to use advanced LLMs (Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro, DeepSeek, etc.) with custom system prompts and multi-turn story context memory.

### 6. 📖 Character Glossary & VNDB Integration
- **Character Name Synchronization**: Ensure character names and terminology remain consistent across all routes.
- **1-Click VNDB Import**: Enter a VNDB visual novel ID (e.g. `v17`) to automatically import character names, aliases, and gender tags into your glossary.

---

## 🚀 How to Use

### 🎮 Method A: Playing with Game Hook (Recommended)
1. Start your Visual Novel game.
2. Open **Visual Novel Translator** and go to **🎮 Textractor Input** in the sidebar.
3. Click **Refresh Process List**, select your game process, and click **Attach Process**.
4. Advance a line of dialogue in your game. Check the **Detected Threads** list:
   - If the thread contains both speaker and dialogue (e.g., `【遥月】「おはよう」`), set its role to **✨ Combined**.
   - If speaker and dialogue appear on separate threads, capture the speaker thread as **👤 Speaker** and the dialogue thread as **💬 Dialogue**.
5. Enable the **Transparent Overlay** (press `Ctrl + Shift + L` to adjust position and size).
6. Enjoy your game! Subtitles will update automatically as you advance dialogue.

---

### 📷 Method B: Playing with Screen OCR
1. Start your game.
2. Go to **📷 OCR Input** in the sidebar.
3. Click **Select Dialogue Region** and drag a rectangle over the game's text box.
4. *(Optional)* Click **Select Speaker Region** if character names appear in a separate box.
5. Set the scan trigger to **Auto-Scan (Timer)** or press **`F9`** for instant manual capture.
6. Open the **Transparent Overlay** and play.

---

## 💡 Recommended Workflow: The "Pre-Translate" Advantage

For the best reading experience with zero translation lag and high AI quality:
1. **Extract** your visual novel scripts to `.txt` or `.jsonl`.
2. Open **⚡ Batch Translate** in this app to translate the files using an LLM.
3. Open **📚 Script Database**, click **Import Scripts**, and add your translated script files into the database.
4. Now, launch your game and play with **Textractor Hook**!
   - Every line of dialogue will instantly match your pre-translated script database ($< 0.1\text{ms}$) with zero API cost and no network lag.
   - Any lines that were not in the script will gracefully fall back to live AI/MT translation.

---

## ⌨️ Global Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl + Shift + L` | Toggle Overlay Click-Through / Interactive Resize & Move Mode |
| `Ctrl + Shift + P` | Pause / Resume Live Translation Stream |
| `F9` | Trigger Instant Manual OCR Scan |

---

## 🛠️ Build from Source (For Developers)

<details>
<summary>Click to view build instructions</summary>

### Prerequisites
- **Node.js** (v18.0 or newer)
- **Rust & Cargo** (v1.75 or newer)
- **C++ Build Tools** (Visual Studio Desktop development with C++)

### Installation & Running Locally

1. **Clone the repository**:
   ```bash
   git clone https://github.com/acvirya/visual-novel-translator.git
   cd visual-novel-translator
   ```

2. **Install frontend dependencies**:
   ```bash
   npm install
   ```

3. **Start development mode**:
   ```bash
   npm run tauri dev
   ```

4. **Build production installer (`.exe` / `.msi`)**:
   ```bash
   npm run tauri build
   ```

</details>

---

## 📄 License

Distributed under the **GNU General Public License v3.0 (GPL-3.0)**. See [`LICENSE`](LICENSE) for more details.

Copyright © 2026 **Anggatha Chandra Virya**. All rights reserved.
