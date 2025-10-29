plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.gms.google-services")
}

val googleServicesJson = listOf(
    "google-services.json",
    "src/debug/google-services.json",
    "src/release/google-services.json"
)
    .map { file(it) }
    .firstOrNull { it.exists() }

if (googleServicesJson != null) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.warn(
        "google-services.json not found in $projectDir. " +
            "Firebase authentication will be disabled until the file is added."
    )
}

val googleServicesJson = listOf(
    "google-services.json",
    "src/main/google-services.json",
    "src/debug/google-services.json",
    "src/release/google-services.json"
)
    .map { file(it) }
    .firstOrNull { it.exists() }

if (googleServicesJson != null) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.warn(
        "google-services.json not found in $projectDir. " +
            "Firebase authentication will be disabled until the file is added."
    )

    tasks.matching { task ->
        task.name.contains("GoogleServices")
    }.configureEach {
        enabled = false
    }
}

android {
    namespace = "com.example.htmlapp"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.htmlapp"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.12.0")
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("com.google.android.material:material:1.11.0")
    implementation("androidx.activity:activity-ktx:1.8.2")
    implementation("androidx.webkit:webkit:1.9.0")

    implementation(platform("com.google.firebase:firebase-bom:32.7.4"))
    implementation("com.google.firebase:firebase-auth-ktx")
    implementation("com.firebaseui:firebase-ui-auth:8.0.2")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.5")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.1")
}
