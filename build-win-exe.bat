@echo off
chcp 65001 >nul
setlocal

REM =======================================================
REM 内网聊天室打包工具 (Offline-Ready)
REM =======================================================

cd /d %~dp0

REM 指定本地 PKG 缓存目录，避免去系统 C 盘或者外网拉取
set PKG_CACHE_PATH=%~dp0.pkg-cache

REM 简单检测是否在外网环境
ping -n 1 8.8.8.8 >nul 2>nul
if %errorlevel% equ 0 (
  set HAS_INTERNET=1
) else (
  set HAS_INTERNET=0
)

if not exist node_modules (
  if %HAS_INTERNET% equ 1 (
    echo [提示] 未找到 node_modules，检测到网络，正在自动执行 npm install...
    call npm install
  ) else (
    echo [错误] 未找到 node_modules 目录！
    echo 这是一个内网离线环境，请先在有网的机器上执行 npm install，
    echo 然后将整个项目（包含 node_modules 目录）拷贝到内网机器，再运行本脚本。
    pause
    exit /b 1
  )
)

if not exist dist mkdir dist

echo [提示] 正在使用 pkg 打包为独立 exe 文件...
if %HAS_INTERNET% equ 0 (
  echo -------------------------------------------------------
  echo [警告] 当前为无网环境，pkg 将尝试使用本地缓存打包。
  echo 如果接下来报错找不到 "fetched-v18.5.0-win-x64"：
  echo 请在有网电脑上下载:
  echo https://github.com/vercel/pkg-fetch/releases/download/v3.4/uploaded-v2.6-node-v18.5.0-win-x64
  echo 将其重命名为 "fetched-v18.5.0-win-x64"，放入本项目的 ".pkg-cache\v3.4\" 文件夹下，然后重试。
  echo -------------------------------------------------------
)

call npx pkg . --targets node18-win-x64 --output dist\intranet-chat.exe

if %errorlevel% neq 0 (
  echo.
  echo [错误] 打包失败！请查看上面的错误信息。
  pause
  exit /b 1
)

echo.
echo =======================================================
echo 打包成功！
echo 输出文件: dist\intranet-chat.exe
echo 直接双击该 exe 即可运行服务端，同目录下会自动生成 data 文件夹。
echo =======================================================
pause
