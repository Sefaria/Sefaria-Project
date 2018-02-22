FROM python:2.7 as repo
RUN git clone --depth=1 --branch=multiserver https://github.com/Sefaria/Sefaria-Project.git /app \
 && rm -rf /app/.git \
 && mkdir /app/log \
 && chmod 777 /app/log \
 && ln -s /settings/local_settings.py /app/sefaria/local_settings.py

FROM debian:jessie as re2
RUN apt-get update \
&& apt-get -y install python-dev build-essential g++ make git \
&& git clone https://code.googlesource.com/re2 \
&& cd re2 \
&& make test

FROM node:latest as node
RUN mkdir /app
WORKDIR /app/
COPY --from=repo /app /app
RUN npm install \
  && cp ./node/local_settings_example.json ./node/local_settings.json \
  && npm run build



FROM grahamdumpleton/mod-wsgi-docker:python-2.7-onbuild
RUN rm -rf /app
COPY --from=node /app /app
WORKDIR /app/
COPY wsgi.whiskey /app/.whiskey
ENV PYTHONUNBUFFERED 1
ENV PYTHONPATH /app
ENV DJANGO_SETTINGS_MODULE sefaria.settings
RUN pip install -r requirements.txt \
  && cp -R ./locale/en/LC_MESSAGES/ /usr/local/python/lib/python2.7/site-packages/django/conf/locale/en \
  && chown -R whiskey /app

#re2
RUN mkdir -p /usr/local/include/re2 /usr/local/lib/pkgconfig
COPY --from=re2 re2/re2/filtered_re2.h re2/re2/re2.h re2/re2/set.h re2/re2/stringpiece.h  /usr/local/include/re2/
COPY --from=re2 re2/obj/libre2.a /usr/local/lib/libre2.a
COPY --from=re2 re2/obj/so/libre2.so /usr/local/lib/libre2.so.0.0.0
COPY --from=re2 re2/re2.pc /usr/local/lib/pkgconfig/re2.pc

RUN chmod -R 644 /usr/local/include/re2 /usr/local/lib/pkgconfig/re2.pc \
&& ln -sf libre2.so.0.0.0 /usr/local/lib/libre2.so.0 \
&& ln -sf libre2.so.0.0.0 /usr/local/lib/libre2.so \
&& sed -i -e "s#@prefix@#/usr/local#" /usr/local/lib/pkgconfig/re2.pc \
&& sed -i -e "s#@exec_prefix@#/usr/local#" /usr/local/lib/pkgconfig/re2.pc \
&& sed -i -e "s#@includedir@#/usr/local/include#" /usr/local/lib/pkgconfig/re2.pc \
&& sed -i -e "s#@libdir@#/usr/local/lib#" /usr/local/lib/pkgconfig/re2.pc

RUN cd / && git clone git://github.com/axiak/pyre2.git \
&& cd pyre2 \
&& python setup.py install