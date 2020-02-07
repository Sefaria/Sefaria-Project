FROM node:13

# These environment variables can be overwritten at run-time
ENV DJANGO_HOST web
ENV DJANGO_PORT 80
ENV NODEJS_PORT 3000
ENV DEBUG       false

COPY . /app/
WORKDIR /app/

RUN npm ci && npm run build-prod

RUN npm install forever -g \
 && mkdir -p /app/log \
 && mkdir -p /app/log/forever \
 && touch /app/log/forever/forever.log

EXPOSE 3000

CMD forever start -a -p ./ -l log/forever/forever.log -o log/forever/out.log -e log/forever/err.log static/bundles/server/server-bundle.js && tail -f log/forever/forever.log
