FROM alpine:3.23 AS build

ARG SRT_VERSION=1.5.4
ARG SRT_SHA256=d0a8b600fe1b4eaaf6277530e3cfc8f15b8ce4035f16af4a5eb5d4b123640cdd
RUN apk add --no-cache build-base cmake linux-headers mbedtls-dev openssl-dev
ADD https://github.com/Haivision/srt/archive/refs/tags/v${SRT_VERSION}.tar.gz /tmp/srt.tar.gz
RUN echo "${SRT_SHA256}  /tmp/srt.tar.gz" | sha256sum -c - \
 && mkdir /tmp/srt && tar -xzf /tmp/srt.tar.gz -C /tmp/srt --strip-components=1 \
 && cmake -S /tmp/srt -B /tmp/srt/build \
      -DCMAKE_BUILD_TYPE=Release \
      -DCMAKE_POLICY_VERSION_MINIMUM=3.5 \
      -DCMAKE_INSTALL_PREFIX=/usr/local \
      -DENABLE_APPS=OFF \
      -DENABLE_BONDING=ON \
      -DENABLE_ENCRYPTION=ON \
      -DUSE_ENCLIB=mbedtls \
 && cmake --build /tmp/srt/build --target install --parallel

COPY deploy/relay/visp-bond /src
RUN cmake -S /src -B /src/build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build /src/build --parallel

FROM alpine:3.23
RUN apk add --no-cache libstdc++ mbedtls
COPY --from=build /usr/local/lib/libsrt.so* /usr/local/lib/
COPY --from=build /src/build/visp-bond /usr/local/bin/visp-bond
ENV LD_LIBRARY_PATH=/usr/local/lib
EXPOSE 8891/udp
ENTRYPOINT ["/usr/local/bin/visp-bond"]
