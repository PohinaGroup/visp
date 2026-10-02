; Wraps the Package-Windows.ps1 zip contents into a per-machine installer.
; Build: ISCC /DVersion=<x.y.z> /DSourceDir=<dir containing visp-obs\> /O<outdir> installer-windows.iss

#ifndef Version
  #error Pass /DVersion=<x.y.z>
#endif
#ifndef SourceDir
  #error Pass /DSourceDir=<dir containing visp-obs\>
#endif

[Setup]
; Never change AppId: upgrades and uninstall are keyed on it.
AppId={{32ACB5D2-28E6-467F-A325-05076DED7E07}
AppName=VISP Remote Control for OBS
AppVersion={#Version}
AppPublisher=VISP
AppPublisherURL=https://github.com/JoniJuntto/visp
; OBS 30+ loads plugins from here; it survives OBS updates and reinstalls.
DefaultDirName={commonappdata}\obs-studio\plugins\visp-obs
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputBaseFilename=visp-obs-{#Version}-windows-x64
UninstallDisplayName=VISP Remote Control for OBS
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[InstallDelete]
; Clean upgrade: drop files a previous version shipped but this one doesn't.
Type: filesandordirs; Name: "{app}"

[Files]
Source: "{#SourceDir}\visp-obs\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Code]
function ObsDir(): String;
begin
  if not RegQueryStringValue(HKLM64, 'SOFTWARE\OBS Studio', '', Result) then
    Result := ExpandConstant('{commonpf64}\obs-studio');
end;

// A manual copy inside the OBS program folder would load alongside ours.
procedure RemoveLegacyCopy();
var
  Dll: String;
begin
  Dll := ObsDir() + '\obs-plugins\64bit\visp-obs.dll';
  if not FileExists(Dll) then
    exit;
  if SuppressibleMsgBox('An older manually installed copy of the VISP plugin was found in ' + ObsDir() +
      '. OBS would load both. Remove the old copy?', mbConfirmation, MB_YESNO, IDYES) <> IDYES then
    exit;
  DeleteFile(Dll);
  DeleteFile(ObsDir() + '\obs-plugins\64bit\visp-obs.pdb');
  DelTree(ObsDir() + '\data\obs-plugins\visp-obs', True, True, True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    RemoveLegacyCopy();
end;
