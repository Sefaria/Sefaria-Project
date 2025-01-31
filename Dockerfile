# Use an official Python runtime as a parent image
FROM python:3.9-slim

# Set the working directory to /app
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install psycopg2 dependencies
RUN apt-get update && apt-get install -y libpq-dev

# Install git because docker can't fucking preinstall it and i've been trying to debug this for one fucking hour fml
RUN apt-get update && apt-get install -y git

# Install gcc
RUN apt-get update && apt-get install -y gcc

# Install any needed packages specified in requirements.txt
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Make port 8000 available to the world outside this container
EXPOSE 8000

# Define environment variable
ENV NAME Sefaria-Project

# Run app.py when the container launches
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
