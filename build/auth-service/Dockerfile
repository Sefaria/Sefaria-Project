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
    CGO_ENABLED=0 go build -ldflags='-s -w' -o /out/authsvc ./cmd/authsvc

FROM gcr.io/distroless/static-debian13:nonroot AS runtime
COPY --from=build /out/authsvc /authsvc
USER 65532:65532
ENTRYPOINT ["/authsvc"]
