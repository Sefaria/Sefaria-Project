FROM us-east1-docker.pkg.dev/production-deployment/containers/base-node:v13.0.0
ARG TYPE=build-prod

WORKDIR /app/

COPY package*.json /app/
RUN npm install --unsafe-perm

COPY ./node /app/node
COPY ./static/js /app/static/js
RUN npm run $TYPE

COPY . /app/
EXPOSE 3000

CMD forever start static/bundles/server/server-bundle.js
