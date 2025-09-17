# HTML App Android Wrapper

This project scaffolds a minimal Android application that wraps a WebView around the provided Flag Football tracker HTML experience. It mirrors the defaults from a fresh Android Studio Kotlin project and is ready for you to replace the bundled HTML or point the WebView at a remote site.

## Getting started

1. Install the latest [Android Studio](https://developer.android.com/studio) (Giraffe or newer) with the Android SDK platforms and tools for API level 34.
2. Clone or copy this repository and open it from the **Open an Existing Project** option in Android Studio.
3. When prompted, let Android Studio sync the Gradle project and download any missing dependencies.
4. Connect an Android device or start an emulator running Android 7.0 (API 24) or later.
5. Click **Run ▶** to build and launch the app.

The Gradle wrapper is not included. To build from the command line, install Gradle 8.x locally and run:

```bash
gradle assembleDebug
```

## Swapping the bundled HTML

* Replace `app/src/main/assets/index.html` with your own HTML file. The WebView automatically loads `file:///android_asset/index.html` on startup.
* Add supporting assets (images, scripts, CSS) alongside `index.html` under `app/src/main/assets/` and reference them with relative URLs.

## Loading a remote URL instead

If you prefer to host the experience remotely:

1. Open `app/src/main/java/com/example/htmlapp/MainActivity.kt`.
2. Change the `ASSET_URL` constant to the desired URL (for example, `"https://example.com"`).
3. Ensure the remote content is served over HTTPS or enable cleartext traffic for development via `app/src/debug/AndroidManifest.xml`.

Rebuild and relaunch the application to verify that the WebView points at the remote content.
