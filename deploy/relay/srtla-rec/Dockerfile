FROM alpine:3.23 AS build

# Pinned by commit: the commit hash is the integrity check, so there is no
# tarball checksum to keep in sync. srtla_rec is a plain UDP proxy and needs
# neither libsrt nor mbedTLS.
ARG SRTLA_COMMIT=37862da3d0c13b46956efd3f88877053293d97d6
# `make` also builds srtla_send, which the final image drops but srtla-rec.test.sh
# uses as its sender — a real one, from the same pinned source as the receiver.
RUN apk add --no-cache build-base git \
 && git clone https://github.com/BELABOX/srtla.git /src \
 && git -C /src checkout "${SRTLA_COMMIT}" \
 && make -C /src

FROM alpine:3.23
COPY --from=build /src/srtla_rec /usr/local/bin/srtla_rec
COPY --from=build /src/LICENSE /usr/local/share/licenses/srtla/LICENSE
EXPOSE 5000/udp
# Listen for srtla senders, forward the reassembled SRT session to MediaMTX.
ENTRYPOINT ["/usr/local/bin/srtla_rec"]
CMD ["5000", "127.0.0.1", "8890"]
