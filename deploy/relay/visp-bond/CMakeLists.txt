cmake_minimum_required(VERSION 3.16)
project(visp_bond C)

find_package(Threads REQUIRED)
find_library(SRT_LIBRARY srt REQUIRED)
find_path(SRT_INCLUDE_DIR srt/srt.h REQUIRED)

add_executable(visp-bond visp-bond.c)
target_compile_features(visp-bond PRIVATE c_std_11)
target_compile_options(visp-bond PRIVATE -Wall -Wextra -Werror)
target_include_directories(visp-bond PRIVATE "${SRT_INCLUDE_DIR}")
target_link_libraries(visp-bond PRIVATE "${SRT_LIBRARY}" Threads::Threads)
install(TARGETS visp-bond RUNTIME DESTINATION bin)
