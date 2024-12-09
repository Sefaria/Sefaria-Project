# Use node-python image as the base image
FROM beevk/node-python:0.2

# Set the working directory inside the container
WORKDIR /app

# Copy the local_settings.py file to the working directory
COPY ./sefaria/local_settings.py ./sefaria/local_settings.py

# Copy the requirements.txt file and install dependencies
COPY requirements.txt ./
COPY package*.json ./

# Install global Python and Node.js dependencies
RUN pip install -r requirements.txt
RUN npm install --unsafe-perm

# Check the installed version of Pillow after installing requirements
RUN python -m pip show Pillow

COPY ./node ./node
COPY ./static/js ./static/js

RUN npm run setup
RUN npm run build-prod

# Install system dependencies for building Python 3.12
# RUN apt-get update && apt-get install -y \
#     software-properties-common \
#     wget \
#     build-essential \
#     zlib1g-dev \
#     libssl-dev \
#     libbz2-dev \
#     libreadline-dev \
#     libsqlite3-dev \
#     libffi-dev && \
#     apt-get clean

# Download and build Python 3.12
# RUN wget https://www.python.org/ftp/python/3.12.0/Python-3.12.0.tgz && \
#     tar xvf Python-3.12.0.tgz && \
#     cd Python-3.12.0 && \
#     ./configure --enable-optimizations && \
#     make -j$(nproc) && \
#     make altinstall && \
#     cd .. && rm -rf Python-3.12.0 Python-3.12.0.tgz

# Verify Python 3.12 installation
# RUN python3.12 --version


# Create a virtual environment with Python 3.12
# RUN python3.12 -m venv /pillow-env && \
#     /pillow-env/bin/pip install --upgrade pip && \
#     /pillow-env/bin/pip install Pillow==11.0.0

# RUN /pillow-env/bin/pip list

# RUN ls -l /pillow-env/lib/python3.12/site-packages

# Copy application source code
COPY . ./

# Run Django migrations and start the server
CMD ["bash", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]

# Expose the port for the Django application
EXPOSE 8000