FROM ubuntu:bionic

RUN apt-get update && apt-get install -y coturn

ENV TURN_SECRET test
ENV TURN_USER test
ENV TURN_REALM someRealm

ADD start_turn_server.sh start_turn_server.sh

RUN chmod +x start_turn_server.sh

EXPOSE 3478

ENTRYPOINT ["./start_turn_server.sh"]
