# syntax=docker/dockerfile:1
# build/auth-service/Dockerfile - multi-stage: only the runtime stage is pushed.
ARG TYPE=build-prod
FROM golang:1.27-alpine AS build
ARG TYPE
WORKDIR /src
COPY auth-service/go.mod auth-service/go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY auth-service/ ./
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go build -ldflags='-s -w' -o /out/authsvc ./cmd/authsvc \
 && CGO_ENABLED=0 go build -ldflags='-s -w' -o /out/keyadmin ./cmd/keyadmin \
 && CGO_ENABLED=0 go build -ldflags='-s -w' -o /out/mintstub ./cmd/mintstub

FROM gcr.io/distroless/static-debian13:nonroot AS runtime
COPY --from=build /out/authsvc /authsvc
COPY --from=build /out/mintstub /mintstub
COPY --from=build /out/keyadmin /keyadmin
COPY auth-service/internal/registry/schema.sql /schema.sql
USER nonroot
ENTRYPOINT ["/authsvc"]
