FROM python:3.7

COPY ./requirements.txt ./
RUN pip3 install --no-cache-dir -r ./requirements.txt
RUN git clone https://code.googlesource.com/re2 && cd re2 && make && make install && cd / && pip3 install https://github.com/andreasvc/pyre2/archive/3e01eba6ba3eabd1359ef5e16c938c8866deea70.zip


# docker build . -t gcr.io/production-deployment/pyre2:20201028 -t gcr.io/production-deployment/pyre2:latest

# docker push gcr.io/production-deployment/pyre2:20201028
# docker push gcr.io/production-deployment/pyre2:latest