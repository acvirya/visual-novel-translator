<div align="center">

# 🌸 Visual Novel Translator

**A next-generation desktop application for translating untranslated Visual Novels in real-time with transparent subtitles, zero-latency script knowledge base, and dynamic AI reasoning models.**

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24C8D5?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](LICENSE)

<br />

[**⬇️ Download Latest Release**](https://github.com/acvirya/visual-novel-translator/releases/latest) • [**📖 Quickstart Guide**](#-how-to-use) • [**💡 Best Practice Workflow**](#-recommended-workflow) • [**⌨️ Hotkeys**](#%EF%B8%8F-global-hotkeys)

</div>

---

> [!NOTE]
> **Active Development**: Visual Novel Translator is under active development. New features, UI polish, and performance optimizations are continuously added. Feedback, suggestions, and issue reports are warmly welcomed!

---

## 💡 What is Visual Novel Translator?

**Visual Novel Translator** allows you to read untranslated Japanese Visual Novels smoothly **without modifying game archives or binary files**.

Unlike traditional romhacking or script repacking tools (which require unpacking archive files, manipulating script bytecodes, and repacking everything), this application operates **alongside your running game**:
1. **Live Game Capture**: Reads dialogue in real-time as you play via **Textractor Memory Hooking** (32-bit & 64-bit) or **High-Speed Screen OCR** (Windows 10 & 11).
2. **Transparent HUD Overlay**: Displays smooth, customizable subtitles directly over your visual novel with click-through support.
3. **Instant Script Knowledge Base**: Matches lines against pre-loaded script files in $< 0.1\text{ms}$ with zero network latency and perfect story consistency.
4. **State-of-the-Art AI Translation**: Leverages advanced LLMs and reasoning models (DeepSeek R1, OpenAI o1/o3, Claude 3.7 Sonnet, Gemini Flash) with custom style presets and multi-turn context memory.

---

## 🌟 Key Capabilities

### 1. 🪟 Transparent Subtitle Overlay (In-Game HUD)
- **Click-Through Mode (`Ctrl + Shift + L`)**: Seamlessly pass mouse clicks directly to the underlying game without interrupting choices or menu navigation.
- **Interactive Move & Resize**: Toggle interactive mode to position, resize, and fine-tune your subtitle HUD with a visual drag handle.
- **Built-in Aesthetic Presets**: Choose from curated themes (*Visual Novel Classic*, *Glassmorphism*, *Cyberpunk*, *Cinematic Widescreen*, *RPG Dialogue Box*) or create custom designs.
- **Full Customization & Custom CSS**: Adjust fonts, outline thickness, text shadows, background blur, and inject custom CSS styles.

### 2. 🎮 Multi-Source Game Capture
- **Textractor Memory Hook (32-bit & 64-bit)**: Hooks directly into the visual novel process memory for instant, artifact-free text extraction.
  - Supports combined speaker/dialogue streams (e.g. `【智代】「おはよう」`).
  - Supports separate thread pairing (capturing character name thread as **👤 Speaker** and text thread as **💬 Dialogue** with automatic synchronization).
- **Native Windows OCR (Windows 10 & 11)**: High-speed screen OCR for non-hookable titles (browser games, emulators, engines with anti-hook protection).
  - Dual region selection for dialogue box and speaker nameplate.
  - Auto-scan timer or manual capture via hotkey (`F9`).

### 3. 🧠 Dynamic Model-Specific Reasoning & Thinking Tokens
- **Adaptive OpenRouter Reasoning Engine**: Automatically inspects model metadata to detect reasoning capabilities (*Supported Efforts*, *Mandatory Reasoning*, *Token Budgeting*, or *Binary Toggle*).
- **Nested Hover Submenu Selector**: Select model and effort level in **1 click** via an intuitive flyout submenu (*Default*, *Off*, *Minimal*, *Low*, *Medium*, *High*, *Max*).
- **Per-Model Preferred Effort Persistence**: Remembers your preferred thinking effort individually for each model (e.g., `Low` for o3-mini, `Medium` for Gemini Flash Thinking, `Max` for o3-max).

### 4. 🎭 Translation Style & Tone Presets + Real-Time Preview
- **Curated Tone Presets**:
  - *Standard Visual Novel*: Natural flow balancing character nuance and readability.
  - *Light Novel & Expressive*: Vivid emotional delivery and character vocal quirks.
  - *Erudite & Historical*: Classic literature tone for period pieces and heavy lore.
  - *Casual & Modern Slang*: Conversational tone with contemporary natural dialogue.
  - *Literal & Nuanced*: Precise fidelity preserving original Japanese sentence structures.
- **Custom User Presets & Variable Engine**: Create and save your own translation system prompts with dynamic variable interpolation (`{{TARGET_LANG}}`, `{{STYLE_INSTRUCTIONS}}`, `{{GLOSSARY}}`).
- **Live Interactive Preview**: Test system prompts against mock dialogue lines in real-time before playing.

### 5. 📚 Zero-Latency Script Knowledge Base & Auto-Learning
- **Sub-Millisecond In-Memory Lookup ($< 0.1\text{ms}$)**: Pre-load translated script files (`.json`, `.jsonl`, `.txt`, `.csv`) into memory. Matching dialogue lines appear instantly on the overlay without making online API requests.
- **Multi-Tier Fuzzy & Canonical Matching**: Compensates for line wraps, punctuation differences, and character prologue aliases (e.g. matching prologue alias *「クラスメイト」* with character name *「章吾」*).
- **Auto-Learning Stream**: Translations processed during your gameplay session can be automatically learned and saved to your local database for future playthroughs.

### 6. ⚡ High-Throughput Batch Script Translator
- **Pre-Translate Entire Games**: Translate extracted script files in bulk before playing.
- **Concurrency & Resilient Retries**: Multi-worker concurrent processing, automatic rate-limit backoff, and live token usage metrics.
- **Auto-Save & Resume**: Periodic checkpointing ensures long translation jobs never lose progress on unexpected interruptions.

### 7. 📖 Character Glossary & 1-Click VNDB Scraper
- **Terminology Consistency**: Enforce strict character names, gender references, and route-specific terms across your entire playthrough.
- **1-Click VNDB Import**: Enter any VNDB Visual Novel ID (e.g. `v17` for *Steins;Gate*, `v4` for *Fate/stay night*) to instantly import official character names, aliases, and gender tags into your glossary.

### 8. 🛠️ Custom Text Replacement & Preprocessing Pipeline
- **Furigana & Ruby Annotation Stripper**: Automatically cleans pronunciation readings like `私(わたし)`, `漢字[かんじ]`, and `<ruby>` tags so the translator receives clean raw text.
- **Engine Formatting & Control Code Cleaner**: Removes game engine formatting tags (e.g. `\c[2]`, `\v[1]`, color/font codes), escape sequences, and null bytes.
- **Unicode NFKC & Japanese Punctuation Normalization**: Standardizes half-width katakana, full-width characters, ellipses (`……` → `…`), quotes, and strips decorative noise symbols (`♪`, `♥`, `★`).
- **Custom Regex & Plain-Text Rules**: Create custom replacement rules with source-specific targeting (*Textractor*, *OCR*, *Batch*, *Manual*) and test them live in the built-in interactive sandbox.

### 9. 🌐 Flexible Translation Providers
- **Free Zero-Cost Translation**: Instant out-of-the-box translation using Google Translate Web Stream and DeepL Free scraper (no API keys required).
- **OpenRouter AI Gateway**: Connect your OpenRouter API key to access 200+ state-of-the-art models with custom provider routing.

---

## 🚀 How to Use

### 🎮 Method A: Playing with Game Memory Hook (Recommended)
1. Launch your Visual Novel game.
2. Open **Visual Novel Translator** and navigate to **🎮 Textractor Input** in the sidebar.
3. Click **Refresh Process List**, choose your visual novel process, and click **Attach Process**.
4. Advance dialogue in your game to populate the **Detected Threads** list:
   - If the thread contains both speaker and dialogue (e.g. `【遥月】「おはよう」`), set role to **✨ Combined**.
   - If speaker and dialogue appear on separate threads, assign one to **👤 Speaker** and the other to **💬 Dialogue**.
5. Enable the **In-Game Overlay** (press `Ctrl + Shift + L` to reposition or resize).
6. Read smoothly! Subtitles update in real-time as you advance in-game dialogue.

---

### 📷 Method B: Playing with Screen OCR
1. Launch your game.
2. Navigate to **📷 OCR Input** in the sidebar.
3. Click **Select Dialogue Region** and drag a bounding box over the game's text area.
4. *(Optional)* Click **Select Speaker Region** if character names appear in a separate nameplate box.
5. Set scan mode to **Auto-Scan (Timer)** or press **`F9`** for instant manual capture.
6. Open the **In-Game Overlay** and enjoy.

---

## 💡 Recommended Workflow: The "Zero-Latency" Advantage

For the ultimate reading experience with zero translation delay and maximum AI quality:
1. **Extract** game script files to `.txt`, `.json`, or `.jsonl` using extraction tools for your game engine.
2. Open **⚡ Batch Translate** to translate the script files using an AI model of your choice.
3. Open **📚 Script Database**, click **Import Scripts**, and add your translated files into the database.
4. Launch your game and play with **Textractor Hook**:
   - Every line of dialogue instantly matches your local database ($< 0.1\text{ms}$) with **zero API cost** and **no network lag**.
   - Any unscripted lines gracefully fall back to live AI / MT translation.

---

## ⌨️ Global Hotkeys

| Shortcut | Action |
|---|---|
| `Ctrl + Shift + L` | Toggle Overlay Click-Through / Interactive Move & Resize Mode |
| `Ctrl + Shift + P` | Pause / Resume Live Translation Stream |
| `F9` | Trigger Instant Manual OCR Scan |

*(Hotkeys can be customized under Settings → General Settings)*

---

## 🛠️ Build from Source (For Developers)

<details>
<summary>Click to expand developer build instructions</summary>

### Prerequisites
- **Node.js** (v18.0 or newer)
- **Rust & Cargo** (v1.75 or newer)
- **C++ Build Tools** (Visual Studio Desktop Development with C++)

### Local Setup & Compilation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/acvirya/visual-novel-translator.git
   cd visual-novel-translator
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Run in development mode**:
   ```bash
   npm run tauri dev
   ```

4. **Run automated test harness**:
   ```bash
   npx vitest run
   ```

5. **Build production bundle (`.exe` / `.msi`)**:
   ```bash
   npm run tauri build
   ```

</details>

---

## 📄 License

Distributed under the **GNU General Public License v3.0 (GPL-3.0)**. See [`LICENSE`](LICENSE) for full details.

Copyright © 2026 **Anggatha Chandra Virya**. All rights reserved.
