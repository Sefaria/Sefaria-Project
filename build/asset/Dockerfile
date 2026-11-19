# Take an upstream docker image as an argument
# build the static directory there

# SRC_IMG will be the `web` container, with the assets collected in /app/static-collected
ARG SRC_IMG

FROM ${SRC_IMG} AS static_source

# Official nginx image. nginx-opentracing was dropped: its newest tag (nginx-1.31.8) predates the
# nginx 1.31.9 security fixes, and the chart loads the opentracing module only with
# instrumentation.enabled, which is false in every env. Re-enabling instrumentation needs a
# module-bearing image again.
FROM nginx:1.31.9
RUN mkdir /app/
COPY --from=static_source /app/static-collected /app/static/
