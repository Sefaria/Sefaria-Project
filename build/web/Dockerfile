FROM gcr.io/production-deployment/base-web:latest

# Copied separately to allow for caching of the `pip install` build step
COPY ./requirements.txt /app/requirements.txt
RUN pip3 install --no-cache-dir -r /app/requirements.txt --use-feature=2020-resolver

COPY . /app/
WORKDIR /app/

RUN npm install --unsafe-perm && npm run build-prod
RUN python manage.py collectstatic

ENTRYPOINT ["/bin/bash", "-c"]
EXPOSE 80
