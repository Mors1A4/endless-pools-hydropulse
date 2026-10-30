import subprocess
import time
import os
import json
import urllib.request
import websocket # let's check if websocket is available or write raw socket

print("Checking CDP websocket")
try:
    import websocket
    print("websocket-client is installed!")
except ImportError:
    print("websocket not installed, let's check if we can install or use puppeteer")
