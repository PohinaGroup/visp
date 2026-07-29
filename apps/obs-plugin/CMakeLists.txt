cmake_minimum_required(VERSION 3.28...3.30)

include("${CMAKE_CURRENT_SOURCE_DIR}/cmake/common/bootstrap.cmake" NO_POLICY_SCOPE)

project(${_name} VERSION ${_version})

option(ENABLE_FRONTEND_API "Use obs-frontend-api for UI functionality" ON)
option(ENABLE_QT "Use Qt functionality" ON)

include(compilerconfig)
include(defaults)
include(helpers)

add_library(${CMAKE_PROJECT_NAME} MODULE)

find_package(libobs REQUIRED)
target_link_libraries(${CMAKE_PROJECT_NAME} PRIVATE OBS::libobs)

if(ENABLE_FRONTEND_API)
  find_package(obs-frontend-api REQUIRED)
  target_link_libraries(${CMAKE_PROJECT_NAME} PRIVATE OBS::obs-frontend-api)
endif()

if(ENABLE_QT)
  find_package(Qt6 COMPONENTS Core Network Widgets REQUIRED)
  target_link_libraries(${CMAKE_PROJECT_NAME} PRIVATE Qt6::Core Qt6::Network Qt6::Widgets)
  if(APPLE)
    include("${CMAKE_CURRENT_SOURCE_DIR}/cmake/macos/stub-agl.cmake")
    set(_visp_stub_root "${CMAKE_CURRENT_BINARY_DIR}/stub-frameworks")
    set(_visp_stub_agl "${CMAKE_CURRENT_BINARY_DIR}/libAGL_stub.dylib")
    if(CMAKE_OSX_ARCHITECTURES)
      set(_visp_stub_archs ${CMAKE_OSX_ARCHITECTURES})
    else()
      set(_visp_stub_archs "${CMAKE_SYSTEM_PROCESSOR}")
    endif()
    visp_configure_stub_agl_framework("${_visp_stub_root}" "${_visp_stub_archs}" "${CMAKE_OSX_SYSROOT}")
    visp_configure_stub_agl_dylib("${_visp_stub_agl}" "${_visp_stub_archs}" "${CMAKE_OSX_SYSROOT}")
    target_link_options(
      ${CMAKE_PROJECT_NAME}
      PRIVATE "-F${_visp_stub_root}" "-Wl,-rpath,@loader_path"
    )
    add_custom_command(
      TARGET ${CMAKE_PROJECT_NAME}
      POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy
              "${CMAKE_CURRENT_SOURCE_DIR}/cmake/macos/bundle-agl-stub.sh"
              "${CMAKE_CURRENT_BINARY_DIR}/bundle-agl-stub.sh"
      COMMAND chmod +x "${CMAKE_CURRENT_BINARY_DIR}/bundle-agl-stub.sh"
      COMMAND "${CMAKE_CURRENT_BINARY_DIR}/bundle-agl-stub.sh"
              "$<TARGET_FILE:${CMAKE_PROJECT_NAME}>" "${_visp_stub_agl}"
      COMMENT "Bundle stub AGL dylib for macOS SDKs without AGL"
      VERBATIM
    )
  endif()
  target_compile_options(
    ${CMAKE_PROJECT_NAME}
    PRIVATE $<$<C_COMPILER_ID:Clang,AppleClang>:-Wno-quoted-include-in-framework-header -Wno-comma>
  )
  set_target_properties(
    ${CMAKE_PROJECT_NAME}
    PROPERTIES AUTOMOC ON AUTOUIC ON AUTORCC ON
  )
endif()

target_sources(${CMAKE_PROJECT_NAME} PRIVATE src/plugin-main.cpp)

include(CTest)
if(BUILD_TESTING)
  add_executable(visp-protocol-test src/plugin-main.cpp)
  target_compile_definitions(visp-protocol-test PRIVATE VISP_PROTOCOL_TEST)
  target_link_libraries(visp-protocol-test PRIVATE Qt6::Core)
  set_target_properties(visp-protocol-test PROPERTIES
    XCODE_ATTRIBUTE_ENABLE_HARDENED_RUNTIME NO)
  get_target_property(_qt_core_include_dirs Qt6::Core INTERFACE_INCLUDE_DIRECTORIES)
  target_include_directories(visp-protocol-test PRIVATE ${_qt_core_include_dirs})
  add_test(NAME visp-protocol COMMAND visp-protocol-test)
  if(WIN32)
    add_custom_command(TARGET visp-protocol-test POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E copy_if_different
        $<TARGET_RUNTIME_DLLS:visp-protocol-test>
        $<TARGET_FILE_DIR:visp-protocol-test>
      COMMAND_EXPAND_LISTS)
  endif()
  if(APPLE)
    list(GET _qt_core_include_dirs 0 _qt_core_headers)
    get_filename_component(_qt_core_framework "${_qt_core_headers}" DIRECTORY)
    get_filename_component(_qt_framework_dir "${_qt_core_framework}" DIRECTORY)
    target_link_options(visp-protocol-test PRIVATE "-Wl,-rpath,${_qt_framework_dir}")
  endif()
endif()

set_target_properties_plugin(${CMAKE_PROJECT_NAME} PROPERTIES OUTPUT_NAME ${_name})
