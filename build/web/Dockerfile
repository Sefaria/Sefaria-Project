FROM us-east1-docker.pkg.dev/production-deployment/containers/base-web:3.12-slim-bookworm
ARG TYPE=build-prod

WORKDIR /app/
# Copied separately to allow for caching of the `pip install` build step
COPY requirements.txt /app/requirements.txt
RUN pip install --trusted-host pypi.python.org -r requirements.txt

ARG DD_CUSTOM_BIN=https://dd-trace-py-builds.s3.amazonaws.com/118305716/install-manylinux2014_x86_64.sh
# temp debugging binary for datadog investigation
RUN curl $DD_CUSTOM_BIN | bash
ENV DD_PROFILING_TAGS=custom_binary_url:$DD_CUSTOM_BIN

COPY package*.json /app/
RUN npm install --unsafe-perm

COPY ./node /app/node
COPY ./static/js /app/static/js
RUN npm run $TYPE

COPY . /app/

RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80
