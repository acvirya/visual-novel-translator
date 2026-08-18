# Visual Novel Translator

A modern desktop application for extracting, translating, and repacking Visual Novel dialogue and scripts, powered by **Tauri v2**, **Rust**, and **React + TypeScript**.

## 🚀 Fitur Utama
- **High Performance Backend**: I/O cepat dan memory-efficient dengan Rust.
- **Modern UI**: React 19 + TypeScript + Vite.
- **Cross-Platform**: Support desktop Windows, Linux, dan macOS.
- **CI/CD Built-in**: Otomatis build release installer via GitHub Actions.

## 🛠️ Prasyarat
- [Node.js](https://nodejs.org/) (v18+)
- [Rust & Cargo](https://www.rust-lang.org/) (v1.75+)
- [C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (untuk Windows)

## 📦 Menjalankan Secara Lokal

### 1. Install Dependensi
```bash
npm install
```

### 2. Jalankan Mode Development (Desktop)
```bash
npm run tauri dev
```

### 3. Build Production Installer
```bash
npm run tauri build
```
File installer (`.exe` / `.msi`) akan berada di direktori `src-tauri/target/release/bundle/`.

## 🌐 Menghubungkan ke GitHub

1. Buat repository baru di GitHub dengan nama `visual-novel-translator`.
2. Hubungkan repository lokal:
```bash
git remote add origin https://github.com/<username>/visual-novel-translator.git
git branch -M main
git push -u origin main
```
