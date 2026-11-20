plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.livescreen.tv"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.livescreen.tv"
        minSdk = 21
        targetSdk = 34
        versionCode = 16
        versionName = "2.11.0-kick-points-test"
    }

    signingConfigs {
        create("fixed") {
            storeFile = file("livescreen.keystore")
            storePassword = "livescreen123"
            keyAlias = "livescreen"
            keyPassword = "livescreen123"
        }
    }

    buildTypes {
        debug { signingConfig = signingConfigs.getByName("fixed") }
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("fixed")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}
