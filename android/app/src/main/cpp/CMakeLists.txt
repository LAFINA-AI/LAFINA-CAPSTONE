cmake_minimum_required(VERSION 3.22.1)
project(appmodules LANGUAGES C CXX)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
# Bound Ninja as well as Gradle: one native compile/link at a time on shared hosts.
set_property(GLOBAL PROPERTY JOB_POOLS capstone_compile=1 capstone_link=1)
set(CMAKE_JOB_POOL_COMPILE capstone_compile)
set(CMAKE_JOB_POOL_LINK capstone_link)

# Preserve React Native's generated/autolinked application targets.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# A pinned CPU-only dependency selection; never fetch source/models at build/runtime.
# Static linkage and hidden archive symbols keep this private to its JNI library.
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
set(GGML_BACKEND_DL OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_CPU_REPACK OFF CACHE BOOL "" FORCE)
set(GGML_CPU_KLEIDIAI OFF CACHE BOOL "" FORCE)
set(GGML_CPU_ALL_VARIANTS OFF CACHE BOOL "" FORCE)
set(GGML_CPU_ARM_ARCH "armv8-a" CACHE STRING "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(GGML_BLAS OFF CACHE BOOL "" FORCE)
set(GGML_ACCELERATE OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(GGML_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(GGML_ALL_WARNINGS OFF CACHE BOOL "" FORCE)
foreach(feature SSE42 AVX AVX2 AVX_VNNI BMI2 FMA F16C AVX512 AMX_TILE AMX_INT8 AMX_BF16)
  set(GGML_${feature} OFF CACHE BOOL "" FORCE)
endforeach()
foreach(backend CANN CUDA ET HIP METAL MUSA RPC VirtGPU SYCL Vulkan WebGPU zDNN OpenCL Hexagon ZenDNN OPENVINO)
  string(TOUPPER "${backend}" backend_upper)
  set(GGML_${backend_upper} OFF CACHE BOOL "" FORCE)
endforeach()
# Do not mislabel vendored upstream as the enclosing capstone Git commit.
set(GIT_EXE FALSE)
set(GGML_BUILD_COMMIT "whisper-d1be6fd")

# Match optimized kernels in dataQa/release, retaining debug symbols. This setting
# is not a measured speedup claim; performance evidence names each build cohort.
add_compile_options($<$<CONFIG:Debug>:-O3>)
add_subdirectory(third_party/whisper.cpp/ggml ggml-build)
find_package(Threads REQUIRED)
add_library(capstone_whisper_core STATIC
  third_party/whisper.cpp/src/whisper.cpp
  third_party/whisper.cpp/src/aneforge/whisper-aneforge.cpp)
target_include_directories(capstone_whisper_core PUBLIC third_party/whisper.cpp/include)
target_include_directories(capstone_whisper_core PRIVATE third_party/whisper.cpp/src)
target_compile_definitions(capstone_whisper_core PRIVATE WHISPER_VERSION="1.9.5-capstone-cpu")
target_link_libraries(capstone_whisper_core PUBLIC ggml Threads::Threads)

# Keep this outside the root *.cpp glob used by ReactNative-application.cmake.
# Otherwise RN treats the speech JNI file as an app OnLoad override.
add_library(capstone_whisper SHARED jni/whisper_jni.cpp)
target_link_libraries(capstone_whisper PRIVATE capstone_whisper_core)
target_link_options(capstone_whisper PRIVATE "-Wl,--exclude-libs,ALL" "-Wl,-z,max-page-size=16384")
