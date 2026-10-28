; Instalador de Esquema para Windows (por usuario, sin permisos de administrador).
; Lo arma herramientas/instalador-windows.sh con makensis (corre en Linux/Mac, sin Wine).
; Con /S instala en silencio y abre Esquema al terminar (lo usan instalar.ps1 y el actualizador de la app).
Unicode true
SetCompressor /SOLID lzma
RequestExecutionLevel user
!include "MUI2.nsh"

Name "Esquema"
OutFile "${SALIDA}"
InstallDir "$LOCALAPPDATA\Programs\Esquema"
BrandingText "Esquema ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey /LANG=0 "ProductName" "Esquema"
VIAddVersionKey /LANG=0 "FileDescription" "Instalador de Esquema"
VIAddVersionKey /LANG=0 "FileVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "ProductVersion" "${VERSION}"
VIAddVersionKey /LANG=0 "LegalCopyright" "AGPL-3.0"

!define MUI_ICON "${ICONO}"
!define MUI_UNICON "${ICONO}"
!define MUI_FINISHPAGE_RUN "$INSTDIR\Esquema.exe"
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "Spanish"
!insertmacro MUI_LANGUAGE "English"

!define DESINSTALAR "Software\Microsoft\Windows\CurrentVersion\Uninstall\Esquema"

Section "Esquema"
  ; Si está abierta (p. ej. al actualizar) se le pide cerrar (guarda lo pendiente) y, si no alcanza, se cierra para poder
  ; reemplazar sus archivos.
  nsExec::Exec 'taskkill /IM Esquema.exe'
  Sleep 2500
  nsExec::Exec 'taskkill /IM Esquema.exe /F'
  Sleep 500
  RMDir /r "$INSTDIR"
  SetOutPath "$INSTDIR"
  File /r "${ORIGEN}\*.*"
  WriteUninstaller "$INSTDIR\Desinstalar Esquema.exe"
  CreateShortcut "$SMPROGRAMS\Esquema.lnk" "$INSTDIR\Esquema.exe"
  CreateShortcut "$DESKTOP\Esquema.lnk" "$INSTDIR\Esquema.exe"
  WriteRegStr HKCU "${DESINSTALAR}" "DisplayName" "Esquema"
  WriteRegStr HKCU "${DESINSTALAR}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${DESINSTALAR}" "Publisher" "Esquema (open source)"
  WriteRegStr HKCU "${DESINSTALAR}" "DisplayIcon" "$INSTDIR\Esquema.exe"
  WriteRegStr HKCU "${DESINSTALAR}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${DESINSTALAR}" "UninstallString" '"$INSTDIR\Desinstalar Esquema.exe"'
  WriteRegStr HKCU "${DESINSTALAR}" "QuietUninstallString" '"$INSTDIR\Desinstalar Esquema.exe" /S'
  WriteRegStr HKCU "${DESINSTALAR}" "URLInfoAbout" "https://esquema-app.github.io/esquema/"
  WriteRegDWORD HKCU "${DESINSTALAR}" "NoModify" 1
  WriteRegDWORD HKCU "${DESINSTALAR}" "NoRepair" 1
  IfSilent 0 +2
    Exec '"$INSTDIR\Esquema.exe"'
SectionEnd

; Desinstalar quita la app; tus documentos (en tu carpeta) no se tocan.
Section "Uninstall"
  nsExec::Exec 'taskkill /IM Esquema.exe /F'
  Sleep 800
  Delete "$SMPROGRAMS\Esquema.lnk"
  Delete "$DESKTOP\Esquema.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${DESINSTALAR}"
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "app.esquema.escritorio"
SectionEnd
