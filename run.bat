@echo off
setlocal

REM 内网聊天室 - Windows 启动脚本（需要已安装 Node.js 18+）
REM 第一次运行请先执行：npm install

cd /d %~dp0

if exist .env (
  echo Using .env
) else (
  echo Tip: you can copy .env.example to .env and edit it.
)

node server.js
