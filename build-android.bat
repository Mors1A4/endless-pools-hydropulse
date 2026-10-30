@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo       Building HydroPulse Android APK for Pixel 8
echo ========================================================
echo.

cd /d "%~dp0"

set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "ANDROID_HOME=C:\Users\monty\AppData\Local\Android\Sdk"

if not exist "%JAVA_HOME%\bin\javac.exe" (
    echo [WARN] Java not found at %JAVA_HOME%, using system Java...
)

echo [1/4] Building Web Frontend (Vite + TypeScript)...
cd app
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Web build failed!
    exit /b %ERRORLEVEL%
)

echo [2/4] Syncing assets to Android platform...
call npx cap sync android
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Capacitor sync failed!
    exit /b %ERRORLEVEL%
)

echo [3/4] Compiling Native Android APK with Gradle...
cd android
call gradlew.bat assembleDebug
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Gradle build failed!
    exit /b %ERRORLEVEL%
)

cd /d "%~dp0"

set APK_SRC=app\android\app\build\outputs\apk\debug\app-debug.apk
set APK_DEST=hydropulse.apk

if exist "%APK_SRC%" (
    copy /y "%APK_SRC%" "%APK_DEST%" >nul
    echo.
    echo ========================================================
    echo   SUCCESS: hydropulse.apk successfully built!
    echo   Output: %~dp0%APK_DEST%
    echo ========================================================
    echo.
    
    echo [4/4] Checking for connected Pixel 8 / Android devices via adb...
    for /f "skip=1 tokens=1" %%i in ('"%ANDROID_HOME%\platform-tools\adb.exe" devices') do (
        if not "%%i"=="" (
            echo Found connected device: %%i. Installing APK...
            "%ANDROID_HOME%\platform-tools\adb.exe" install -r "%APK_DEST%"
            echo Done! Launching HydroPulse on device...
            "%ANDROID_HOME%\platform-tools\adb.exe" shell am start -n com.hydropulse.app/.MainActivity
            goto :done
        )
    )
    echo No device currently connected via adb. You can connect your Pixel 8 via USB or Wi-Fi and run:
    echo adb install -r %APK_DEST%
) else (
    echo [ERROR] Could not find built APK at %APK_SRC%
    exit /b 1
)

:done
echo.
pause
