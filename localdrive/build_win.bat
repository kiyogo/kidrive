@echo off
call "C:\Program Files\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 exit /b 1
"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" -S windows -B build\windows\x64 -G "Ninja" -DCMAKE_BUILD_TYPE=Release
if errorlevel 1 exit /b 1
"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe" -C e:\DATA\source\Nas\LocalDrive\localdrive\build\windows\x64 media_kit_libs_windows_video_LIBMPV_EXTRACT media_kit_libs_windows_video_ANGLE_EXTRACT
"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\Ninja\ninja.exe" -C e:\DATA\source\Nas\LocalDrive\localdrive\build\windows\x64
if errorlevel 1 exit /b 1
"C:\Program Files\Microsoft Visual Studio\2022\Community\Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe" --install e:\DATA\source\Nas\LocalDrive\localdrive\build\windows\x64 --config Release
if errorlevel 1 exit /b 1
echo Build and install completed successfully.
