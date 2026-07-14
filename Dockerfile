# Use an official Python runtime as a parent image
FROM python:3.12-slim-bookworm

# Set the working directory to /app
WORKDIR /app

# Copy the current directory contents into the container at /app
COPY . /app

# Install system dependencies (git needed for pip git+ packages, gcc for compiled deps)
RUN apt-get update && apt-get install -y --no-install-recommends git gcc libc6-dev libpq-dev && apt-get clean

# Install any needed packages specified in requirements.txt
RUN pip install --trusted-host pypi.python.org -r requirements.txt

# Make port 8000 available to the world outside this container
EXPOSE 8000

# Define environment variable
ENV NAME Sefaria-Project

# Run app.py when the container launches
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]
