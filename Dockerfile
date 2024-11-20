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

# # Install system dependencies for Pillow and Python 3.12
# RUN apt-get update && apt-get install -y \
#     software-properties-common 

# # Download and build Python 3.12 from source
# RUN wget https://www.python.org/ftp/python/3.12.0/Python-3.12.0.tgz && \
#     tar xvf Python-3.12.0.tgz && \
#     cd Python-3.12.0 && \
#     ./configure --enable-optimizations && \
#     make -j$(nproc) && \
#     make altinstall && \
#     cd .. && rm -rf Python-3.12.0 Python-3.12.0.tgz

# # Verify Python 3.12 installation
# RUN python3.12 --version

# # Create a virtual environment with Python 3.12
# ENV VIRTUAL_ENV="/env"
# RUN python3.12 -m venv $VIRTUAL_ENV

# # Install Pillow 11 in the virtual environment
# RUN $VIRTUAL_ENV/bin/pip install --upgrade pip && \
#     $VIRTUAL_ENV/bin/pip install Pillow==11.0.0

# Copy application source code
COPY . ./

# Ensure the virtual environment is used for the application
ENV PATH="$VIRTUAL_ENV/bin:$PATH"
RUN echo "PATH is set to: $PATH"

# Run Django migrations and start the server
CMD ["bash", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]

# Expose the port that the Django server will listen on
EXPOSE 8000
