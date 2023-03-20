# Take an upstream docker image as an argument
# build the static directory there

# SRC_IMG will be the `web` container, with the assets collected in /app/static-collected
ARG SRC_IMG

FROM ${SRC_IMG} AS static_source

FROM nginx
RUN apt-get update ; apt-get install unzip
ADD https://github.com/open-telemetry/opentelemetry-cpp-contrib/releases/download/webserver%2Fv1.0.0/opentelemetry-webserver-sdk-x64-linux.tgz.zip /opt
RUN cd /opt ; unzip opentelemetry-webserver-sdk-x64-linux.tgz.zip; tar xvfz opentelemetry-webserver-sdk-x64-linux.tgz
RUN cd /opt/opentelemetry-webserver-sdk; ./install.sh
ENV LD_LIBRARY_PATH=$LD_LIBRARY_PATH:/opt/opentelemetry-webserver-sdk/sdk_lib/lib
RUN mkdir /app/
COPY --from=static_source /app/static-collected /app/static/
