package com.mochihop.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

/**
 * Hosts the canvas game (assets/game) full screen in a WebView.
 */
public class MainActivity extends Activity {

    private WebView webView;
    private OnBackInvokedCallback backCallback;
    private final NativeBridge bridge = new NativeBridge();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#8FD3FF"));
        webView.setVerticalScrollBarEnabled(false);
        webView.setHorizontalScrollBarEnabled(false);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);           // best score, petals, unlocked friends
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowContentAccess(false);
        s.setAllowFileAccess(false);            // android_asset is still readable

        bridge.init(this);
        webView.setOnApplyWindowInsetsListener((v, insets) -> {
            if (Build.VERSION.SDK_INT >= 28) {
                DisplayCutout cutout = insets.getDisplayCutout();
                float density = getResources().getDisplayMetrics().density;
                bridge.safeTopDp = cutout != null ? cutout.getSafeInsetTop() / density : 0f;
            }
            return v.onApplyWindowInsets(insets);
        });
        webView.addJavascriptInterface(bridge, "MochiNative");
        webView.loadUrl("file:///android_asset/game/index.html");
        setContentView(webView);

        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
    }

    /** Lets the game handle Back (pause / return to title); exits from the title screen. */
    private void handleBack() {
        webView.evaluateJavascript("window.mochiBack ? window.mochiBack() : false", result -> {
            if (!"true".equals(result)) finish();
        });
    }

    @SuppressWarnings("deprecation")
    @Override
    public void onBackPressed() {
        handleBack();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideSystemBars();
    }

    @SuppressWarnings("deprecation")
    private void hideSystemBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN);
        }
    }

    @Override
    protected void onPause() {
        super.onPause();
        webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) {
            getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        }
        webView.destroy();
        super.onDestroy();
    }

    /** Exposed to JavaScript as window.MochiNative. */
    static class NativeBridge {
        private Vibrator vibrator;
        private SharedPreferences prefs;
        volatile float safeTopDp = 0f;

        void init(Context ctx) {
            vibrator = (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
            prefs = ctx.getSharedPreferences("mochihop", Context.MODE_PRIVATE);
        }

        /** Light "tick" on hop, "click" on score, "heavy" on splat. */
        @JavascriptInterface
        public void haptic(String kind) {
            if (vibrator == null || !vibrator.hasVibrator()) return;
            VibrationEffect effect;
            if (Build.VERSION.SDK_INT >= 29) {
                int id = "heavy".equals(kind) ? VibrationEffect.EFFECT_HEAVY_CLICK
                        : "click".equals(kind) ? VibrationEffect.EFFECT_CLICK
                        : VibrationEffect.EFFECT_TICK;
                effect = VibrationEffect.createPredefined(id);
            } else {
                int ms = "heavy".equals(kind) ? 40 : "click".equals(kind) ? 14 : 6;
                effect = VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE);
            }
            vibrator.vibrate(effect);
        }

        /** Saves live in SharedPreferences so they survive WebView storage clean-ups. */
        @JavascriptInterface
        public String getItem(String key) {
            return prefs.getString(key, null);
        }

        @JavascriptInterface
        public void setItem(String key, String value) {
            prefs.edit().putString(key, value).apply();
        }

        /** Height of the camera cutout area at the top of the screen, in CSS pixels. */
        @JavascriptInterface
        public float safeTop() {
            return safeTopDp;
        }
    }
}
