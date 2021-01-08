FROM gcr.io/production-deployment/base-node:latest

WORKDIR /app/

COPY package*.json /app/
RUN npm install --unsafe-perm

COPY ./node /app/node
COPY ./static/js /app/static/js
RUN npm run build-prod

COPY . /app/
EXPOSE 3000

CMD forever start -a -p ./ -l log/forever/forever.log -o log/forever/out.log -e log/forever/err.log static/bundles/server/server-bundle.js && tail -f log/forever/forever.log
