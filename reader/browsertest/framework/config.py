from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

from creds import BS_USER, BS_KEY
REMOTE_URL = "http://test.sefaria.org"
LOCAL_URL = "http://localhost:8000"

# According to http://gs.statcounter.com/#browser_version-ww-monthly-201602-201604-bar
DESKTOP = [
    {'browser': 'Chrome', 'browser_version': '49.0', 'os': 'Windows', 'os_version': '8', 'resolution': '1920x1080'},
    {'browser': 'IE', 'browser_version': '11.0', 'os': 'Windows', 'os_version': '10', 'resolution': '1024x768'},
    {'browser': 'IE', 'browser_version': '10.0', 'os': 'Windows', 'os_version': '8', 'resolution': '1024x768'},
    {'browser': 'Chrome', 'browser_version': '48.0', 'os': 'OS X', 'os_version': 'Yosemite', 'resolution': '1024x768'},
    {'browser': 'Firefox', 'browser_version': '45.0', 'os': 'OS X', 'os_version': 'Yosemite', 'resolution': '1920x1080'},
    {'browser': 'Firefox', 'browser_version': '44.0', 'os': 'Windows', 'os_version': '10', 'resolution': '1920x1080'},
    {'browser': 'Firefox', 'browser_version': '43.0', 'os': 'Windows', 'os_version': '10', 'resolution': '1024x768'},
    {'browser': 'Chrome', 'browser_version': '47.0', 'os': 'OS X', 'os_version': 'Yosemite', 'resolution': '1024x768'},
    {'browser': 'Safari', 'browser_version': '9.0', 'os': 'OS X', 'os_version': 'El Capitan', 'resolution': '1024x768'},
    {'browser': 'Safari', 'browser_version': '9.0', 'os': 'OS X', 'os_version': 'El Capitan', 'resolution': '1600x1200'}
]

# According to https://www.browserstack.com/test-on-the-right-mobile-devices
MOBILE = [
    {'browserName': 'iPhone', 'platform': 'MAC', 'device': 'iPhone 5S'},
    {'browserName': 'iPhone', 'platform': 'MAC', 'device': 'iPhone 6S'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Samsung Galaxy S5'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Google Nexus 7'},
    {'browserName': 'iPad', 'platform': 'MAC', 'device': 'iPad Air 2'},
    {'browserName': 'iPhone', 'platform': 'MAC', 'device': 'iPhone 6 Plus'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Samsung Galaxy Note 3'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Google Nexus 5'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Samsung Galaxy S5'},
    {'browserName': 'android', 'platform': 'ANDROID', 'device': 'Amazon Kindle Fire HD 8.9'},
    {'browserName': 'iPad', 'platform': 'MAC', 'device': 'iPad Mini 2'}
]

