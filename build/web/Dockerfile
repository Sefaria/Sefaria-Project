FROM us-east1-docker.pkg.dev/production-deployment/containers/base-web:3.9-bullseye
ARG TYPE=build-prod

WORKDIR /app/
# Copied separately to allow for caching of the `pip install` build step
COPY requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt

COPY package*.json /app/
RUN npm install --unsafe-perm

COPY ./node /app/node
COPY ./static/js /app/static/js
RUN npm run $TYPE

COPY . /app/

RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80
