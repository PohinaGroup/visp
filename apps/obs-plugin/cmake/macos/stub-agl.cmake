function(visp_normalize_osx_architectures arch_list output_var)
  set(normalized "")
  foreach(entry IN LISTS arch_list)
    string(REPLACE ";" " " entry "${entry}")
    separate_arguments(entry NATIVE_COMMAND "${entry}")
    list(APPEND normalized ${entry})
  endforeach()
  list(REMOVE_DUPLICATES normalized)
  set(${output_var} "${normalized}" PARENT_SCOPE)
endfunction()

function(visp_stub_matches_architectures binary arch_list result_var)
  set(${result_var} FALSE PARENT_SCOPE)
  if(NOT EXISTS "${binary}")
    return()
  endif()

  execute_process(
    COMMAND lipo -info "${binary}"
    OUTPUT_VARIABLE lipo_out
    ERROR_VARIABLE lipo_err
    RESULT_VARIABLE lipo_result
  )
  if(NOT lipo_result EQUAL 0)
    return()
  endif()

  foreach(arch IN LISTS arch_list)
    if(NOT "${lipo_out}" MATCHES "${arch}")
      return()
    endif()
  endforeach()

  set(${result_var} TRUE PARENT_SCOPE)
endfunction()

function(visp_configure_stub_agl_dylib output_path arch_list sysroot)
  visp_normalize_osx_architectures("${arch_list}" normalized_archs)
  visp_stub_matches_architectures("${output_path}" "${normalized_archs}" matches)
  if(matches)
    return()
  endif()

  get_filename_component(output_dir "${output_path}" DIRECTORY)
  file(MAKE_DIRECTORY "${output_dir}")
  file(REMOVE "${output_path}")

  set(stub_source "${CMAKE_CURRENT_BINARY_DIR}/agl-stub.c")
  file(WRITE "${stub_source}" "void AGLStub(void) {}\n")

  set(arch_flags "")
  foreach(arch IN LISTS normalized_archs)
    list(APPEND arch_flags -arch "${arch}")
  endforeach()

  set(sysroot_flag "")
  if(sysroot)
    set(sysroot_flag -isysroot "${sysroot}")
  endif()

  execute_process(
    COMMAND
      clang -dynamiclib "${stub_source}" -o "${output_path}" -install_name
      @loader_path/libAGL_stub.dylib -current_version 1.0 -compatibility_version 1.0
      ${arch_flags} ${sysroot_flag}
    RESULT_VARIABLE _agl_stub_result
    ERROR_VARIABLE _agl_stub_error
  )
  if(NOT _agl_stub_result EQUAL 0)
    message(FATAL_ERROR "Failed to build stub AGL dylib: ${_agl_stub_error}")
  endif()
endfunction()

function(visp_configure_stub_agl_framework output_dir arch_list sysroot)
  visp_normalize_osx_architectures("${arch_list}" normalized_archs)

  set(framework_dir "${output_dir}/AGL.framework")
  set(binary "${framework_dir}/Versions/A/AGL")
  visp_stub_matches_architectures("${binary}" "${normalized_archs}" matches)
  if(matches)
    return()
  endif()

  file(REMOVE_RECURSE "${framework_dir}")
  file(MAKE_DIRECTORY "${framework_dir}/Versions/A")

  set(stub_source "${CMAKE_CURRENT_BINARY_DIR}/agl-stub-link.c")
  file(WRITE "${stub_source}" "void AGLLinkStub(void) {}\n")

  set(arch_flags "")
  foreach(arch IN LISTS normalized_archs)
    list(APPEND arch_flags -arch "${arch}")
  endforeach()

  set(sysroot_flag "")
  if(sysroot)
    set(sysroot_flag -isysroot "${sysroot}")
  endif()

  execute_process(
    COMMAND
      clang -dynamiclib "${stub_source}" -o "${binary}" -install_name
      @rpath/AGL.framework/Versions/A/AGL -current_version 1.0 -compatibility_version 1.0
      ${arch_flags} ${sysroot_flag}
    RESULT_VARIABLE _agl_link_result
    ERROR_VARIABLE _agl_link_error
  )
  if(NOT _agl_link_result EQUAL 0)
    message(FATAL_ERROR "Failed to build link-time AGL.framework: ${_agl_link_error}")
  endif()

  file(CREATE_LINK "Versions/Current/AGL" "${framework_dir}/AGL" SYMBOLIC)
  file(CREATE_LINK "A" "${framework_dir}/Versions/Current" SYMBOLIC)
endfunction()
