FROM gcr.io/production-deployment/base-node:latest

COPY . /app/
WORKDIR /app/

RUN npm install --unsafe-perm && npm run build-prod

EXPOSE 3000

CMD forever start -a -p ./ -l log/forever/forever.log -o log/forever/out.log -e log/forever/err.log static/bundles/server/server-bundle.js && tail -f log/forever/forever.log
