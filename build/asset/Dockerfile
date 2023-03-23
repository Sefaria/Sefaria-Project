# Take an upstream docker image as an argument
# build the static directory there

# SRC_IMG will be the `web` container, with the assets collected in /app/static-collected
ARG SRC_IMG

FROM ${SRC_IMG} AS static_source

FROM opentracing/nginx-opentracing:nginx-1.23.3
RUN mkdir /app/
COPY --from=static_source /app/static-collected /app/static/
