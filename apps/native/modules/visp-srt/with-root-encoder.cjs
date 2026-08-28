const {
	withProjectBuildGradle,
	withXcodeProject,
} = require("expo/config-plugins");

const dependency = "com.github.pedroSG94.RootEncoder:library:2.7.5";
const haishinKit = {
	name: "VISPHaishinKit",
	path: "../modules/visp-srt/vendor/haishinkit",
	products: ["HaishinKit", "SRTHaishinKit"],
	upstreamUrl: "https://github.com/HaishinKit/HaishinKit.swift.git",
};
const libsrtPhaseName = "[VISP] Select libsrt";
const block = `
// Expo inline Kotlin sources compile in the :expo project.
project(":expo") {
  afterEvaluate {
    dependencies.add("implementation", "${dependency}")
    dependencies.add("implementation", "com.squareup.okhttp3:okhttp:4.12.0")
    def vispSrtModuleDir = rootProject.file("../modules/visp-srt")
    android {
      sourceSets.main.jniLibs.srcDirs += file("$vispSrtModuleDir/vendor/android/jniLibs")
      defaultConfig {
        ndk {
          abiFilters "arm64-v8a", "armeabi-v7a", "x86_64"
        }
        externalNativeBuild {
          cmake {
            arguments "-DVISP_SRT_VENDOR_DIR=$vispSrtModuleDir/vendor", "-DANDROID_SUPPORT_FLEXIBLE_PAGE_SIZES=ON"
          }
        }
      }
      externalNativeBuild {
        cmake {
          path file("$vispSrtModuleDir/jni/CMakeLists.txt")
        }
      }
    }
  }
}

// RootEncoder 2.7.5 publishes Kotlin 2.3 metadata while Expo SDK 57 uses 2.1.
// Keep Expo's supported toolchain and relax only the affected compile boundaries.
gradle.projectsEvaluated {
  [project(":app"), project(":expo")].each { target ->
    target.tasks.matching {
      it.name.startsWith("compile") && it.name.endsWith("Kotlin")
    }.configureEach {
      compilerOptions.freeCompilerArgs.add("-Xskip-metadata-version-check")
    }
  }
}
`;

function addReference(list, value, comment) {
	if (!list.some((item) => item.value === value)) {
		list.push({ value, comment });
	}
}

function addHaishinKit(project) {
	const objects = project.hash.project.objects;
	const { firstProject } = project.getFirstProject();
	const { uuid: targetId, firstTarget: target } = project.getFirstTarget();
	const packageComment = `XCLocalSwiftPackageReference "${haishinKit.name}"`;
	objects.XCLocalSwiftPackageReference ??= {};
	objects.XCRemoteSwiftPackageReference ??= {};
	const localPackages = objects.XCLocalSwiftPackageReference;
	const remotePackages = objects.XCRemoteSwiftPackageReference;
	let packageId = Object.entries(localPackages).find(
		([key, value]) =>
			!key.endsWith("_comment") && value.relativePath === haishinKit.path,
	)?.[0];

	if (!packageId) {
		packageId =
			Object.entries(remotePackages).find(
				([key, value]) =>
					!key.endsWith("_comment") &&
					value.repositoryURL?.includes(haishinKit.upstreamUrl),
			)?.[0] ?? project.generateUuid();
		delete remotePackages[packageId];
		delete remotePackages[`${packageId}_comment`];
		localPackages[packageId] = {
			isa: "XCLocalSwiftPackageReference",
			relativePath: haishinKit.path,
		};
		localPackages[`${packageId}_comment`] = packageComment;
	}

	firstProject.packageReferences ??= [];
	addReference(firstProject.packageReferences, packageId, packageComment);
	target.packageProductDependencies ??= [];

	objects.XCSwiftPackageProductDependency ??= {};
	const products = objects.XCSwiftPackageProductDependency;
	const buildFiles = objects.PBXBuildFile;
	const frameworks = project.pbxFrameworksBuildPhaseObj(targetId);
	for (const productName of haishinKit.products) {
		let productId = Object.entries(products).find(
			([key, value]) =>
				!key.endsWith("_comment") &&
				value.package === packageId &&
				value.productName === productName,
		)?.[0];
		if (!productId) {
			productId = project.generateUuid();
			products[productId] = {
				isa: "XCSwiftPackageProductDependency",
				package: packageId,
				package_comment: packageComment,
				productName,
			};
			products[`${productId}_comment`] = productName;
		}
		addReference(target.packageProductDependencies, productId, productName);

		let buildFileId = Object.entries(buildFiles).find(
			([key, value]) =>
				!key.endsWith("_comment") && value.productRef === productId,
		)?.[0];
		if (!buildFileId) {
			buildFileId = project.generateUuid();
			buildFiles[buildFileId] = {
				isa: "PBXBuildFile",
				productRef: productId,
				productRef_comment: productName,
			};
			buildFiles[`${buildFileId}_comment`] = `${productName} in Frameworks`;
		}
		addReference(frameworks.files, buildFileId, `${productName} in Frameworks`);
	}

	const phaseRef = target.buildPhases.find(
		(phase) => phase.comment === libsrtPhaseName,
	);
	if (phaseRef) {
		target.buildPhases = target.buildPhases.filter(
			(phase) => phase !== phaseRef,
		);
		delete objects.PBXShellScriptBuildPhase[phaseRef.value];
		delete objects.PBXShellScriptBuildPhase[`${phaseRef.value}_comment`];
	}

	const configList = objects.XCConfigurationList[target.buildConfigurationList];
	for (const { value } of configList.buildConfigurations) {
		const settings = objects.XCBuildConfiguration[value].buildSettings;
		settings['"EXCLUDED_ARCHS[sdk=iphonesimulator*]"'] = "x86_64";
		if (Array.isArray(settings.OTHER_LDFLAGS)) {
			settings.OTHER_LDFLAGS = settings.OTHER_LDFLAGS.filter(
				(flag) => !String(flag).includes("DERIVED_FILE_DIR)/libsrt.a"),
			);
		}
		delete settings.SWIFT_INCLUDE_PATHS;
	}

	return project;
}

module.exports = function withVispSrt(config) {
	const androidConfig = withProjectBuildGradle(config, (androidConfig) => {
		if (!androidConfig.modResults.contents.includes(dependency)) {
			androidConfig.modResults.contents += block;
		}
		return androidConfig;
	});
	return withXcodeProject(androidConfig, (iosConfig) => {
		iosConfig.modResults = addHaishinKit(iosConfig.modResults);
		return iosConfig;
	});
};
