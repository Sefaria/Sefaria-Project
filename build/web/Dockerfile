# Developer portal frontend (devportal-ui/), built in its own stage with a pinned Node
# so it does not depend on the Node that base-web gets from Debian. Always a
# production build, whatever TYPE the main webpack build below uses.
FROM node:22-bookworm-slim AS devportal-ui
WORKDIR /src/devportal-ui
COPY devportal-ui/package.json devportal-ui/package-lock.json ./
RUN npm ci
COPY devportal-ui/ ./
COPY docs/openAPI.json /src/docs/openAPI.json
RUN npm run build

FROM us-east1-docker.pkg.dev/production-deployment/containers/base-web:3.12-slim-bookworm
ARG TYPE=build-prod

WORKDIR /app/
# Copied separately to allow for caching of the `pip install` build step
COPY requirements.txt /app/requirements.txt
RUN pip install --trusted-host pypi.python.org -r requirements.txt

#ARG DD_CUSTOM_BIN=https://dd-trace-py-builds.s3.amazonaws.com/118305716/install-manylinux2014_x86_64.sh
## temp debugging binary for datadog investigation
#RUN curl $DD_CUSTOM_BIN | bash
#ENV DD_PROFILING_TAGS=custom_binary_url:$DD_CUSTOM_BIN

COPY package*.json /app/
RUN npm install --unsafe-perm

COPY ./node /app/node
COPY ./static/js /app/static/js
RUN npm run $TYPE

COPY . /app/

# The portal bundle goes in before collectstatic so it lands in /app/static-collected.
COPY --from=devportal-ui /src/devportal-ui/dist /app/static/bundles/devportal

RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80
