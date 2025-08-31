# Use an official Python runtime as a parent image
FROM python:3.7-slim

# Set the working directory to /app
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install psycopg2 dependencies
RUN apt-get update && apt-get install -y libpq-dev

# Install gcc and build tools for liblouis
RUN apt-get update && apt-get install -y gcc make

# Install any needed packages specified in requirements.txt
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Install liblouis from source
RUN python scripts/setup/install_liblouis.py

# Make port 8000 available to the world outside this container
EXPOSE 8000

# Define environment variable
ENV NAME Sefaria-Project

# Run app.py when the container launches
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
