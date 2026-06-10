FROM mongo:4.4

# Move mongo data path out of VOLUME to force persistence
RUN mkdir -p /data/persist \
    && chown -R mongodb:mongodb /data/persist

ENV HOME=/data/persist

RUN mkdir /temp
# For faster iteration, download by hand and swap commented lines
ADD https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz /temp/
#COPY dump_small.tar.gz /temp/

RUN tar xzvf /temp/dump_small.tar.gz -C /temp && docker-entrypoint.sh mongod --fork --logpath /dev/null --dbpath /data/persist && mongorestore --drop --host=127.0.0.1:27017 -v -d sefaria --dir=/temp/dump/sefaria && mongod --shutdown --dbpath /data/persist && rm -rf /temp

CMD [ "mongod", "--dbpath", "/data/persist" ] 
