from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

from creds import BS_USER, BS_KEY, SAUCE_ACCESS_KEY, SAUCE_USERNAME
BS_MAX_THREADS = 2
SAUCE_MAX_THREADS = 5

REMOTE_URL = "http://test.sefaria.org"
LOCAL_URL = "http://localhost:8000"

TEMPER = 15  # default wait time in seconds
# According to http://gs.statcounter.com/#browser_version-ww-monthly-201602-201604-bar
# According to https://www.browserstack.com/test-on-the-right-mobile-devices

BS_CAPS = [
    {'browser': 'Chrome', 'browser_version': '49.0', 'os': 'Windows', 'os_version': '8', 'resolution': '1920x1080',
        'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Chr/Win8'},

    # {'browser': 'IE', 'browser_version': '11.0', 'os': 'Windows', 'os_version': '10', 'resolution': '1024x768',
    #     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'IE/Win10'},

    {'browser': 'Firefox', 'browser_version': '45.0', 'os': 'OS X', 'os_version': 'Yosemite', 'resolution': '1920x1080',
        'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'FF/OSX'},

    {'browser': 'Safari', 'browser_version': '9.0', 'os': 'OS X', 'os_version': 'El Capitan', 'resolution': '1600x1200',
        'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Saf/OSX'},

    {'browserName': 'iPhone', 'platform': 'MAC', 'device': 'iPhone 5S',
        'sefaria_mode': 'single_panel', 'sefaria_short_name': 'iPhone5s'},

    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Samsung Galaxy S5',
        'sefaria_mode': 'single_panel', 'sefaria_short_name': 'Galaxy S5'},

    {'browserName': 'iPad', 'platform': 'MAC', 'device': 'iPad Air 2',
        'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'iPadAir2'}
]

SAUCE_CORE_CAPS = [
    {'browserName': "firefox", 'platform': "macOS 10.12", 'version': "latest",
     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'FF/x12'},

    {'browserName': "safari", 'platform': "OS X 10.11", 'version': "latest",
     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Sf/x11'},

    {'browserName': "chrome", 'platform': "Windows 10", 'version': "latest",
     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Cr/w10'},

    {'browserName': "firefox", 'platform': "Windows 10", 'version': "latest",
        'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'FF/w10'},

    {'deviceName': 'Android GoogleAPI Emulator', 'platformName': 'Android', 'platformVersion': '7.1',
     'browserName': 'Chrome', 'appiumVersion': '1.9.1', 'deviceOrientation': "portrait",
     'sefaria_mode': 'single_panel', 'sefaria_short_name': 'And/7.1'},

    {'browserName': "Safari", 'platformName': "iOS", 'deviceName': "iPhone 8 Simulator",
    'appiumVersion': "1.9.1", 'platformVersion': "12.0", 'deviceOrientation': "portrait",
     'sefaria_mode': 'single_panel', 'sefaria_short_name': 'iPh8'},

    #{'deviceName': 'Android GoogleAPI Emulator', 'platformName': 'Android', 'platformVersion': '7.0',
    #'browserName': '', 'appiumVersion': '1.6.4', 'deviceOrientation': "portrait",
    # 'sefaria_mode': 'single_panel', 'sefaria_short_name': 'And/6.0'}
]


SAUCE_EXTENDED_CAPS = [  # Needs Review!
    # {'browserName': "internet explorer", 'platform': "Windows 10", 'version': "11.103",
    #  'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'IE/w10'},

    {'browserName': "iPhone", 'platform': "OS X 10.10", 'version': "9.2", 'deviceName': "iPad Air",
     'deviceOrientation': "portrait",
     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'iPadA/p'},

    {'browserName': "iPhone", 'platform': "OS X 10.10", 'version': "9.2", 'deviceName': "iPad Air",
     'deviceOrientation': "landscape",
     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'iPadA/l'},

    {'browserName': 'android', 'platform': 'Linux', 'version': '4.4', 'deviceName': "Google Nexus 7 HD Emulator",
     'deviceOrientation': "portrait",
     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Nex7/4.4'},

    {'browserName': "Safari", 'platformName': "iOS", 'deviceName': "iPhone 8 Plus Simulator",
    'appiumVersion': "1.9.1", 'platformVersion': "12.0", 'deviceOrientation': "portrait",
     'sefaria_mode': 'single_panel', 'sefaria_short_name': 'iPh8p'},

    {'browserName': "MicrosoftEdge", 'platform': "Windows 10", 'version': "latest",
        'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Edg/w10'},


]

SAUCE_CAPS = SAUCE_CORE_CAPS + SAUCE_EXTENDED_CAPS
