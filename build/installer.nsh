# Custom NSIS logic included by electron-builder (nsis.include in
# electron-builder.yml).
#
# customRemoveFiles replaces the default uninstall behaviour, which is a
# blunt `RMDir /r $INSTDIR`. That default destroys ANY file inside the
# install folder — including a user's game data if they pointed the
# launcher's data folder there. During an update the old uninstaller runs
# silently, so the data vanished without warning.
#
# On update we instead delete only the files the app itself ships (Electron
# runtime files at the root, plus the locales/ and resources/ trees) and
# leave everything unknown alone. A trailing non-recursive RMDir removes the
# folder only when nothing user-owned remains. On a real uninstall the
# default full wipe is kept — the user asked for the app to go away.
#
# Note: this only lands in uninstallers shipped from this version onward.
# Updates FROM older versions still run the old wiping uninstaller; the
# in-app guards (installDirGuard.ts) cover that window.
!macro customRemoveFiles
  ${if} ${isUpdated}
    Delete "$INSTDIR\*.exe"
    Delete "$INSTDIR\*.dll"
    Delete "$INSTDIR\*.pak"
    Delete "$INSTDIR\*.bin"
    Delete "$INSTDIR\*.dat"
    Delete "$INSTDIR\*.json"
    Delete "$INSTDIR\*.html"
    Delete "$INSTDIR\*.txt"
    RMDir /r "$INSTDIR\locales"
    RMDir /r "$INSTDIR\resources"
    RMDir "$INSTDIR"
  ${else}
    RMDir /r $INSTDIR
  ${endif}
!macroend
