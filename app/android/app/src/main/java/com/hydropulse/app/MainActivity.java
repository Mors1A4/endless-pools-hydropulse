package com.hydropulse.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;

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

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_AUDIO_PERMISSION && grantResults.length > 0 
                && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
            PluginHandle handle = getBridge().getPlugin("EndlessPoolsUdp");
            if (handle != null && handle.getInstance() instanceof EndlessPoolsUdpPlugin) {
                ((EndlessPoolsUdpPlugin) handle.getInstance()).onPermissionGranted();
            }
        }
    }
}
