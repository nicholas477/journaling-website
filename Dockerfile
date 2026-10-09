FROM rust:1-bookworm AS builder

WORKDIR /workspace

RUN rustup target add wasm32-unknown-unknown \
    && cargo install wasm-pack --locked

COPY . .

RUN wasm-pack build wasm --target web --out-dir ../server/static/pkg --release \
    && cargo build --release -p server

FROM debian:bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libgcc-s1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/server

COPY --from=builder /workspace/target/release/server /usr/local/bin/server
COPY --from=builder /workspace/server/config.toml ./config.toml
COPY --from=builder /workspace/server/static ./static

RUN mkdir -p ./data

EXPOSE 8100

CMD ["/usr/local/bin/server"]