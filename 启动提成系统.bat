@echo off
chcp 65001 >nul
title 提成系统服务
cd /d "%~dp0"

echo ==========================================
echo   提成管理系统 - 一键启动
echo   http://localhost:3001
echo   局域网访问: http://192.168.1.117:3001
echo   关闭本窗口即停止服务
echo ==========================================
echo.

REM 检查 3001 端口是否被占用
netstat -ano | findstr ":3001" | findstr "LISTENING" >nul
if %errorlevel%==0 (
  echo [提示] 3001 端口已被占用，服务可能已在运行。
  echo 直接打开浏览器访问 http://localhost:3001 即可。
  echo 如需重启：先关闭已运行的服务再执行本脚本。
  pause
  exit /b
)

cd server
npx tsx src/index.ts
pause
