package com.hydropulse.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int REQ_AUDIO_PERMISSION = 201;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EndlessPoolsUdpPlugin.class);
        super.onCreate(savedInstanceState);

        // Prompt for Android microphone runtime permission if not yet granted
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) 
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this, 
                new String[]{Manifest.permission.RECORD_AUDIO}, 
                REQ_AUDIO_PERMISSION
            );
        }
    }
}
