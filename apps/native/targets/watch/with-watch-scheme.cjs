const fs = require("node:fs");
const path = require("node:path");
const {
	withXcodeProjectBeta,
} = require("@bacons/apple-targets/build/with-bacons-xcode");

const TARGET_NAME = "VISP Watch";

function findWatchTarget(project) {
	return project.rootObject.props.targets.find((target) => {
		const name = target.props?.name;
		const productName = target.props?.productName;
		return (
			name === TARGET_NAME ||
			productName === "VISPWatch" ||
			(typeof target.isWatchOSTarget === "function" &&
				target.isWatchOSTarget())
		);
	});
}

function buildScheme({ projectName, targetId, targetName }) {
	const buildable = `${targetName}.app`;
	return `<?xml version="1.0" encoding="UTF-8"?>
<Scheme
   LastUpgradeVersion = "1600"
   version = "1.7">
   <BuildAction
      parallelizeBuildables = "YES"
      buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry
            buildForTesting = "YES"
            buildForRunning = "YES"
            buildForProfiling = "YES"
            buildForArchiving = "YES"
            buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "${targetId}"
               BuildableName = "${buildable}"
               BlueprintName = "${targetName}"
               ReferencedContainer = "container:${projectName}.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction
      buildConfiguration = "Debug"
      selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB"
      selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB"
      launchStyle = "0"
      useCustomWorkingDirectory = "NO"
      ignoresPersistentStateOnLaunch = "NO"
      debugDocumentVersioning = "YES"
      debugServiceExtension = "internal"
      allowLocationSimulation = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${targetId}"
            BuildableName = "${buildable}"
            BlueprintName = "${targetName}"
            ReferencedContainer = "container:${projectName}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction
      buildConfiguration = "Release"
      shouldUseLaunchSchemeArgsEnv = "YES"
      savedToolIdentifier = ""
      useCustomWorkingDirectory = "NO"
      debugDocumentVersioning = "YES">
      <BuildableProductRunnable
         runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "${targetId}"
            BuildableName = "${buildable}"
            BlueprintName = "${targetName}"
            ReferencedContainer = "container:${projectName}.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction
      buildConfiguration = "Debug">
   </AnalyzeAction>
   <ArchiveAction
      buildConfiguration = "Release"
      revealArchiveInOrganizer = "YES">
   </ArchiveAction>
</Scheme>
`;
}

/**
 * Writes a shared Xcode scheme for the Watch target.
 * Must be listed in app.json *before* `@bacons/apple-targets` so this mod runs
 * after the Watch target has been added to the in-memory project.
 */
module.exports = function withWatchScheme(config) {
	return withXcodeProjectBeta(config, (config) => {
		const target = findWatchTarget(config.modResults);
		if (!target) {
			throw new Error(
				`[with-watch-scheme] Native target "${TARGET_NAME}" was not found. List this plugin before @bacons/apple-targets in app.json.`,
			);
		}

		const projectName =
			config.modRequest.projectName ??
			path.basename(config.modRequest.platformProjectRoot);
		const schemesDir = path.join(
			config.modRequest.platformProjectRoot,
			`${projectName}.xcodeproj`,
			"xcshareddata",
			"xcschemes",
		);
		fs.mkdirSync(schemesDir, { recursive: true });
		fs.writeFileSync(
			path.join(schemesDir, `${TARGET_NAME}.xcscheme`),
			buildScheme({
				projectName,
				targetId: target.uuid,
				targetName: target.props.name || TARGET_NAME,
			}),
		);
		return config;
	});
};
