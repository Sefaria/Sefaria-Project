FROM node:13

# These environment variables can be overwritten at run-time
ENV DJANGO_HOST web
ENV DJANGO_PORT 80
ENV NODEJS_PORT 3000
ENV DEBUG       false

RUN npm install forever -g 

RUN mkdir -p /app/log \
 && mkdir -p /app/log/forever \
 && touch /app/log/forever/forever.log