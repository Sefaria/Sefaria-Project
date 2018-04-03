FROM node:latest

COPY . /app/
WORKDIR /app/

RUN npm install forever -g \
 && mkdir /app/log \
 && mkdir /app/log/forever \
 && touch /app/log/forever/forever.log

EXPOSE 3000

CMD forever start -a -p ./ -l log/forever/forever.log -o log/forever/out.log -e log/forever/err.log static/bundles/server/server-bundle.js && tail -f log/forever/forever.log

