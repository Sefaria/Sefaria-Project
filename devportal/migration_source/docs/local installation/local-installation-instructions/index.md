---
title: Local Installation Instructions
excerpt: >-
  Learn about how set up a local Sefaria environment in order to run a local
  copy of the application and web server.
deprecated: false
hidden: false
metadata:
  title: ''
  description: ''
  robots: index
next:
  description: ''
---
<Callout icon="🚧" theme="warn">
  ### Recommended: Use API Instead of Local Install

  If you're interested in working with Sefaria's data, we recommend using our [public API.](ref:getting-started) If you prefer a more in-depth interaction with our code, the following installation instructions explain how to do so.

  **This page is under review**. While we are working to make it as accurate as up to date as possible, there may still be some inaccuracies.
</Callout>

<br />

_Please note: if you are a developer interested in contributing code to Sefaria, we suggest first making a fork of this repository by clicking the "Fork" button when logged in to GitHub._

# Getting Started

Begin by cloning the [Sefaria-Project](https://github.com/Sefaria/Sefaria-Project) repository to a directory on your computer. Once cloning is complete, follow these steps:

_Note for macOS users: Ensure you have installed&#x20;_`Homebrew`_&#x20;like this:_

```
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
```

You can run the Sefaria-Project in two ways: docker-compose and local install.

We recommend using local installation. However if you are interested in exploring the experimental `docker-compose` approach, please see further information [here](https://developers.sefaria.org/docs/docker-compose-sefaria).

<Callout icon="❗️" theme="error">
  ### Please note:

  The following installation instructions are optimized for users of macOS. We strongly encourage Windows users to either explore our experimental [docker-compose set up method](https://developers.sefaria.org/docs/docker-compose-sefaria) or retrieve our data entirely via the API.
</Callout>

***

## Running Sefaria-Project Locally

To run Sefaria-Project locally, complete the following steps:

### 1) Install Python 3.12 or later.

_Python 3.12 is the minimum supported version. Earlier versions (3.9–3.11) will encounter dependency compatibility errors during&#x20;_`pip install`_._

#### For Linux and macOS:

Most Unix systems come with a Python interpreter pre-installed. However, this is generally still Python 2. The recommended way to get Python 3 without disrupting any software the OS is dependent on is by using pyenv. You can find instructions for this process [here](https://github.com/pyenv/pyenv#installation) and [here](https://opensource.com/article/19/5/python-3-default-mac#what-we-should-do).

_Please note: Below, we'll discuss how to configure virtual environments to work with pyenv so you can completely isolate your Sefaria stack._

#### For Windows:

The pyenv repository linked above also provides options for those working in Windows.

In order to simply install Python:

- Read the [Official Python documentation on Windows](https://docs.python.org/3.7/using/windows.html)
- Go to the [Python Download Page](https://www.python.org/downloads/release/python-375/) and download and install Python.
- Add the python directory to your OS' PATH variable if the installer has not done so.

### 2) Install virtualenv (optional but recommended).

If you work on many Python projects, you may want to keep Sefaria's Python installation separate by using Virtualenv. However, if you're happy having Sefaria requirements in your main Python installation, you can skip this step.

#### Working With Pyenv (Recommended)

You can use both virtualenv functionality and pyenv simultaneously. This allows you to further isolate your code and requirements from other projects.

#### For Unix & Windows

To work with pyenv in either Unix or Windows operation systems, use [these intructions](https://github.com/pyenv/pyenv-virtualenv#installing-as-a-pyenv-plugin).

#### macOS:

To work with pyenv in macOS, use [these instructions](https://github.com/pyenv/pyenv-virtualenv#installing-with-homebrew-for-macos-users).

#### How to Create a [pyenv virtualenv](https://github.com/pyenv/pyenv-virtualenv#using-pyenv-virtualenv-with-pyenv).

In your Sefaria directory, run `pyenv virtualenv <version-of-python> [venv-name]`. This will create a `.python-version` and write the version name provided to the file (e.g., `3.12/envs/sefaria-venv`), which should activate the virtualenv whenever you are in the Sefaria directory.

You may need to install the correct version of Python first for pyenv, `pyenv install --list` to see the versions, and then `pyenv install <selection-version>`.&#x20;

_Please note:&#x20;_

- _If, after following the installation and configuration instructions, running_`python -V`_&#x20;still displays the system version, you may have to manually add the shims directory to your path._ _If manual addition does not correct the issue, you should check your bash init file (.zshrc, .bashrc, or the like) for the line&#x20;_`eval "$(pyenv init -)"`_&#x20;(not inside an if statement) and change it to&#x20;_`eval "$(pyenv init --path)"`_&#x20;and restart the shell._
- _If you are using an IDE like PyCharm, you can (and should) configure the interpreter options on your Sefaria-Project to point to the Python executable of this virtualenv (e.g.,&#x20;_`~/.pyenv/versions/3.12.x/envs/sefaria-venv/bin/python3.12`_)_

#### Classic virtualenv

You can perform this step from anywhere in your command line, but it might be easier and tidier to run this step from the root of your project directory that you just cloned. e.g`~/web-projects/Sefaria-Project `

_Please note: Before installing virtualnv, you may need to install Pip (see below for further details).&#x20;_

Once [virtualenv](http://pypi.python.org/pypi/virtualenv) is installed, enter these commands:

_Note:&#x20;_`$`

```
virtualenv venv --distribute
source venv/bin/activate
```

Once the first command is entered, you should see `(venv)` preceding your command prompt. The second command sets your shell to use the Python virtual environment that you have just created.&#x20;

This is something that you have to run every time you open a new shell and want to run the Sefaria demo. You can always tell if you're in the virtual environment by checking if `(venv)` is at the beginning of your command prompt.

### 3) Install Pip (if necessary).

If you are using pyenv, Pip should be available via the pyenv version of Python.

#### For Unix:

If you don't already have [Pip](https://pip.pypa.io/en/stable/installing/) in your Python installation, you need to install it in order to install the required Python packages.

#### For Windows:

You can find instructions for using Pip with Windows [here.](http://www.tylerbutler.com/2012/05/how-to-install-python-pip-and-virtualenv-on-windows-with-powershell/) Once installed, make sure that the scripts subfolder of the Python installation directory is also in PATH.

_Please note: Both this step and more of the following command line instructions must be run from within the Sefaria-Project root directory._

In order to install Pip, run the following command:

```
pip install -r requirements.txt
```

<Callout icon="🚧" theme="warn">
  ### Important!

  **Please note that sometimes the&#x20;**`psycopg2`**&#x20;package can cause installation issues, and it is not usually needed for a local installation.**

  If you run into trouble, the `requirements.txt` file has a recommended change: Simply comment out the existing line and uncomment the recommended line.

  If that doesn't work, we recommend _temporarily_ commenting out the `psycopg2` line in `requirements.txt` and then re-running `pip install -r requirements.txt`. The pinned version in the file may differ from `2.8.6`.
</Callout>

If you are _not_ using virtualenv, you may have to run the above command with sudo: `sudo pip install -r requirements.txt`

_Please note: In most cases, you will need to install these Python development libraries as well:_

#### On Debian systems:

```
sudo apt-get install python-dev python3-dev libpq-dev
```

#### On Fedora systems:

```
sudo dnf install python3-devel libpq-devel
```

_Please note: If you see an error stating that&#x20;_`pg_config executable not found`_, this means you need to install PostgreSQL. If you're working with macOS and you see an error while&#x20;_`Building wheel for psycopg2`_&#x20;for&#x20;_`linker command failed with exit code 1`_, you may need to add the path to OpenSSL as described in the image below:_

```
export LDFLAGS="-L/usr/local/opt/openssl/lib"
export CPPFLAGS="-I/usr/local/opt/openssl/include"
```

<br />

After installing the Python development libraries or other dependencies, run `pip install -r requirements.txt` again.

### 4) Install gettext.

`gettext` is a GNU utility that Django uses to manage localizations.

#### For macOS:

```
brew install gettext
```

_Please note: On some macOS systems,&#x20;_`gettext`_&#x20;will still not run after installation and&#x20;_`django manage.py makemessages`_&#x20;will fail. In this case, one easy solution is to add the following to your .bashrc (or its equivalent on your system), and enter your gettext version number in place of the letter x where indicated:_

```
export TEMP_PATH=$PATH
export PATH=$PATH:/usr/local/Cellar/gettext/0.xx.x/bin
```

#### On Debian systems:

```
sudo apt-get install gettext
```

### 5) Create a local settings file.

This step must be run from the Sefaria-Project root directory.

```
cd sefaria
cp local_settings_example.py local_settings.py
vim local_settings.py
```

When creating a local settings file, replace the placeholder values with those matching your environment. For the most part, you should only have to specify values in the top part of the file, where it directs you to change the given values.

Among the placeholder values that need to be replaced, set the `DATABASES` default `NAME` field to a path (including a file name) where Django can create a sqlite database. Using `/path/to/Sefaria-Project/db.sqlite` is sufficient, as we git-ignore all `.sqlite` files.

You can name your local database (`sefaria` will be the default created by `mongorestore` below). You can leave `SEFARIA_DB_USER` ad `SEFARIA_DB_PASSWORD` blank if you don't need to run authentication on Mongo.

### 6) Create a log directory.

Create a directory called `log` under the root project folder (i.e., `Sefaria-Project/`). To do this, run `mkdir log` from the project's root directory.

The result should look something like `Sefaria-Project/log`.

Make sure that the server user has write access to it by using a command such as `chmod 777 log`.

### 7) Get Mongo running:

If you don't already have it, [install MongoDB](https://www.mongodb.com/docs/manual/administration/install-community/). Our current data dump requires MongoDB version 4.4 or later. After installing MongoDB according to the provided instructions, its service automatically running in the background.

Otherwise, run the Mongo daemon with:

```
mongod
```

_Please note: Only use sudo if necessary, as it may result in a locked socket file being created that may prevent mongo from running later on._

You can also use your operating system service manager to have Mongo start on startup.

These days, Mongo usually sets all the correct paths for itself to run properly. See [here](https://www.mongodb.com/docs/manual/tutorial/manage-mongodb-processes/#start-mongod-processes) for details on setting a specific path for it to store data in.

### 8) Add some texts in your database.

MongoDB dumps of our database are available to download.

The recommended dump (which is a more manageable size) is available [here](https://storage.googleapis.com/sefaria-mongo-backup/dump_small.tar.gz).

If you prefer, you can also access a complete dump (which is much larger) [here](https://storage.googleapis.com/sefaria-mongo-backup/dump.tar.gz). The complete dump includes the `history` collections, which contains a complete revision history of every text in our library. For many applications, this data is not relevant. We recommend using the smaller dump unless you're specifically interested in the history of text revisions within Sefaria.

Once downloaded, unzip the file and extract the `dump` folder. If you don't have an app for unzipping, you can do this from Command Prompt by navigating to the folder containing the download and using either `tar -xf dump.tar.gz` or `tar -xf dump_small.tar.gz` , depending on which dump you downloaded.

_Please note: This&#x20;_`dump`_&#x20;must be restored as a MongoDB database._

In MongoDB versions 4.4+, mongorestore comes separately from the MongoDB server. Therefore, if you don't already have it, you'll also need to download and unzip the [Database Tools](https://www.mongodb.com/try/download/database-tools?tck=docs_databasetools). You may need to add its \bin\ directory to your PATH environment variables as well.

Once you have the unzipped `dump`from the folder which contains `dump`, run:

```
mongorestore --drop
```

This will create (or overwrite) a Mongo database called `sefaria`.

If you chose to download the recommended dump (`dump_small.tar.gz`) create an empty collection inside the `sefaria` database called `history`. This can be done using either the Mongo client shell or a GUI you have installed, such as MongoDB Compass.

### 9) Set up Django's local server

Sefaria uses Google's reCAPTCHA in order to verify that users are not bots. For a deployment, you should register and use your own reCAPTCHA keys ([https://pypi.org/project/django-recaptcha/#installation](https://pypi.org/project/django-recaptcha/#installation)). For local development, the default test keys will suffice. This warning can be suppressed by uncommenting the following in the local_settings.py file:

```
SILENCED_SYSTEM_CHECKS = ['captcha.recaptcha_test_key_error']
```

_Please note:&#x20;_`manage.py`_&#x20;is used to run and manage the local server. It is located in the root directory of the&#x20;_`Sefaria-Project`_&#x20;codebase.&#x20;_

Django authentication features run on a separate database. To initialize this database and set up Django's authentication system, switch to the root directory of the `Sefaria-Project` code base and run the following from the project root:

```
python manage.py migrate
```

### 10) Install Node.

_Please note: Older versions of_`Node`_&#x20;and&#x20;_`npm`_&#x20;ran into a file name length limit on Windows OS. This problem is usually mitigated in newer versions on Windows 10._

Node is now required to run the site. Even if you choose to have Javascript run only on the client, we also use [Webpack](https://webpack.js.org/) to bundle our Javascript.

Installing Node and npm from the main installers on Node's homepage may cause permission issues. This is why we recommend using one of the alternative methods listed [here](https://nodejs.org/en/download/package-manager/). We prefer a version manager, like nvm.

#### For Debian, Ubuntu, and Linux Mint:

You'll get better results when using `apt-get nodejs` or following the instructions found [here](https://github.com/nodesource/distributions/blob/master/README.md). They will install both Node and npm.

#### For macOS:

We recommend using either `brew install node` or [`nvm.`](https://nodejs.org/en/download/package-manager/#nvm)

Once you have installed Node or npm, download the required Javascript libraries and install some global tools for development with the `setup` script from the project root as follows:

```
npm install
npm run setup
```

If the second command fails, you may have to install using `sudo npm run setup`.

#### Run Webpack

To get the site running, you need to bundle the Javascript with Webpack. In order to bundle once, run the following:

```
npm run build-client
```

In order to watch the Javascript for changes and automatically rebuild, run the following:

```
npm run watch-client
```

#### Server-side rendering with Node:

Sefaria uses React.js. To render HTML server-side, we use a Node.js server. For development, the site is fully functional without server-side rendering. For deploying in a production environment, however, server-side HTML is very important for bots and SEO.

#### Install Redis

To use server-side rendering, you must also install Redis Cache: `brew install redis` or `sudo apt-get install redis`.

To run redis: `redis-server`. On macOS: `brew services start redis`

#### Configure Django and Node to use Redis as a shared datastore

**Django**

Update your `local_settings.py` file and replace the `CACHES` variable with the `CACHES` variable meant for server-side rendering, commented out in `local_settings_example.py`. Also, make sure the following are set:

```
SESSION_CACHE_ALIAS = "default" #declares where Django's session engine will store data
USER_AGENTS_CACHE = 'default' #declares where the Django user agent middleware will store data (cannot be JSON encoded!)
SHARED_DATA_CACHE_ALIAS = 'shared' #Tells the application where to store data placed in cache by `sefaria.system.cache` shared-cache functions

USE_NODE = True
NODE_HOST = "http://localhost:3000" #Or whatever host and port you set Node up to listen on

```

**Node**

The following environment variables, defined in `./node/local_settings.js`, can be set to configure the node instance:

| Env Var       | Default     | Description                                                    |
| ------------- | ----------- | -------------------------------------------------------------- |
| `NODEJS_PORT` | `3000`      | The port to be used by the NodeJs service                      |
| `DEBUG`       | `false`     | Determines whether the NodeJs service should run in debug mode |
| `REDIS_HOST`  | `127.0.0.1` | The Redis instance to point Node to when running               |
| `REDIS_PORT`  | `6379`      | The Default port Redis listens on                              |

These variables can be set explicitly via command line. This sets them up to be either defined when your machine's shell runs or set up in your IDE settings for running the node server.

For development, you can run the Node server using nodemon with:

```
npm start
```

To run webpack with server-side rendering, use:

```
npm run build
```

or

```
npm run watch
```

### 11) Run the development server:

```
python manage.py runserver
```

You can also make it publicly available by specifying 0.0.0.0 for the host as follows:

```
python manage.py runserver 0.0.0.0:8000    
```

## Command Line Interface

The shell script `cli` will invoke a Python interpreter with the core models loaded, and can be used as a standalone interface to texts or for testing as follows:

```
$ ./cli
>>> p = LinkSet(Ref("Genesis 13"))
>>> p.count()
226
```

<br />
