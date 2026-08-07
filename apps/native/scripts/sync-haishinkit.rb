# LEGACY — do not run.
#
# Superseded by modules/visp-srt/with-root-encoder.cjs, which runs automatically
# during `expo prebuild`. This script applied the older remote HaishinKit SPM
# pin (2.2.5) and the Xcode 26 libsrt linker workaround. Kept for reference only.
require "xcodeproj"

project_path = File.expand_path("../ios/VISP.xcodeproj", __dir__)
project = Xcodeproj::Project.open(project_path)
target = project.targets.find { |candidate| candidate.name == "VISP" }
abort "VISP target not found" unless target

repository = "https://github.com/HaishinKit/HaishinKit.swift.git"
package = project.root_object.package_references.find do |reference|
  reference.respond_to?(:repositoryURL) && reference.repositoryURL == repository
end

unless package
  package = project.new(Xcodeproj::Project::Object::XCRemoteSwiftPackageReference)
  package.repositoryURL = repository
  package.requirement = { "kind" => "exactVersion", "version" => "2.2.5" }
  project.root_object.package_references << package
end

%w[HaishinKit SRTHaishinKit].each do |product_name|
  product = target.package_product_dependencies.find do |dependency|
    dependency.product_name == product_name
  end

  unless product
    product = project.new(Xcodeproj::Project::Object::XCSwiftPackageProductDependency)
    product.package = package
    product.product_name = product_name
    target.package_product_dependencies << product
  end

  unless target.frameworks_build_phase.files.any? { |file| file.product_ref == product }
    build_file = project.new(Xcodeproj::Project::Object::PBXBuildFile)
    build_file.product_ref = product
    target.frameworks_build_phase.files << build_file
  end
end

# Xcode 26 does not propagate HaishinKit's transitive static libsrt artifact to
# an application target. Select its SPM-resolved platform slice before linking.
# The artifact URL and checksum remain owned by the pinned HaishinKit package.
# Archive BUILD_DIR lives under ArchiveIntermediates, so use ${BUILD_DIR%Build/*}.
artifact_path = "$(BUILD_DIR)/../../SourcePackages/artifacts/haishinkit.swift/libsrt/libsrt.xcframework"
project.files.select { |file| file.path == artifact_path }.each(&:remove_from_project)

phase = target.shell_script_build_phases.find { |candidate| candidate.name == "[VISP] Select libsrt" }
phase ||= target.new_shell_script_build_phase("[VISP] Select libsrt")
phase.shell_script = <<~'SCRIPT'
  set -eu
  case "${PLATFORM_NAME}" in
    iphoneos) slice="ios-arm64" ;;
    iphonesimulator) slice="ios-arm64_x86_64-simulator" ;;
    *) echo "Unsupported VISP platform: ${PLATFORM_NAME}" >&2; exit 1 ;;
  esac
  artifact_rel="SourcePackages/artifacts/haishinkit.swift/libsrt/libsrt.xcframework"
  candidates="${BUILD_DIR%Build/*}${artifact_rel}
${BUILD_DIR}/../../${artifact_rel}
${BUILD_DIR}/../${artifact_rel}"
  root=""
  for candidate in $candidates; do
    if [ -f "${candidate}/${slice}/libsrt.a" ]; then
      root="$candidate"
      break
    fi
  done
  if [ -z "$root" ]; then
    echo "error: libsrt.a not found for slice ${slice}" >&2
    echo "BUILD_DIR=${BUILD_DIR}" >&2
    echo "Tried:" >&2
    printf '  %s\n' $candidates >&2
    exit 1
  fi
  cp -f "${root}/${slice}/libsrt.a" "${DERIVED_FILE_DIR}/libsrt.a"
SCRIPT
phase.output_paths = ["$(DERIVED_FILE_DIR)/libsrt.a"]
target.build_phases.delete(phase)
target.build_phases.insert(0, phase)

target.build_configurations.each do |configuration|
  configuration.build_settings.delete("OTHER_LDFLAGS[sdk=iphoneos*]")
  configuration.build_settings.delete("OTHER_LDFLAGS[sdk=iphonesimulator*]")
  flags = Array(configuration.build_settings["OTHER_LDFLAGS"])
  flags -= ["-force_load", "$(DERIVED_FILE_DIR)/libsrt.a", "-Wl,-force_load,$(DERIVED_FILE_DIR)/libsrt.a"]
  configuration.build_settings["OTHER_LDFLAGS"] = flags + ["-Wl,-force_load,$(DERIVED_FILE_DIR)/libsrt.a"]
  configuration.build_settings["EXCLUDED_ARCHS[sdk=iphonesimulator*]"] = "x86_64"
end

project.save
