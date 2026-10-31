# Keep the JavaScript bridge methods called from the game.
-keepclassmembers class com.mochihop.game.MainActivity$NativeBridge {
    @android.webkit.JavascriptInterface <methods>;
}
