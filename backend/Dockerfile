# Exodus backend image.
#
# Build context MUST be the repository root (not backend/), because the backend
# is a Cargo workspace member and depends on crates/exodus-math by path:
#   docker build -f backend/Dockerfile .
# deploy/docker-compose.yml already sets this up.

# ---- Stage 1: compile the release binary ------------------------------------
FROM rust:1-bookworm AS builder
WORKDIR /app

# The whole workspace is copied because Cargo needs every member's Cargo.toml
# to resolve the workspace, even though only `backend` gets compiled.
# .dockerignore keeps target/, frontend/, .git and .env files out.
COPY . .

# --locked: fail instead of silently changing Cargo.lock on the server.
RUN cargo build --release --locked -p backend

# ---- Stage 2: small runtime image -------------------------------------------
FROM debian:bookworm-slim

# ca-certificates: HTTPS calls to NEAR RPC and the 1Click API.
# libssl3: reqwest uses native TLS (OpenSSL) and links to it at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Run as an unprivileged user so a compromised process cannot act as root.
RUN useradd --system --uid 10001 --no-create-home exodus

COPY --from=builder /app/target/release/backend /usr/local/bin/backend

USER exodus
ENV PORT=3001
EXPOSE 3001
CMD ["backend"]
