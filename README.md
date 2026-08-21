<div align="center">

# 🌸 Visual Novel Translator

**A modern, ultra-low-latency desktop suite for real-time Visual Novel translation, live transparent subtitle overlay, OCR extraction, and script batch processing.**

Powered by **Tauri v2**, **Rust**, **React 19**, and **TypeScript**.

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-24C8D5?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](LICENSE)

</div>

---

## ✨ Core Features (User Highlights)

### 1. 🎮 Dual Text Extraction Subsystem
- **Textractor CLI Hooking**: Attach directly to running 32-bit & 64-bit Visual Novel processes with zero latency. Includes pre-configured engine presets for **Siglus Engine**, **Kirikiri 2/Z**, **Majiro**, **Unity (Mono/IL2CPP)**, **CatSystem2**, **Artemis**, **YU-RIS**, and **NScripter**.
- **Microsoft OneOCR Engine**: High-speed, offline Windows OneOCR screen capture with **Motion Stability Detection**. Automatically distinguishes between typewriter animations, blinking prompts, and settled dialogue lines before triggering translation.

### 2. 🪟 Transparent Game Overlay (HUD)
- **Click-Through Game Subtitle Box**: Displays translated dialogue directly on top of your visual novel with zero interference.
- **Customizable Appearance**: Adjust font size, outline stroke, font color, background opacity, auto-expansion ratio, and monitor placement.
- **HTML/CSS Template Engine**: Switch between built-in aesthetic themes (*Classic*, *Glassmorphism*, *Cyberpunk*, *Cinematic*, *RPG Quest*) or write your own custom CSS styling.

### 3. 🤖 Intelligent LLM & Machine Translation Pipeline
- **OpenRouter AI Integration**: Connect to leading AI models (Claude 3.5 Sonnet, OpenAI GPT-4o, DeepSeek V3/R1, Gemini 2.5 Flash, Qwen 2.5) with multi-turn context memory retention.
- **Structured Output Parsing**: Strict JSON dialogue extraction preserving character tone, emotional nuances, and Japanese honorifics (`-san`, `-kun`, `-chan`, `-senpai`).
- **Resilient Retry & Backoff**: Automated jittered exponential backoff for rate-limited (HTTP 429) requests.
- **Free MT Engines**: Built-in Google Translate & DeepL Free translation executed via native Rust HTTP workers (bypassing CORS limits).

### 4. 📚 Offline Script Database & Fast Matching Engine
- **Instant Script Lookup**: Automatically matches incoming dialogue against local `.jsonl` / `.json` translation scripts before calling cloud APIs.
- **Inverted N-Gram Fuzzy Search**: Blazing fast `O(k)` Bigram/Trigram indexing with Sørensen–Dice similarity scoring on massive scripts (50,000+ lines) without UI freezing.
- **Auto-Learning & Append**: Automatically saves newly translated lines into the active script database on the fly.

### 5. ⚡ High-Throughput Batch Translation
- **Parallel Multi-Worker Processing**: Translate whole visual novel script dumps concurrently with customizable batch sizes.
- **Smart Key Mapping**: Auto-detects custom JSON/JSONL keys (`speaker`, `message`, `character`, `text`, `dialogue`, etc.).
- **Debounced Progressive Disk Persistence**: Eliminates disk thrashing by streaming updates safely to disk without rewriting entire files repeatedly.
- **Prompt Caching Friendly**: Whole-turn history assembly optimized for 100% LLM prompt prefix caching discounts.

### 6. 🧹 Smart Japanese Text Preprocessing
- Strips Furigana/Ruby annotations (`漢字(かんじ)`, `漢字[かんじ]`, `<ruby>` HTML).
- Cleans visual novel engine control codes (`\c[1]`, `\v[2]`, `[wait]`, `{size=24}`, `@b1`).
- Unicode NFKC normalization (half-width Katakana normalization).
- Shadow/outline font typewriter deduplication and stutter reduction.

