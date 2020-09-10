# Testing


## Local Testing Setup

1. configure local_settings-isntall 


```sh
$ python3 ./run_local.py
```

## Troubleshot Errors, in order
1. Missing local_settings.py
   - addressed by running tests in a running sandbox
2. Missing chrome-driver
   - Ran the following, which provides chromedriver
   ```sh
   apt-get install -y chromium-driver
   ```
3. "unknown error: DevToolsActivePort file doesn't exist"
   - Create a user, 'appium', and run tests as that user
4. user `appium` doesn't have access to /log
   - Long term: send all logs to stdout
   - short term: give the appium user permissoin to write to /log
     ```sh
     chmod -R 777 /log
     ```
     
5. 

```sh
apt-get install -y chromium-driver
adduser appium
chmod -R 777 /log

```

.
.
.

mo

```

```


## Exporation using prebuilt docker images
docker run -d -p 4444:4444 -v /dev/shm:/dev/shm selenium/standalone-chrome:3.141.59-zirconium

```python
# https://www.selenium.dev/documentation/en/remote_webdriver/remote_webdriver_client/#browser-options
from selenium import webdriver
copt = webdriver.ChromeOptions()
driver = webdriver.Remote(command_executor="http://localhost:4444/wd/hub", options=copt)
driver.get("http://sefaria.org")
```


## Code changes

* Alter the Trial object to take a precreated driver. This will help us swap in drivers without having to dig into the code



driver = webdriver.Remote(command_executor="http://selenium-deadbeef:4444/wd/hub", options=copt)

Remove BrowserStack and SauceLabs credential request for local and remote testing
