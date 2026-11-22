package com.dachhack.mininggame;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The app always uses its own text sizes: the phone's text-size setting
        // (WebView text zoom) is turned off, the owner's answer to question 136.
        // With it on, Android scaled every font in the page and pushed buttons
        // out of fixed-height bars ("Place camp doesn't show", PR #123).
        WebSettings settings = getBridge().getWebView().getSettings();
        settings.setTextZoom(100);
    }
}
