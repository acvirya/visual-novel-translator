<div align="center">

# 🌸 Visual Novel Translator

**A Windows desktop application for translating visual novels while you play. Capture dialogue with Textractor or screen OCR, translate it using machine translation or a configured LLM, and read the result in a customizable in-game overlay.**

[![Tauri v2](https://img.shields.io/badge/Tauri-v2.0-24C8D5?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app/)
[![React 19](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Rust](https://img.shields.io/badge/Rust-1.75+-DEA584?style=flat-square&logo=rust&logoColor=black)](https://www.rust-lang.org/)
[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg?style=flat-square)](LICENSE)

</div>

## Features

- **Live translation:** provides dialogue history, provider selection, conversation context, and session usage counters. OCR shortcuts also feed the live log.
- **Two capture methods:** Textractor hooks for supported engines, or OneOCR for screen regions and one-shot snipping.
- **In-game overlay:** custom HTML/CSS presets, click-through positioning, and text-only typewriter, fade, or blur animations.
- **Batch script translation:** configurable chunking, concurrency, retries, cancellation, and resume from compatible saved output.
- **Glossary:** shared terminology for LLM prompts, VNDB character import, and category filtering
- **Script memory:** reuse translations offline, edit JSON/JSONL dialogue, and append entries from other scripts into the active file.
- **Provider configuration:** Google machine translation, DeepL API Free, and configurable LLM providers.
- **Local credentials:** desktop API keys are stored in the operating system credential store, outside the settings JSON.

## Requirements

The native application targets **Windows**. OneOCR requires compatible Microsoft Snipping Tool runtime/model files; other features can start without them.

For development:

- Node.js **22.13+** or **24**, with npm.
- Current stable Rust with the **Windows MSVC** toolchain.
- Microsoft C++ Build Tools with **Desktop development with C++** and a Windows SDK.
- Microsoft Edge **WebView2 Runtime**.

See the [Tauri Windows prerequisites](https://v2.tauri.app/start/prerequisites/#windows) for platform setup. Textractor and provider credentials are optional and configured separately in the application.

## Run from source

```powershell
git clone <repository-url>
cd vn-translator
npm ci
npm run tauri dev
```

For a browser-only UI preview:

```powershell
npm run dev
```

Open the local URL printed by Vite, normally `http://localhost:1420`. Native hooks, screen capture, OS shortcuts, and credential persistence require the Tauri application. Browser-preview credentials last only for that session.

## Getting started

1. Open **Settings** and choose the source and target languages. Configure an LLM provider if needed, or select Google Translate for translation without an API key. DeepL API Free requires its own key.
2. Open **Live translation → Capture setup**. Connect Textractor to a supported game process, or select screen OCR and configure the dialogue/speaker regions.
3. Choose a translation engine in **Live translation**. New dialogue and shortcut results appear at the top of the log; translation failures are displayed as errors.
4. Configure **In-game overlay**, position it over the game, and enable it. Animations affect the text while the dialogue backdrop stays in place.
5. Add names and terminology in **Knowledge base → Glossary & terms**. Use **Categories** to filter or manage categories; closing that panel restores the full list. Lock terms you want to keep when clearing the glossary.

### OpenAI: API key or OAuth

In **Settings → Translation providers → OpenAI**, select one authentication method:

- **API key:** enter your OpenAI API key and choose **Verify Key**. Requests use OpenAI API billing.
- **OAuth · ChatGPT:** choose **Continue with ChatGPT**, authorize the app in your browser, and return to the desktop app. Available models are loaded from your selected account. Eligible requests use your ChatGPT plan or credits, subject to account access and usage limits. This uses the official [Sign in with ChatGPT flow for open-source applications](https://developers.openai.com/siwc/token-sharing-open-source/sign-in).

Switching methods cancels active OpenAI requests. The other method remains saved and inactive; authentication failures never switch methods automatically. OAuth works with live, manual, shortcut, and batch translation. **Manage usage** opens your ChatGPT usage settings.

OAuth requires the Windows desktop application. Tokens refresh in the native backend and remain encrypted with Windows DPAPI for the current Windows user. They are not stored in browser settings. ChatGPT plan requests use the Responses API; sampling and output-token overrides are omitted under its current [request limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations).

See [OpenAI OAuth integration notes](docs/OPENAI_OAUTH.md) for implementation details, verification, and troubleshooting.

### Textractor

Install a compatible Textractor build, select its executable in Capture setup, choose the game's process and architecture, and inspect the available hook threads. Hook support depends on the game engine; screen OCR is an alternative when a suitable hook is unavailable.

### OneOCR

The application searches for compatible Snipping Tool files and also accepts a custom runtime directory in OCR settings. The directory must contain `oneocr.dll`, its matching model (`oneocr.onemodel` or `oneocr.model`), and the runtime dependencies required by that DLL.

Microsoft runtime/model files are **not included in this repository**. On systems that deny direct loading from WindowsApps, the application caches runtime DLLs in the current user's local application data. Captured images are processed in memory.

### Script memory and batch files

- **Open script** opens a file as the active translation memory.
- **Import entries** appends entries from other scripts to that active file. It is available after a file is open.
- JSON/JSONL memory files save edits automatically. Imports in other supported formats remain in memory until exported.
- Batch translation writes JSONL output using the configured folder and filename suffix. Resume reuses existing translations only when the source text still matches.

Example JSONL record:

```json
{"id":1,"speaker":"Tomoyo","message":"Original dialogue","translated_speaker":"Tomoyo","translated_message":"Translated dialogue"}
```

### Default shortcuts

| Shortcut | Action |
| --- | --- |
| `Alt+L` | Toggle overlay click-through |
| `Alt+P` | Pause or resume live translation |
| `Alt+O` | Scan the configured OCR regions |
| `Alt+S` | Open one-shot OCR snipping |

Change shortcuts in **Settings → General & shortcuts**. Registration can fail if another application already owns the same combination.

## Build and validate

```powershell
npm run check
npx playwright install chromium
npm run test:ui
cargo test --manifest-path src-tauri/Cargo.toml --lib
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Optional integration checks use installed OCR files or a live network connection:

```powershell
cargo test --manifest-path src-tauri/Cargo.toml --lib installed_oneocr -- --ignored
cargo test --manifest-path src-tauri/Cargo.toml --lib google_translates_japanese_sample -- --ignored
```

Create a production bundle:

```powershell
npm run tauri build
```

Tauri writes bundle artifacts under `src-tauri/target/release/bundle/`. Test installers on a clean Windows environment before distributing them.

## Data and privacy

- Settings and script memory are local. Desktop API keys use the OS credential store; settings snapshots omit those keys.
- OAuth sessions remain in a local, Windows-user-encrypted credential file. **Sign out** attempts remote session revocation and clears local tokens; saved account registrations remain available for later sign-in. Token counters do not represent your remaining ChatGPT plan allowance; use **Manage usage** for that information.
- Online translation sends selected text to the selected provider. Provider availability, pricing, and limits apply. Google MT uses public endpoints that may become unavailable or rate limited; a failed DeepL request does not switch to Google.
- Application, batch-debug, and usage logs can contain dialogue or request snippets. Treat exported logs and scripts as potentially sensitive.
- Overlay templates are restricted to presentation markup. Frame scripts, forms, and external resource requests are blocked; template CSS stays separate from the application UI.
- Locked glossary terms are protected from Clear all and direct deletion. A confirmed factory reset still resets the glossary, including locked terms.

## Project structure

```text
src/
  components/       Desktop UI, capture editors, and overlay windows
  services/         Translation, provider, OCR, settings, and logging logic
  stores/           Shared frontend state
  utils/            Parsing, preprocessing, and overlay rendering
src-tauri/
  src/              Native capture, hooks, HTTP, files, and credentials
  capabilities/     Permissions for each native window
  vendor/oneocr-rs/  MIT-licensed binding with an explicit model-path patch
e2e/                Browser regression tests
```

The local OneOCR dependency patch is documented in [PATCHES.md](src-tauri/vendor/oneocr-rs/PATCHES.md). OpenAI authentication changes and verification are documented in [OpenAI OAuth integration notes](docs/OPENAI_OAUTH.md).

## Contributing

Keep changes focused and include regression coverage for behavior changes. Run the validation commands before submitting a pull request. For bug reports, include the app version, Windows version, capture method, selected provider, reproduction steps, and redacted logs. Never include API keys or private game content in a public report.

## License

Copyright Anggatha Chandra Virya. Distributed under [GPL-3.0-or-later](LICENSE). Third-party dependencies retain their respective licenses; the vendored OneOCR binding includes its [MIT license](src-tauri/vendor/oneocr-rs/LICENSE).
