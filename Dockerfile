# Use node-python image as the base image
FROM beevk/node-python:0.2

# Set the working directory inside the container
WORKDIR /app

# Install system dependencies for libraqm and font support
RUN apt-get update && apt-get install -y \
    libfreetype6-dev \
    libjpeg-dev \
    zlib1g-dev \
    libraqm-dev \
    fontconfig \
    && rm -rf /var/lib/apt/lists/*

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

# Add a diagnostic command to check libraqm and Pillow support
RUN echo "Checking libraqm and Pillow support..." && \
    dpkg -l | grep libraqm || echo "libraqm not installed" && \
    python -c "from PIL import Image; print('Pillow version:', Image.__version__); print('Raqm support:', 'raqm' in Image.core.__dict__)" || echo "Pillow check failed"

COPY ./node ./node
COPY ./static/js ./static/js

RUN npm run setup
RUN npm run build-prod

# Collect static files with WhiteNoise
RUN python manage.py collectstatic --noinput

# Copy application source code
COPY . ./

# Run Django migrations and start the server
CMD ["bash", "-c", "python manage.py migrate && python manage.py runserver 0.0.0.0:8000"]

# Expose the port for the Django application
EXPOSE 8000