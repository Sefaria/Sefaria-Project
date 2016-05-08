from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

from creds import BS_USER, BS_KEY, SAUCE_ACCESS_KEY, SAUCE_USERNAME
MAX_THREADS = 5

REMOTE_URL = "http://test.sefaria.org"
LOCAL_URL = "http://localhost:8000"

# According to http://gs.statcounter.com/#browser_version-ww-monthly-201602-201604-bar
BS_DESKTOP = [
    {'browser': 'Chrome', 'browser_version': '49.0', 'os': 'Windows', 'os_version': '8', 'resolution': '1920x1080'},
    {'browser': 'IE', 'browser_version': '11.0', 'os': 'Windows', 'os_version': '10', 'resolution': '1024x768'},
    {'browser': 'Firefox', 'browser_version': '45.0', 'os': 'OS X', 'os_version': 'Yosemite', 'resolution': '1920x1080'},
    {'browser': 'Safari', 'browser_version': '9.0', 'os': 'OS X', 'os_version': 'El Capitan', 'resolution': '1600x1200'}
]
SAUCE_DESKTOP = [
    {'browserName': "chrome", 'platform': "Windows 8", 'version': "48.0"},
    {'browserName': "internet explorer", 'platform': "Windows 10", 'version': "11.103"},
    {'browserName': "firefox", 'platform': "OS X 10.10", 'version': "44.0"},
    {'browserName': "safari", 'platform': "OS X 10.11", 'version': "9.0"}
]
SAUCE_MOBILE = [
    {'browserName': "iPhone", 'platform':"OS X 10.10", 'version': "9.2", 'deviceName': "iPhone 5s", 'deviceOrientation':"portrait"},
    {'browserName': "iPhone", 'platform':"OS X 10.10", 'version': "9.2", 'deviceName': "iPad2", 'deviceOrientation':"portrait"},
    {'browserName': "android", 'deviceName': "Samsung Galaxy S4 Emulator", 'deviceOrientation':  "portrait"}
]

"""
    {'browser': 'IE', 'browser_version': '10.0', 'os': 'Windows', 'os_version': '8', 'resolution': '1024x768'},
    {'browser': 'Chrome', 'browser_version': '48.0', 'os': 'OS X', 'os_version': 'Yosemite', 'resolution': '1024x768'},
    {'browser': 'Firefox', 'browser_version': '44.0', 'os': 'Windows', 'os_version': '10', 'resolution': '1920x1080'},
    {'browser': 'Firefox', 'browser_version': '43.0', 'os': 'Windows', 'os_version': '10', 'resolution': '1024x768'},
    {'browser': 'Chrome', 'browser_version': '47.0', 'os': 'OS X', 'os_version': 'Yosemite', 'resolution': '1024x768'},
    {'browser': 'Safari', 'browser_version': '9.0', 'os': 'OS X', 'os_version': 'El Capitan', 'resolution': '1024x768'},
"""

# According to https://www.browserstack.com/test-on-the-right-mobile-devices
BS_MOBILE = [
    {'browserName': 'iPhone', 'platform': 'MAC', 'device': 'iPhone 5S'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Samsung Galaxy S5'},
    {'browserName': 'iPad', 'platform': 'MAC', 'device': 'iPad Air 2'}
]

"""
    {'browserName': 'iPhone', 'platform': 'MAC', 'device': 'iPhone 6S'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Google Nexus 7'},
    {'browserName': 'iPhone', 'platform': 'MAC', 'device': 'iPhone 6 Plus'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Samsung Galaxy Note 3'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Google Nexus 5'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Samsung Galaxy S5'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Amazon Kindle Fire HD 8.9'},
    {'browserName': 'iPad', 'platform': 'MAC', 'device': 'iPad Mini 2'}
"""
