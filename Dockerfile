# Use node-python image as the base image
FROM beevk/node-python:0.2

# Set the working directory inside the container
WORKDIR /app

# Copy the local_settings.py file to the working directory
COPY ./sefaria/local_settings.py ./sefaria/local_settings.py

# Copy the requirements.txt file and install dependencies
COPY requirements.txt ./
COPY package*.json ./

RUN pip install -r requirements.txt
RUN npm install --unsafe-perm

COPY ./node ./node
COPY ./static/js ./static/js

RUN npm run setup
RUN npm run build-prod

COPY . ./

# Run Django migrations and start the server
CMD ["bash", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]

# Expose the port that the Django server will listen on
EXPOSE 8000