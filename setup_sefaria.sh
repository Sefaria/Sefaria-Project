#!/bin/bash

echo "This script will guide you through setting up the Sefaria-Project repository."
echo "Press 'Enter' to proceed with each step or 's' to bypass the step."

# Function to prompt the user for input
prompt_user() {
  read -p "Press 'Enter' to proceed or 's' to bypass this step: " action
  if [[ $action == "s" ]]; then
    return 1
  fi
}

echo "STEP 1: Clone the Sefaria-Project repository"
if prompt_user; then
  echo "If you are reading this, you have already cloned the repository."
fi

echo "STEP 2: Install Homebrew (for macOS users)"
if prompt_user; then
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  cd /opt/homebrew/bin/
  ls
  export PATH=$PATH:/opt/homebrew/bin
  cd
  touch ~/.zshrc
  echo 'export PATH="$PATH:/opt/homebrew/bin"' >> ~/.zshrc
  brew doctor
fi

echo "STEP 3: Install Python 3.7 and virtualenv"
if prompt_user; then
  if ! command -v python3.7 &> /dev/null; then
    curl https://pyenv.run | bash
    export PATH="$HOME/.pyenv/bin:$PATH"
    eval "$(pyenv init -)"
    eval "$(pyenv virtualenv-init -)"
    pyenv install 3.7.12
    pyenv global 3.7.12
    pip install virtualenv
  fi
fi

echo "STEP 4: Install postgresql"
if prompt_user; then
  if ! command -v virtualenv &> /dev/null; then
    brew install postgresql@15
    cd
    touch ~/.zshrc
    echo 'export PATH="$PATH:/opt/homebrew/bin"' >> ~/.zshrc
    brew services start postgresql@15
    /opt/homebrew/bin/createuser -s postgres
  fi
fi

echo "STEP 5: Install requirements"
if prompt_user; then
  brew install openssl
  brew install freetype harfbuzz fribidi
  brew install libjpeg little-cms2 openjpeg webp
  pip install -r requirements.txt
fi

echo "STEP 6: Install gettext"
if prompt_user; then
  if ! command -v gettext &> /dev/null; then
    brew install gettext
    brew link --force gettext
  fi
fi

echo "STEP 7: Create a local settings file"
if prompt_user; then
  if [ ! -f "sefaria/local_settings.py" ]; then
    cp sefaria/local_settings_example.py sefaria/local_settings.py
  fi
fi

echo "STEP 8: Create a log directory"
if prompt_user; then
  mkdir -p log
fi

echo "STEP 9: Get Mongo running"
if prompt_user; then
  brew tap mongodb/brew
  brew install mongodb-community@4.4
  echo 'export PATH="/opt/homebrew/opt/mongodb-community@4.4/bin:$PATH"' >> ~/.zshrc
  source ~/.zshrc
  brew services restart mongodb/brew/mongodb-community@4.4
fi

echo "STEP 10: Put some texts in your database"
if prompt_user; then
    curl -O https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz
    tar -xzf dump_small.tar.gz
    mongorestore --drop
fi

echo "STEP 11: Set up Django's local server"
if prompt_user; then
  python manage.py runserver
fi

echo "STEP 12: Install Node"
if prompt_user; then
  if ! command -v node &> /dev/null; then
    brew install node
  fi
fi

echo "STEP 13: Run Webpack"
if prompt_user; then
  if ! command -v npm &> /dev/null; then
    echo "npm not found. Please install Node.js and npm first."
  else
    cd Sefaria-Project
    npm install
    npm run setup
    npm run build-client
  fi
fi

echo "STEP 14: Verify the setup"
if prompt_user; then
  curl http://localhost:8000
  if [ $? -eq 0 ]; then
    echo "Setup was successful!"
  else
    echo "Something went wrong. Please check your setup."
  fi
fi

echo "Installation completed. Please verify the above output for any errors!"
