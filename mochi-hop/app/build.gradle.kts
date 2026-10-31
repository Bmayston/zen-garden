plugins {
    id("com.android.application")
}

android {
    namespace = "com.mochihop.game"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.mochihop.game"
        minSdk = 26
        targetSdk = 36
        // CI run number keeps every Play upload's versionCode increasing.
        versionCode = System.getenv("GITHUB_RUN_NUMBER")?.toIntOrNull() ?: 1
        versionName = "1.0"
    }

    // Release signing comes from environment variables (GitHub Actions secrets).
    // See RELEASING.md. Without them, only the debug build is produced.
    val keystorePath: String? = System.getenv("MOCHI_KEYSTORE")
    signingConfigs {
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = System.getenv("MOCHI_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("MOCHI_KEY_ALIAS")
                keyPassword = System.getenv("MOCHI_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            if (keystorePath != null) signingConfig = signingConfigs.getByName("release")
            isMinifyEnabled = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    implementation("androidx.core:core:1.13.1")
}
