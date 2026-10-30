package com.hydropulse.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(EndlessPoolsUdpPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
