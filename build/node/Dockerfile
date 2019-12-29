# SRC_IMG will be the `web` container, with the assets collected in /app/static-collected
ARG SRC_IMG

FROM ${SRC_IMG} AS static_source

COPY . /app/
COPY ./build/node/local_settings.json /app/node/local_settings.json
WORKDIR /app/

RUN npm install forever -g \
 && mkdir -p /app/log \
 && mkdir -p /app/log/forever \
 && touch /app/log/forever/forever.log

EXPOSE 3000

CMD forever start -a -p ./ -l log/forever/forever.log -o log/forever/out.log -e log/forever/err.log static/bundles/server/server-bundle.js && tail -f log/forever/forever.log
