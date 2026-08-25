<div align="center">

# 🌸 Visual Novel Translator

**A lightweight, all-in-one desktop application for real-time visual novel translation, transparent subtitle overlay, OCR screen capture, and batch script processing.**

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D5?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](LICENSE)

<br />

[**⬇️ Download Latest Installer**](https://github.com/acvirya/visual-novel-translator/releases/latest) • [**📖 User Guide**](#-quick-start-guide) • [**⌨️ Hotkeys**](#%EF%B8%8F-global-hotkeys)

</div>

---

## 🎯 Key Features

### 1. 🎮 Dual Text Input Modes
- **Game Hooking (Textractor)**: Attach directly to running 32-bit & 64-bit game processes to capture text from memory with zero latency.
- **Screen OCR Capture**: For games that cannot be hooked (browser games, emulators, or older engines), simply drag a box over dialogue and speaker areas to read text directly from the screen.

### 2. 🪟 Transparent Subtitle Overlay (HUD)
- **Click-Through Subtitles**: Displays translated dialogue directly over your game window without blocking mouse clicks.
- **Customizable Styling**: Adjust font size, text outlines, colors, background opacity, and placement.
- **Theme Presets**: Switch between built-in aesthetic styles (*Classic*, *Glassmorphism*, *Cyberpunk*, *Cinematic*, *RPG Box*) or customize with HTML/CSS.

### 3. 🤖 Flexible Translation Engines
- **OpenRouter AI**: Connect to any LLM supported by OpenRouter with multi-turn conversation memory for consistent story context.
- **Free Translation (No API Key Required)**: Built-in support for Google Translate and DeepL Free for instant out-of-the-box translation.

### 4. ⚡ Batch Script Translator
- Translate entire script files (`.json`, `.jsonl`, `.txt`) in parallel with auto-continue, retry recovery, and customizable batch sizes.
- Preserves original file formats and schema keys for visual novel modding and translation projects.

### 5. 📚 Local Script Database & Caching
- **Instant Script Matcher**: Automatically matches incoming game dialogue against local translated script files to avoid repetitive API calls.
- **Auto-Save**: Saves new translations to your local database as you play.

### 6. 📖 Character Glossary & VNDB Sync
- Maintain custom character names and term glossaries to ensure consistent naming across routes.
- **1-Click VNDB Sync**: Import character names, roles, and aliases directly from [The Visual Novel Database (VNDB)](https://vndb.org/).

---

## 🚀 Quick Start Guide

1. **Choose Translation Provider**:
   - Open **Translation Providers** from the sidebar.
   - Select **Free MT** (Google/DeepL) or enter your **OpenRouter API Key**.
2. **Select Text Source**:
   - **For PC Games**: Go to **Textractor Hook**, click **Refresh Targets**, select your game, and click **Attach**.
   - **For Other Games / OCR**: Go to **OCR Input**, click **Select Screen Region**, and drag a box over the dialogue box.
3. **Open Subtitle Overlay**:
   - Enable the overlay from **Overlay Settings** or press `Ctrl + Shift + L`.
   - Position the subtitle box over your game and start playing!

---

## ⌨️ Global Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl + Shift + L` | Toggle Overlay Click-Through / Interactive Position Mode |
| `Ctrl + Shift + P` | Pause / Resume Live Translation |
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

4. **Build release package (`.exe` / `.msi`)**:
   ```bash
   npm run tauri build
   ```

</details>

---

## 📄 License

Distributed under the **GNU General Public License v3.0 (GPL-3.0)**. See [`LICENSE`](LICENSE) for more information.

Copyright © 2026 **Anggatha Chandra Virya**. All rights reserved.
