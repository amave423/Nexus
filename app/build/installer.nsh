; Up to 0.5.1 the app was installed per-user into LOCALAPPDATA while 0.4.0
; stayed in Program Files, so an update never replaced what the shortcut ran.
; Remove that stale per-user copy and its shortcuts; from now on the app is
; installed machine-wide and every update lands in the same folder.
!macro customInstall
  ${if} ${FileExists} "$LOCALAPPDATA\Programs\Nexus\Nexus.exe"
    RMDir /r "$LOCALAPPDATA\Programs\Nexus"
  ${endif}
  SetShellVarContext current
  Delete "$DESKTOP\Nexus.lnk"
  Delete "$SMPROGRAMS\Nexus.lnk"
  SetShellVarContext all
!macroend
