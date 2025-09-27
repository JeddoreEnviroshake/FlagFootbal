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

## Ref vs. player views

The bundled tracker now supports two roles that can be toggled from the hamburger menu in the top bar:

* **Ref view** (default) keeps all editing controls enabled so you can advance the clock, update scores, and manage downs.
* **Player view** is read-only — team cards, inline editors, and global buttons are disabled so spectators only see the scoreboard.

Each device remembers its own selection locally, so refs and spectators can join the same game without impacting one another.

## Live sync via Firebase Realtime Database

You can stream the scoreboard to other devices for free with Firebase's Realtime Database REST API:

1. Create a Firebase project and enable the Realtime Database in **test mode**, or generate a database secret if you want to lock writes.
2. Copy the database URL (for example `https://<project-id>-default-rtdb.firebaseio.com`).
3. Open the in-app menu ▶ **Live sync**, paste the database URL, optional secret, and a game code (this becomes the `/games/<code>` path).
4. Tap **Save & connect** on every device. Refs will publish changes, while player-mode devices automatically stay read-only.

The app uses Server-Sent Events to listen for updates. If your WebView or browser does not support `EventSource`, the sync panel will display a compatibility warning.
