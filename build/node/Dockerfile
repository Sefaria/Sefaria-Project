FROM node:latest

COPY . /app/
WORKDIR /app/

RUN npm install forever -g \
 && mkdir /app/log \
 && mkdir /app/log/forever \
 && touch /app/log/forever/forever.log

EXPOSE 3000

CMD forever start -a -p ./ -l log/forever/forever.log -o /dev/stdout -e /dev/stderr static/bundles/server/server-bundle.js && (while true; do sleep 360;forever restartall;done) && tail -f log/forever/forever.log

