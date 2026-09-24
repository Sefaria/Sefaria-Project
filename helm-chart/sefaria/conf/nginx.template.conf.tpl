{{- if .Values.instrumentation.enabled }}
load_module /etc/nginx/modules/ngx_http_opentracing_module.so;
{{- end }}

user www-data;
worker_processes 8;

error_log  /var/log/nginx/error.log warn;
pid        /var/run/nginx.pid;

# https://serverfault.com/questions/787919/optimal-value-for-nginx-worker-connections
events {
  worker_connections 10240;
}

http {
  server_names_hash_bucket_size 128;

  {{- if .Values.instrumentation.enabled }}
  opentracing_load_tracer /usr/local/lib/libjaegertracing_plugin.so /etc/nginx/opentracing.json;
  {{- end }}

  # Caller-classification fields for the access log (sc-47234). Each map outputs a short
  # constant or a Sec-Fetch/Origin value, never a credential. No Helm template braces in
  # these maps: this file goes through Helm tpl.
  # secFetch: Sec-Fetch-Site/Mode/Dest as "site/mode/dest"; empty when the caller sends none.
  map "$http_sec_fetch_site/$http_sec_fetch_mode/$http_sec_fetch_dest" $sec_fetch {
    "//"    "";
    default "$http_sec_fetch_site/$http_sec_fetch_mode/$http_sec_fetch_dest";
  }

  # credentialTransport: which header or query parameter carried a credential (presence only).
  # Precedence when several are present: x-api-key, authorization, x-sefaria-api-key, query.
  map $arg_api_key$arg_apikey $credential_transport_query {
    ""      none;
    default query;
  }
  map $http_x_sefaria_api_key $credential_transport_sefaria {
    ""      $credential_transport_query;
    default x-sefaria-api-key;
  }
  map $http_authorization $credential_transport_authorization {
    ""      $credential_transport_sefaria;
    default authorization;
  }
  map $http_x_api_key $credential_transport {
    ""      $credential_transport_authorization;
    default x-api-key;
  }

  # varnishCache: Varnish sets X-Varnish to two ids on a cache hit and one id otherwise
  # (miss or pass). Empty means the response did not come through Varnish (search, static).
  map $upstream_http_x_varnish $varnish_cache {
    ""                 bypass;
    "~^[0-9]+ [0-9]+$" hit;
    default            miss;
  }

  # sessionCookie: presence of the Django session cookie. Logged unquoted as a JSON boolean.
  map $cookie_sessionid $session_cookie {
    ""      false;
    default true;
  }

  # https://nginx.org/en/docs/varindex.html
  log_format structured escape=json '{ "requestDuration": $request_time, "envName": "${ENV_NAME}", "stackComponent": "nginx", "host": "$hostname", "severity": "info", "httpRequest": { "requestMethod": "$request_method", "requestUrl": "$request_uri", "requestSize": $request_length, "status":  $status, "responseSize": $body_bytes_sent, "userAgent":  "$http_user_agent", "remoteIp": "$http_x_original_forwarded_for", "referer": "$http_referer", "protocol": "$server_protocol", "forwardedHTTP": "$http_x_forwarded_proto" }, "apiClassification": { "secFetch": "$sec_fetch", "origin": "$http_origin", "credentialTransport": "$credential_transport", "varnishCache": "$varnish_cache", "sessionCookie": $session_cookie }, "timeLocal": "$time_local" }';
  access_log /dev/stdout structured;
  client_max_body_size 32M;

  # Add CORS header only if not already set
  # For simple requests, only Access-Control-Allow-Origin is needed.
  # For more complex requests, we need more headers. CORS for these requests are handled in Django.
  map $sent_http_access_control_allow_origin $cors_header {
    ''      *;     # if ACAO not already set, use "*"
    default '';    # otherwise, make it empty so add_header emits nothing
  }
  add_header 'Access-Control-Allow-Origin' $cors_header always;

  upstream varnishupstream {
    server ${VARNISH_HOST}:8040;
    keepalive 32;
  }

  upstream elasticsearch_upstream {
    server ${SEARCH_HOST}:9200;
    keepalive 32;
  }

  server {
    listen 80;
    listen [::]:80;
    server_name ${INTERNAL_URL};

    location /nginx-health {
      access_log off;
      return 200 "healthy\n";
    }

    location / {
        proxy_pass http://varnishupstream;
    }
  }

  {{- range .Values.domains.root }}
  {{- $rootDomain := tpl .url $ | quote | trimAll "\"" }}
  {{- $code := .code }}
  {{- if kindIs "slice" .code }}
    {{- $code = index .code 0 }}
  {{- end }}
  {{- $wwwDomain := printf "www.%s" $rootDomain }}
  server {
    listen 80;
    listen [::]:80;
    server_name {{ $rootDomain }};

    location /apple-app-site-association {
      proxy_set_header Host {{ $wwwDomain }};
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Port 443;
      proxy_set_header X-Internal-Proxy 1;
      proxy_pass http://varnishupstream;
    }

    location /.well-known/apple-app-site-association {
      proxy_set_header Host {{ $wwwDomain }};
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Port 443;
      proxy_set_header X-Internal-Proxy 1;
      proxy_pass http://varnishupstream;
    }

    location / {
      return 301 https://{{ $wwwDomain }}$request_uri;
    }
  }

  server {
    listen 80;
    server_name {{ $wwwDomain }};
    listen [::]:80;
    # parameterize line below
    # Look into security cost of simply serving every host
    resolver 8.8.8.8 8.8.4.4;

    # Return error on forbidden methods
    if ( $request_method !~ ^(GET|POST|HEAD|PUT|DELETE|OPTIONS)$ ) {
      return 405;
    }

    # protect all non-allowed elasticsearch paths
    location ~ ^/api/search/(?!(text|sheet|merged|merged-c|topic|book|category)(/_search|/_analyze)/?) {
      return 403;
    }

    # allow urls which aren't caught by regex above
    location /api/search/ {
      rewrite ^/(?:api/search)/(.*)$ /$1 break;
      proxy_set_header Authorization "Basic ${ELASTIC_AUTH_HEADER}";
      add_header 'Access-Control-Allow-Origin' '';
      proxy_pass http://elasticsearch_upstream/;
    }

    location /nginx-health {
      access_log off;
      return 200 "healthy\n";
    }

    location /robots.txt {
      access_log off;
      autoindex on;
      alias /app/robots.txt;
    }

    location / {
      {{- if $.Values.instrumentation.enabled }}
      opentracing on;
      opentracing_propagate_context;
      {{- end }}
      proxy_send_timeout  300;
      proxy_read_timeout  300;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Port 443;
      proxy_set_header X-Internal-Proxy 1;
      proxy_pass http://varnishupstream;
    }

    location /static/mobile/message-en.json {
      return 301 ${STRAPI_LOCATION}/api/mobile-message;
    }

    location /static/mobile/message-he.json {
      return 301 ${STRAPI_LOCATION}/api/mobile-message-he;
    }

    location /static/ {
      access_log off;
      alias /app/static/;
      # root /app/static/;
    }

    location /static/sitemaps/ {
      access_log off;
      proxy_pass https://storage.googleapis.com/sefaria-sitemaps$request_uri;
    }

    {{- range $.Values.domains.modules }}
    {{- $subdomain := index .subdomains $code }}
    {{- if $subdomain }}
    {{- $subdomain := printf "%s.%s" $subdomain $rootDomain }}
    {{- range .redirects }}
    location ~ ^/{{ . }}(/.*|$) {
        return 307 https://{{ $subdomain }}/{{ . }}$1;
    }
    {{- end }}
    {{- end }}
    {{- end }}
  }

  {{- range $.Values.domains.modules }}
  {{- $subdomain := index .subdomains $code }}
  {{- if $subdomain }}

  server {
    listen 80;
    listen [::]:80;
    server_name {{ $subdomain }}.{{ $rootDomain }};

    # parameterize line below
    # Look into security cost of simply serving every host
    resolver 8.8.8.8 8.8.4.4;

    # Return error on forbidden methods
    if ( $request_method !~ ^(GET|POST|HEAD|PUT|DELETE|OPTIONS)$ ) {
      return 405;
    }

    # protect all non-allowed elasticsearch paths
    location ~ ^/api/search/(?!(text|sheet|merged|merged-c|topic|book|category)(/_search|/_analyze)/?) {
      return 403;
    }

    # allow urls which aren't caught by regex above
    location /api/search/ {
      rewrite ^/(?:api/search)/(.*)$ /$1 break;
      proxy_set_header Authorization "Basic ${ELASTIC_AUTH_HEADER}";
      add_header 'Access-Control-Allow-Origin' '';
      proxy_pass http://elasticsearch_upstream/;
    }

    location /nginx-health {
      access_log off;
      return 200 "healthy\n";
    }

    location /robots.txt {
      access_log off;
      autoindex on;
      alias /app/robots.txt;
    }

    location ~ ^/data\.\d+\.js$ {
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Internal-Proxy 1;
      proxy_pass http://varnishupstream;
    }

    location ~ /api/ {
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_set_header X-Internal-Proxy 1;
      proxy_pass http://varnishupstream;
    }

    location / {
      {{- if $.Values.instrumentation.enabled }}
      opentracing on;
      opentracing_propagate_context;
      {{- end }}
      proxy_send_timeout  300;
      proxy_read_timeout  300;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Port 443;
      proxy_set_header X-Internal-Proxy 1;
      proxy_pass http://varnishupstream;
    }

    location /static/mobile/message-en.json {
      return 301 ${STRAPI_LOCATION}/api/mobile-message;
    }

    location /static/mobile/message-he.json {
      return 301 ${STRAPI_LOCATION}/api/mobile-message-he;
    }

    location /static/ {
      access_log off;
      alias /app/static/;
      # root /app/static/;
    }

    location /static/sitemaps/ {
      access_log off;
      proxy_pass https://storage.googleapis.com/sefaria-sitemaps$request_uri;
    }
  } # server

  {{- end }}
  {{- end }}
  {{- end }}

  types {
    text/html                             html htm shtml;
    text/css                              css;
    text/xml                              xml rss;
    image/gif                             gif;
    image/jpeg                            jpeg jpg;
    image/svg+xml                         svg;
    application/x-javascript              js;
    text/plain                            txt;
    text/x-component                      htc;
    text/mathml                           mml;
    image/png                             png;
    image/x-icon                          ico;
    image/x-jng                           jng;
    image/vnd.wap.wbmp                    wbmp;
    application/java-archive              jar war ear;
    application/mac-binhex40              hqx;
    application/pdf                       pdf;
    application/x-cocoa                   cco;
    application/x-java-archive-diff       jardiff;
    application/x-java-jnlp-file          jnlp;
    application/x-makeself                run;
    application/x-perl                    pl pm;
    application/x-pilot                   prc pdb;
    application/x-rar-compressed          rar;
    application/x-redhat-package-manager  rpm;
    application/x-sea                     sea;
    application/x-shockwave-flash         swf;
    application/x-stuffit                 sit;
    application/x-tcl                     tcl tk;
    application/x-x509-ca-cert            der pem crt;
    application/x-xpinstall               xpi;
    application/zip                       zip;
    application/octet-stream              deb;
    application/octet-stream              bin exe dll;
    application/octet-stream              dmg;
    application/octet-stream              eot;
    application/octet-stream              iso img;
    application/octet-stream              msi msp msm;
    audio/mpeg                            mp3;
    audio/x-realaudio                     ra;
    video/mpeg                            mpeg mpg;
    video/quicktime                       mov;
    video/x-flv                           flv;
    video/x-msvideo                       avi;
    video/x-ms-wmv                        wmv;
    video/x-ms-asf                        asx asf;
    video/x-mng                           mng;
  } # types
} # http

