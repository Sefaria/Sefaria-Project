FROM node:12

# ENV TURN_SERVER
# ENV TURN_USER
# ENV TURN_SECRET

WORKDIR /usr/src/app

COPY ./ ./
RUN npm install

EXPOSE 8080

CMD [ "npm", "start" ]
