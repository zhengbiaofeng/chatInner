@echo off
setlocal

REM 生成 Windows 单文件 exe（绿色运行）
REM 需要：Node.js 20+，并且能联网下载 pkg 依赖

cd /d %~dp0

if not exist node_modules (
  npm install
)

if not exist dist mkdir dist

npx pkg . --targets node18-win-x64 --output dist\intranet-chat.exe

echo.
echo Build done: dist\intranet-chat.exe
echo Run: dist\intranet-chat.exe
