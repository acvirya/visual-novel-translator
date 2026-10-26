# Local patch: explicit OneOCR model path

Source: [oneocr-rs 0.3.2](https://github.com/wangfu91/oneocr-rs), MIT license; original license included.

The upstream constructor always resolves `oneocr.onemodel` beside the executable. That prevents a configured Snipping Tool installation from working after deployment to a protected installation directory.

This copy adds `OcrEngine::new_with_model_path(options, path)`. Existing constructors retain their upstream behavior. No Microsoft DLL or model files are included. The application loads the selected DLL by absolute path with a restricted Windows dependency search and uses MSVC delay loading so OCR remains optional at startup.

When updating this dependency, preserve or replace this constructor with the upstream equivalent and repeat the native OCR smoke test. The remaining source files are the unmodified 0.3.2 binding sources.
