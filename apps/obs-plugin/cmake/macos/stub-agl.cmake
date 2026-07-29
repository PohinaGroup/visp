function(visp_configure_stub_agl_dylib output_path arch_list sysroot)
  if(EXISTS "${output_path}")
    return()
  endif()

  set(stub_source "${CMAKE_CURRENT_BINARY_DIR}/agl-stub.c")
  file(WRITE "${stub_source}" "void AGLStub(void) {}\n")

  set(arch_flags "")
  foreach(arch IN LISTS arch_list)
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
  set(framework_dir "${output_dir}/AGL.framework")
  set(binary "${framework_dir}/Versions/A/AGL")
  if(EXISTS "${binary}")
    return()
  endif()

  file(MAKE_DIRECTORY "${framework_dir}/Versions/A")
  set(stub_source "${CMAKE_CURRENT_BINARY_DIR}/agl-stub-link.c")
  file(WRITE "${stub_source}" "void AGLLinkStub(void) {}\n")

  set(arch_flags "")
  foreach(arch IN LISTS arch_list)
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
