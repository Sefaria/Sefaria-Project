FROM node:latest as node
RUN git clone --depth=1 --branch=multiserver https://github.com/Sefaria/Sefaria-Project.git /app \
 && rm -rf /app/.git

WORKDIR /app/
COPY local_settings.json /app/node/local_settings.json
RUN npm install \
 && npm install forever -g \
 && npm run build-server \
 && mkdir /app/log \
 && mkdir /app/log/forever \
 && touch /app/log/forever/forever.log
EXPOSE 3000
CMD forever start -a -p ./ -l log/forever/forever.log -o log/forever/out.log -e log/forever/err.log static/bundles/server/server-bundle.js && tail -f log/forever/forever.log

