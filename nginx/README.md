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

```python

ALLOWED_HOSTS = [
    "localsefaria.org",
    "sheets.localsefaria.org",
]

# Make session & CSRF cookies valid for any subdomain of localsefaria.org
SESSION_COOKIE_DOMAIN = ".localsefaria.org"
CSRF_COOKIE_DOMAIN    = ".localsefaria.org"

# In local development over HTTP, these must be False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE    = False

# If you run on two hosts, you may need to trust both for CSRF
CSRF_TRUSTED_ORIGINS = [
    "http://localsefaria.org",
    "http://sheets.localsefaria.org",
]
```

After updating settings, clear any existing cookies in your browser or use a private/incognito window to avoid stale cookies.

---

## 3. Install and Configure NGINX

### 3.1 Install NGINX via Homebrew

```bash
brew install nginx
```

### 3.2 Create Your Local NGINX Include File

Inside your project repo, you will find the file:

```
~/Sefaria-Project/nginx/local_nginx.conf
```

Add your custom server blocks there. For example:

```nginx
# local_nginx.conf

server {
    listen 80;
    server_name localsefaria.org;

    # Redirect /sheets and all subpaths to the sheets subdomain
    location ~ ^/sheets(/.*)?$ {
        return 301 http://sheets.localsefaria.org$1;
    }

    # Proxy all other requests to Django on port 8000
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}

server {
    listen 80;
    server_name sheets.localsefaria.org;

    # Redirect static files back to the main domain
    location ^~ /static/ {
        return 301 http://localsefaria.org$request_uri;
    }

    # Redirect login to main domain (preserving query)
    location = /login {
        return 301 http://localsefaria.org$request_uri;
    }

    # Proxy API calls to main domain's Django API
    location ^~ /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # Serve the sheets app at the root of this subdomain
    location / {
        proxy_pass        http://127.0.0.1:8000/sheets/;
        proxy_set_header  Host               $host;
        proxy_set_header  X-Real-IP          $remote_addr;
        proxy_set_header  X-Forwarded-For    $proxy_add_x_forwarded_for;
        proxy_set_header  X-Forwarded-Proto  $scheme;
        proxy_redirect    /sheets/           /;
    }
}
```

### 3.3 Include Your File in the Main NGINX Config

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

## 4. Run and Reload NGINX

After any change to the NGINX config, always test and reload:

```bash
sudo nginx -t -c /opt/homebrew/etc/nginx/nginx.conf
sudo nginx -s reload -c /opt/homebrew/etc/nginx/nginx.conf
```

If the test (`nginx -t`) reports errors, fix them before reloading.

---

## 5. Start Your Django Server

You should now be able to visit:

- `http://localsefaria.org/`
- `http://sheets.localsefaria.org/`

without requiring separate logins or ports in the URL.

---

## Troubleshooting

- **502 Bad Gateway**: Ensure Django is running on port 8000 and `lsof -i :8000` shows it listening.
- **NXDOMAIN**: Verify `/etc/hosts` entries and flush DNS cache.
