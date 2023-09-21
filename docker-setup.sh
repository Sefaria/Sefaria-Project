#!/bin/bash

# Get the container ID for the web service
WEB_CONTAINER_ID=$(docker ps | grep "sefaria" | grep "web" | awk '{print $1}')

# Get the container ID for the node service
NODE_CONTAINER_ID=$(docker ps | grep "sefaria" | grep "node" | awk '{print $1}')

# Function to prompt user for action or skip
prompt_skip() {
    echo "$1 (Press ENTER to continue or 's' to skip)"
    read -p "> " choice
    if [ "$choice" == "s" ]; then
        return 1
    fi
    return 0
}

# Step 1: Load data into the database
if prompt_skip "Step 1: Load data into the database"; then
    # Download the MongoDB dump
    curl -O https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz

    # Extract the dump
    tar -xzf dump_small.tar.gz

    # Restore the dump to the local MongoDB instance on port 27018
    mongorestore --drop --port 27018
fi

# Step 2: Update local settings file
if prompt_skip "Step 2: Update local settings file"; then
    cp sefaria/local_settings_example.py sefaria/local_settings.py

    # Replace values in the local_settings.py
    echo "
    Enter the following values for the local_settings.py file:

    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': 'sefaria',
            'USER': 'admin',
            'PASSWORD': 'admin',
            'HOST': 'postgres',
            'PORT': '',
        }
    }


    MONGO_HOST = 'db'

    And uncomment
    # SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']

    "
fi

# Step 3: Connect to the django container and run migrations
if prompt_skip "Step 3: Connect to the django container and run migrations"; then
    docker exec -it $WEB_CONTAINER_ID bash -c "python manage.py migrate"
fi

# Step 4: Run webpack
if prompt_skip "Step 4: Run webpack"; then
    docker exec -it $NODE_CONTAINER_ID bash -c "npm run build-client"
    # Uncomment the following line if you want to run `npm run watch-client` instead
    # docker exec -it $NODE_CONTAINER_ID bash -c "npm run watch-client"
fi

echo "Script completed!"
