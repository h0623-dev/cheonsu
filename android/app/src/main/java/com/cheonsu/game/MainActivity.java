package com.cheonsu.game;

import android.graphics.Color;
import android.os.Bundle;

import androidx.core.view.WindowCompat;

import com.getcapacitor.BridgeActivity;
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin;
import io.capawesome.capacitorjs.plugins.liveupdate.LiveUpdatePlugin;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Register only configured services; a missing Firebase project must not prevent offline play.
        if (getResources().getIdentifier("google_app_id", "string", getPackageName()) != 0) {
            registerPlugin(FirebaseAuthenticationPlugin.class);
        }
        if (!BuildConfig.PLAY_STORE_BUILD) registerPlugin(LiveUpdatePlugin.class);
        super.onCreate(savedInstanceState);

        WindowCompat.setDecorFitsSystemWindows(getWindow(), true);
        getWindow().setStatusBarColor(Color.parseColor("#120000"));
        getWindow().setNavigationBarColor(Color.parseColor("#050000"));
    }
}
