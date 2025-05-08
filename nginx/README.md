**Local Development Setup for Sefaria with Subdomains**

This README explains how to set up your local development environment to use the two custom hostnames:

- `http://localsefaria.org`
- `http://sheets.localsefaria.org`

---

## Prerequisites

- macOS
- Homebrew
- Python 3.x and a virtual environment (venv or similar)
- Django project cloned locally (e.g., at `~/dev/Sefaria-Project`)
- NGINX installed via Homebrew

---

## 1. Update Your Hosts File

Add entries so that both custom domains resolve to your local machine.

1. Open your hosts file in an editor:
   ```bash
   sudo nano /etc/hosts
   ```

2. Add the following lines at the end:
   ```text
   127.0.0.1   localsefaria.org
   127.0.0.1   sheets.localsefaria.org
   ```

3. Save and exit (`Ctrl+X`, then `Y`, then `Enter`).

4. Flush the DNS cache:
   ```bash
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   ```

---

## 2. Configure Django Cookie Settings

In your Django project's `local_settings.py`, ensure that session and CSRF cookies are valid across the apex domain and subdomains.
You can uncomment the `ALLOWED_HOSTS` that are commented out and all the SUBDOMAIN block.
Then you can skip to #3. If you already have changes and not sure what should be done continue here:

```python

ALLOWED_HOSTS = [
    "localsefaria.org",
    "sheets.localsefaria.org",
]

# Make session & CSRF cookies valid for any subdomain of localsefaria.org
SESSION_COOKIE_DOMAIN = ".localsefaria.org"
CSRF_COOKIE_DOMAIN    = ".localsefaria.org"

# In local development over HTTPS, these must be True
# If you want to develop cookies localhost:8000 set to False 
USE_HTTPS = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE    = True

SECURE_SSL_REDIRECT = False

# For localhost testing with self-signed certs
SECURE_BROWSER_XSS_FILTER = True
SECURE_CONTENT_TYPE_NOSNIFF = True

# If you run on two hosts, you may need to trust both for CSRF
CSRF_TRUSTED_ORIGINS = [
    "http://localsefaria.org",
    "http://sheets.localsefaria.org",
]
```

After updating settings, clear any existing cookies in your browser or use a private/incognito window to avoid stale cookies.

---

## 3. Create SSL files

### 3.1 Create ssl folder
In Sefaria-Project/nginx
```
mkdir ssl
cd ssl
```

### 3.2 Create san.cnf
```
cat > san.cnf <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
req_extensions     = req_ext
distinguished_name = dn

[dn]
C  = US
ST = Local
L  = Dev
O  = Dev
CN = localsefaria.org

[req_ext]
subjectAltName = @alt_names

[alt_names]
DNS.1 = localsefaria.org
DNS.2 = sheets.localsefaria.org
EOF
```

### 3.3 Create localsefaria key and crt
```
openssl req -x509 -nodes -days 365 \
  -newkey rsa:2048 \
  -keyout localsefaria.key \
  -out localsefaria.crt \
  -config san.cnf \
  -extensions req_ext
```

### 3.4 Trust the certificate on your system
On Mac:
1. Open Keychain Access.
2. Import localsefaria.crt into System keychain - File > Import Items > Select your localsefaria.crt
3. Right-click → Get Info → Expand Trust → Set "When using this certificate" to Always Trust.
4. Restart your browser.

On Debian/Ubuntu (wasn't checked):
```
sudo cp project-path/nginx/ssl/localsefaria.crt /usr/local/share/ca-certificates/
sudo update-ca-certificates
```

On Red Hat/CentOS/Fedora (wasn't checked):
```
sudo cp project-path/nginx/ssl/localsefaria.crt /usr/local/share/ca-certificates/
sudo update-ca-trust
```

Om Windows (wasn't checked):
```
certutil -addstore "Root" project-path\nginx\ssl\localsefaria.crt
```

---

## 4. Install and Configure NGINX

### 4.1 Install NGINX via Homebrew

```bash
brew install nginx
```

### 4.2 Create Your Local NGINX Include File

Inside your project repo, you will find the file:

```
~/Sefaria-Project/nginx/local_nginx.conf.example
```
Copy it to `~/Sefaria-Project/nginx/local_nginx.conf`
Change all `/your/Sefaria-Project/path` to your Sefaria-Project path

### 4.3 Include Your File in the Main NGINX Config

Open the main nginx config:

```bash
sudo nano /opt/homebrew/etc/nginx/nginx.conf
```

Inside the `http {}` block, add:

```nginx
    include       mime.types;
    default_type  application/octet-stream;

    # Include project-specific local config
    include /Users/akiva/dev/Sefaria-Project/nginx/local_nginx.conf;
```

Save and exit.

---

## 5. Run and Reload NGINX

After any change to the NGINX config, always test and reload:

```bash
sudo nginx -t -c /opt/homebrew/etc/nginx/nginx.conf
sudo nginx -s reload -c /opt/homebrew/etc/nginx/nginx.conf
```

If the test (`nginx -t`) reports errors, fix them before reloading.

---

## 6. Start Your Django Server

You should now be able to visit:

- `http://localsefaria.org/`
- `http://sheets.localsefaria.org/`

without requiring separate logins or ports in the URL.

---

## Troubleshooting

- **502 Bad Gateway**: Ensure Django is running on port 8000 and `lsof -i :8000` shows it listening.
- **NXDOMAIN**: Verify `/etc/hosts` entries and flush DNS cache.
- **Check if NGINX is running**: Run the following command to check if NGINX is active:
  ```bash
  ps aux | grep nginx
  ```
  If NGINX is running, you should see processes like `nginx: master process` and `nginx: worker process`. If not, start it with:
  ```bash
  sudo nginx -c /opt/homebrew/etc/nginx/nginx.conf
  ```