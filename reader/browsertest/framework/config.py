from selenium.webdriver.common.desired_capabilities import DesiredCapabilities

BS_MAX_THREADS = 2
SAUCE_MAX_THREADS = 5

LOCAL_URL = "http://localhost:8000"

TEMPER = 15  # default wait time in seconds
# According to http://gs.statcounter.com/#browser_version-ww-monthly-201602-201604-bar
# According to https://www.browserstack.com/test-on-the-right-mobile-devices

SAUCE_CORE_CAPS = [
#    {'browserName': "firefox", 'platform': "macOS 10.15", 'version': "latest",
#     'sauce:options': {'screenResolution': '1920x1440'},
#     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'FF/x15', "extendedDebugging": True},

#    {'browserName': "safari", 'platform': "macOS 10.14", 'version': "latest",
#     'sauce:options': {'screenResolution': '1920x1440'},
#     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Sf/x14'},

    {'browserName': "chrome", 'platform': "Windows 10", 'browserVersion': "latest",
     'sauce:options': {'screenResolution': '1920x1080'},
     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Cr/w10', "extendedDebugging": True},

    #{'browserName': "firefox", 'platform': "Windows 10", 'version': "latest", "screenResolution": "1920x1080",
    #    'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'FF/w10'},

    #{'browserName': "MicrosoftEdge", 'platform': "Windows 10", 'version': "latest",
    #    'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Edg/w10'},

    {'deviceName': "Google Pixel 3a XL GoogleAPI Emulator", 'platformName': 'Android', 'platformVersion': '11.0',
     'browserName': 'Chrome', 'appiumVersion': '1.20.2', 'deviceOrientation': "portrait",
     'sefaria_mode': 'single_panel', 'sefaria_short_name': 'And/11.0'},

    {'browserName': "Safari", 'platformName': "iOS", 'deviceName': "iPhone 12 Simulator",
    'appiumVersion': "1.20.1", 'platformVersion': "14.3", 'deviceOrientation': "portrait",
     'sefaria_mode': 'single_panel', 'sefaria_short_name': 'iPh12'},

]

LOCAL_SELENIUM_CAPS = [
    {'browserName': "chrome", 'platform': 'Linux', 'version': "latest", "screenResolution": "1920x1440",
     'sefaria_mode': 'multi_panel', 'sefaria_short_name': 'Cr/Lnx', "extendedDebugging": True},
]
