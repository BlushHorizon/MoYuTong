;=====================================================
;  QQ 网页版 · 安装程序 (NSIS Unicode)
;  编译: makensis.exe setup.nsi   (在项目根目录执行)
;  默认安装到 D:\QQ网页版，附 开启.bat / 关闭.bat
;=====================================================
Unicode true
SetCompressor /SOLID lzma

!include "MUI2.nsh"
!include "LogicLib.nsh"

!define APPNAME "摸鱼瞳 MoYuTong"
!define REGKEY "Software\MoYuTong"
!define UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\MoYuTong"

Name "${APPNAME}"
OutFile "H:\安装包\摸鱼瞳MoYuTong安装包.exe"
InstallDir "D:\摸鱼瞳"
InstallDirRegKey HKCU "${REGKEY}" "InstallDir"
RequestExecutionLevel user
Icon "dist\assets\icon.ico"
!define MUI_ICON "dist\assets\icon.ico"
!define MUI_UNICON "dist\assets\icon.ico"

VIProductVersion "1.0.0.0"
VIAddVersionKey /LANG=0 "ProductName" "${APPNAME}"
VIAddVersionKey /LANG=0 "FileDescription" "摸鱼瞳 MoYuTong 安装程序"
VIAddVersionKey /LANG=0 "FileVersion" "1.0.0.0"
VIAddVersionKey /LANG=0 "CompanyName" "QQ WebChat"

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!define MUI_FINISHPAGE_RUN "$INSTDIR\开启.bat"
!define MUI_FINISHPAGE_RUN_TEXT "启动 摸鱼瞳（打开服务和网页）"
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"

Section "主程序" SecMain
  SetOutPath "$INSTDIR"

  ; ---------- Node.js 检测 ----------
  nsExec::ExecToStack 'cmd /c node -v'
  Pop $0
  Pop $1
  StrCmp $0 "0" nodeOk 0
  MessageBox MB_ICONEXCLAMATION|MB_YESNO \
    "未检测到 Node.js（本程序需要 Node.js 18+ 才能运行）。$\r$\n建议先到 https://nodejs.org 安装 LTS 版，再安装本程序。$\r$\n仍要继续安装吗？" \
    IDYES nodeOk
  Abort
  nodeOk:

  ; ---------- 保护用户数据：重装不覆盖聊天记录 / 配置 / DeepSeek 登录态 ----------
  StrCpy $R9 "0"
  IfFileExists "$INSTDIR\data\store.json" 0 noData
    RMDir /r "$INSTDIR\data_preserve"
    Rename "$INSTDIR\data" "$INSTDIR\data_preserve"
    StrCpy $R9 "1"
  noData:
  StrCpy $R8 "0"
  IfFileExists "$INSTDIR\config.json" 0 noCfg
    CopyFiles /SILENT "$INSTDIR\config.json" "$TEMP"
    StrCpy $R8 "1"
  noCfg:

  ; ---------- 复制程序文件 ----------
  ; 两行都写：覆盖带扩展名 / 无扩展名文件（Cookies、Local State 等）
  File /r "dist\*"
  File /r "dist\*.*"
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; ---------- 还原用户数据（包内 data 只是全新安装的种子） ----------
  StrCmp $R9 "0" keepSeed
    RMDir /r "$INSTDIR\data"
    Rename "$INSTDIR\data_preserve" "$INSTDIR\data"
  keepSeed:
  StrCmp $R8 "0" keepCfg
    CopyFiles /SILENT "$TEMP\config.json" "$INSTDIR"
    Delete "$TEMP\config.json"
  keepCfg:

  ; ---------- 注册表 ----------
  WriteRegStr HKCU "${REGKEY}" "InstallDir" "$INSTDIR"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayIcon" "$INSTDIR\assets\icon.ico"
  WriteRegStr HKCU "${UNINSTKEY}" "Publisher" "MoYuTong"
  WriteRegStr HKCU "${UNINSTKEY}" "DisplayVersion" "1.0.0.0"
  WriteRegStr HKCU "${UNINSTKEY}" "UninstallString" '"$INSTDIR\uninstall.exe"'
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${UNINSTKEY}" "NoRepair" 1

  ; ---------- 快捷方式 ----------
  ; 桌面：直接给 .bat 快捷方式（开启 / 关闭），双击即用
  CreateShortCut "$DESKTOP\摸鱼瞳-开启.lnk" "$INSTDIR\开启.bat" "" "$INSTDIR\assets\icon.ico" 0
  CreateShortCut "$DESKTOP\摸鱼瞳-关闭.lnk" "$INSTDIR\关闭.bat" "" "$INSTDIR\assets\icon.ico" 0

  ; 开始菜单
  CreateDirectory "$SMPROGRAMS\${APPNAME}"
  CreateShortCut "$SMPROGRAMS\${APPNAME}\开启 ${APPNAME}.lnk" "$INSTDIR\开启.bat" "" "$INSTDIR\assets\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\${APPNAME}\关闭 ${APPNAME}.lnk" "$INSTDIR\关闭.bat" "" "$INSTDIR\assets\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\${APPNAME}\卸载 ${APPNAME}.lnk" "$INSTDIR\uninstall.exe" "" \
    "$INSTDIR\assets\icon.ico" 0
SectionEnd

Section "Uninstall"
  ; 停掉正在跑的服务
  ExecWait 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\launcher.ps1" -Stop' $0

  Delete "$DESKTOP\${APPNAME}.lnk"   ; 旧版应用快捷方式
  Delete "$DESKTOP\摸鱼瞳-开启.lnk"
  Delete "$DESKTOP\摸鱼瞳-关闭.lnk"
  RMDir /r "$SMPROGRAMS\${APPNAME}"

  SetOutPath "$TEMP"
  RMDir /r "$INSTDIR"

  DeleteRegKey HKCU "${UNINSTKEY}"
  DeleteRegKey HKCU "${REGKEY}"
SectionEnd
