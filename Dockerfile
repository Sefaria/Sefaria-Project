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

# Install system dependencies for Pillow and Python 3.12
RUN apt-get update && apt-get install -y \
    software-properties-common 

# Add the Deadsnakes PPA for Python 3.12 manually
RUN curl -fsSL https://keyserver.ubuntu.com/pks/lookup?op=get&search=0xDEADSNAKES \
    | gpg --dearmor -o /usr/share/keyrings/deadsnakes-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/deadsnakes-archive-keyring.gpg] http://ppa.launchpad.net/deadsnakes/ppa/ubuntu focal main" \
    > /etc/apt/sources.list.d/deadsnakes-ppa.list && \
    apt-get update && \
    apt-get install -y python3.12 python3.12-venv python3.12-dev && \
    apt-get clean

# Verify Python 3.12 installation
RUN python3.12 --version

# Create a virtual environment with Python 3.12
ENV VIRTUAL_ENV="/env"
RUN python3.12 -m venv $VIRTUAL_ENV

# Install Pillow 11 in the virtual environment
RUN $VIRTUAL_ENV/bin/pip install --upgrade pip && \
    $VIRTUAL_ENV/bin/pip install Pillow==11.0.0

# Copy application source code
COPY . ./

# Ensure the virtual environment is used for the application
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
RUN echo "PATH is set to: $PATH"

# Run Django migrations and start the server
CMD ["bash", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]

# Expose the port that the Django server will listen on
EXPOSE 8000