### 7. 📖 Character & Glossary Manager with VNDB Sync
- Maintain dedicated character name and term glossaries injected automatically into translation prompts.
- **1-Click VNDB Sync**: Query the [Visual Novel Database (VNDB)](https://vndb.org/) to import character names, aliases, romaji, roles, and gender tags directly into your glossary.

### 8. ⌨️ System-Wide Global Hotkeys
- `Ctrl+Shift+L`: Toggle Overlay Click-Through / Interactive Edit Mode.
- `Ctrl+Shift+P`: Pause / Resume Live Translation Stream.
- `F9`: Trigger Instant Manual OCR Scan on designated regions.

---

## 🏗️ Architecture Overview

```
vn-translator/
├── src/                          # Frontend Layer (React 19 + TypeScript + Vite)
│   ├── components/
│   │   ├── common/               # Shared Reusable UI (Modal, ConfirmDialog, Toast, Badge, Switch)
│   │   ├── layout/               # Sidebar, Navigation, & App Header
│   │   ├── overlay/              # Transparent HUD Window & OCR Region Selector
│   │   └── views/                # 12 Primary App Views (Live, Batch, Textractor, OCR, etc.)
│   ├── services/                 # Core Business Logic (Translation, Batch, Script, Shortcuts, VNDB)
│   ├── stores/                   # Zustand Reactive Stores
│   └── utils/                    # Preprocessing Pipeline, Template Engine, Multi-Monitor Utils
└── src-tauri/                    # Backend Layer (Rust + Tauri v2)
    ├── src/
    │   ├── lib.rs                # Tauri App Entrypoint & Native HTTP Engine
    │   ├── oneocr.rs             # Microsoft OneOCR Engine & Motion Stability Detector
    │   ├── screen_capture.rs     # Win32 GDI BitBlt Screen Capture & Cropping
    │   └── textractor.rs         # Win32 Process Enumerator & Textractor Sidecar Controller
    └── Cargo.toml                # Rust Dependencies & Native Plugins
```

---

## 🛠️ Prerequisites

Before building or running locally, make sure you have:

1. **[Node.js](https://nodejs.org/)** (v18.0 or newer)
2. **[Rust & Cargo](https://www.rust-lang.org/)** (v1.75 or newer)
3. **[C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)** (Visual Studio with "Desktop development with C++" workload on Windows)
4. *(Optional)* **[Textractor](https://github.com/Artikash/Textractor)** installed for direct memory hook extraction.

---

## 📦 Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/acvirya/visual-novel-translator.git
cd visual-novel-translator
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run in Development Mode
```bash
npm run tauri dev
```

### 4. Build Production Bundle / Installer
```bash
npm run tauri build
```
The compiled release executable and installer (`.exe` / `.msi`) will be located in:
```
src-tauri/target/release/bundle/
```

---

## 💡 Quick Start Guide for Users

1. **Configure Providers**: Go to **Translation Providers**, enter your OpenRouter API Key (or select Google/DeepL Free MT), and star your preferred models.
2. **Setup Input Source**:
   - **For Hooking**: Open **Textractor Hook**, refresh target processes, select your game window, and click **Attach & Start Hooking**.
   - **For OCR**: Open **OCR Input**, click **Select Screen Region**, and drag boxes over the dialogue & character name areas.
3. **Open Overlay**: Enable the subtitle overlay from **Overlay Settings** or press `Ctrl+Shift+L` to customize placement over your game.
4. **Enjoy the Story**: Play your visual novel while translated English dialogue streams onto your transparent HUD in real-time!

---

## 🤝 Contributing

Contributions, bug reports, and feature requests are welcome!
Feel free to open an issue or submit a pull request.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

---

## 📄 License

Distributed under the **GNU General Public License v3.0 (GPL-3.0)**. See [`LICENSE`](LICENSE) for more information.

Copyright © 2026 **Anggatha Chandra Virya**. All rights reserved.
