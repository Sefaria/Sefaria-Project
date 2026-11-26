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

  # Caller-classification fields for the access log. Each map outputs a short
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

  # apiKeyScrub: the access log never records a key from a query string. Each pass replaces the value of one
  # api_key or apikey parameter in the query part only (after the first question mark) with [REDACTED], through the next ampersand or the end (a raw hash included). A name counts only at
  # the start of the query or right after an ampersand, never after a later question mark. Every letter
  # and the underscore of the name may be literal (any case) or percent-encoded (any hex case); the key name and every
  # other parameter stay. The lookahead skips a value a previous pass already redacted, so three passes cover three occurrences.
  # The last parameter map fails closed: if a raw value is still present it logs [REDACTED-URI] (or [REDACTED-REFERER]).
  # keyTokenScrub: after the parameter passes, a second chain redacts a whole API key token anywhere in the string
  # (path, any parameter, after a hash), for example a key pasted into an admin search box (?q=sfr_...). A token is
  # sfr_ (each character literal in any case, percent-encoded, or double-encoded as in sfr%255F; the token must not continue a longer name, so it follows the start of the string or a character that is not a letter, digit or underscore, or an encoded byte) followed by 7 or more body units, a unit being one letter or digit or one
  # percent-encoded byte (a percent sign and two hex digits, any case), so ?q=sfr_%41 plus 31 letters is caught; a
  # shorter body is the non-secret display prefix and stays. Each pass replaces the first token with [REDACTED-KEY],
  # three passes cover three tokens, and a final map fails closed: a token still present logs [REDACTED-URI] or
  # [REDACTED-REFERER]. The pattern is anchored, with one lazy dot-star and no nested quantifiers (the two alternatives of a body unit start with different characters, so a unit has one way to match), so cost is linear
  # in the length of the string. requestUrl and referer use the final maps' output. In a replacement a capture
  # must be followed by a character that cannot be part of a name, hence the bracket. No Helm braces and no
  # dollar-brace names here: this file goes through Helm tpl and envsubst.
  map $request_uri $uri_scrub_1 {
    "~*^(?<pre>[^?]*\?(?:[^&]*&)*?(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=)(?!\[REDACTED\](?:&|$))[^&]*(?<post>.*)$" "$pre[REDACTED]$post";
    default $request_uri;
  }
  map $uri_scrub_1 $uri_scrub_2 {
    "~*^(?<pre>[^?]*\?(?:[^&]*&)*?(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=)(?!\[REDACTED\](?:&|$))[^&]*(?<post>.*)$" "$pre[REDACTED]$post";
    default $uri_scrub_1;
  }
  map $uri_scrub_2 $uri_scrub_3 {
    "~*^(?<pre>[^?]*\?(?:[^&]*&)*?(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=)(?!\[REDACTED\](?:&|$))[^&]*(?<post>.*)$" "$pre[REDACTED]$post";
    default $uri_scrub_2;
  }
  map $uri_scrub_3 $uri_scrub_4 {
    "~*^[^?]*\?(?:[^&]*&)*?(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=(?!\[REDACTED\](?:&|$))" "[REDACTED-URI]";
    default $uri_scrub_3;
  }
  map $uri_scrub_4 $uri_key_1 {
    "~*^(?<pre>.*?)(?:(?<![a-z0-9_])|(?<=%[0-9a-f]{2}))(?:s|%73|%2573)(?:f|%66|%2566)(?:r|%72|%2572)(?:_|%5f|%255f)(?:[a-z0-9]|%[0-9a-f]{2}){7,}(?<post>.*)$" "$pre[REDACTED-KEY]$post";
    default $uri_scrub_4;
  }
  map $uri_key_1 $uri_key_2 {
    "~*^(?<pre>.*?)(?:(?<![a-z0-9_])|(?<=%[0-9a-f]{2}))(?:s|%73|%2573)(?:f|%66|%2566)(?:r|%72|%2572)(?:_|%5f|%255f)(?:[a-z0-9]|%[0-9a-f]{2}){7,}(?<post>.*)$" "$pre[REDACTED-KEY]$post";
    default $uri_key_1;
  }
  map $uri_key_2 $uri_key_3 {
    "~*^(?<pre>.*?)(?:(?<![a-z0-9_])|(?<=%[0-9a-f]{2}))(?:s|%73|%2573)(?:f|%66|%2566)(?:r|%72|%2572)(?:_|%5f|%255f)(?:[a-z0-9]|%[0-9a-f]{2}){7,}(?<post>.*)$" "$pre[REDACTED-KEY]$post";
    default $uri_key_2;
  }
  map $uri_key_3 $request_uri_scrubbed {
    "~*(?:(?<![a-z0-9_])|(?<=%[0-9a-f]{2}))(?:s|%73|%2573)(?:f|%66|%2566)(?:r|%72|%2572)(?:_|%5f|%255f)(?:[a-z0-9]|%[0-9a-f]{2}){7,}" "[REDACTED-URI]";
    default $uri_key_3;
  }
  map $http_referer $referer_scrub_1 {
    "~*^(?<pre>[^?]*\?(?:[^&]*&)*?(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=)(?!\[REDACTED\](?:&|$))[^&]*(?<post>.*)$" "$pre[REDACTED]$post";
    default $http_referer;
  }
  map $referer_scrub_1 $referer_scrub_2 {
    "~*^(?<pre>[^?]*\?(?:[^&]*&)*?(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=)(?!\[REDACTED\](?:&|$))[^&]*(?<post>.*)$" "$pre[REDACTED]$post";
    default $referer_scrub_1;
  }
  map $referer_scrub_2 $referer_scrub_3 {
    "~*^(?<pre>[^?]*\?(?:[^&]*&)*?(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=)(?!\[REDACTED\](?:&|$))[^&]*(?<post>.*)$" "$pre[REDACTED]$post";
    default $referer_scrub_2;
  }
  map $referer_scrub_3 $referer_scrub_4 {
    "~*^[^?]*\?(?:[^&]*&)*?(?:a|%61|%41)(?:p|%70|%50)(?:i|%69|%49)(?:_|%5f)?(?:k|%6b|%4b)(?:e|%65|%45)(?:y|%79|%59)=(?!\[REDACTED\](?:&|$))" "[REDACTED-REFERER]";
    default $referer_scrub_3;
  }
  map $referer_scrub_4 $referer_key_1 {
    "~*^(?<pre>.*?)(?:(?<![a-z0-9_])|(?<=%[0-9a-f]{2}))(?:s|%73|%2573)(?:f|%66|%2566)(?:r|%72|%2572)(?:_|%5f|%255f)(?:[a-z0-9]|%[0-9a-f]{2}){7,}(?<post>.*)$" "$pre[REDACTED-KEY]$post";
    default $referer_scrub_4;
  }
  map $referer_key_1 $referer_key_2 {
    "~*^(?<pre>.*?)(?:(?<![a-z0-9_])|(?<=%[0-9a-f]{2}))(?:s|%73|%2573)(?:f|%66|%2566)(?:r|%72|%2572)(?:_|%5f|%255f)(?:[a-z0-9]|%[0-9a-f]{2}){7,}(?<post>.*)$" "$pre[REDACTED-KEY]$post";
    default $referer_key_1;
  }
  map $referer_key_2 $referer_key_3 {
    "~*^(?<pre>.*?)(?:(?<![a-z0-9_])|(?<=%[0-9a-f]{2}))(?:s|%73|%2573)(?:f|%66|%2566)(?:r|%72|%2572)(?:_|%5f|%255f)(?:[a-z0-9]|%[0-9a-f]{2}){7,}(?<post>.*)$" "$pre[REDACTED-KEY]$post";
    default $referer_key_2;
  }
  map $referer_key_3 $referer_scrubbed {
    "~*(?:(?<![a-z0-9_])|(?<=%[0-9a-f]{2}))(?:s|%73|%2573)(?:f|%66|%2566)(?:r|%72|%2572)(?:_|%5f|%255f)(?:[a-z0-9]|%[0-9a-f]{2}){7,}" "[REDACTED-REFERER]";
    default $referer_key_3;
  }

  # https://nginx.org/en/docs/varindex.html
  log_format structured escape=json '{ "requestDuration": $request_time, "envName": "${ENV_NAME}", "stackComponent": "nginx", "host": "$hostname", "severity": "info", "httpRequest": { "requestMethod": "$request_method", "requestUrl": "$request_uri_scrubbed", "requestSize": $request_length, "status":  $status, "responseSize": $body_bytes_sent, "userAgent":  "$http_user_agent", "remoteIp": "$http_x_original_forwarded_for", "referer": "$referer_scrubbed", "latency": ${request_time}, "protocol": "$server_protocol", "forwardedHTTP": "$http_x_forwarded_proto" }, "remoteUser": "$remote_user", {{ if and .Values.authService.enabled .Values.authService.nginxLogFields }}"sefariaProject": "$http_x_sefaria_project", "sefariaTier": "$http_x_sefaria_tier", "sefariaAuthResult": "$http_x_sefaria_auth_result", {{ end }}"apiClassification": { "secFetch": "$sec_fetch", "origin": "$http_origin", "credentialTransport": "$credential_transport", "varnishCache": "$varnish_cache", "sessionCookie": $session_cookie }, "timeLocal": "$time_local" }';
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

{{ if and .Values.authService.enabled .Values.gateway.enabled }}  # keyStatus: ext_authz sends x-sefaria-key-status: not_accepted when a bad key was answered as anonymous
  # (ungated, or observe mode). Echo it to the caller; Access-Control-Expose-Headers lets browsers read it cross-origin.
  # Rendered only when authService and the gateway are enabled: only then does the listener strip client copies (clienttrafficpolicy).
  map $http_x_sefaria_key_status $key_status {
    not_accepted  not_accepted;
    default       "";
  }
  add_header x-sefaria-key-status $key_status always;
  add_header Access-Control-Expose-Headers 'x-sefaria-key-status' always;
{{ end }}
  upstream varnishupstream {
    server ${VARNISH_HOST}:8040;
    keepalive 32;
  }

  {{- if eq .Values.nodejs.mode "reader" }}
  # the new reader client (values: nodejs.mode reader) answers page requests first
  upstream nodeupstream {
    server node-{{ .Values.deployEnv }}:3000;
    keepalive 32;
  }
  {{- else if eq .Values.nodejs.mode "optin" }}
  # nodejs.mode optin: the new reader client runs beside the legacy node pods; it answers the page requests of a visitor who chose
  # it in account settings (the reader_version=next cookie, set by Django); everyone else is served exactly as in legacy mode
  upstream readerupstream {
    server reader-{{ .Values.deployEnv }}:3000;
    keepalive 32;
  }
  {{- if .Values.reader.optin.enabled }}
  # "1" for a page request that goes to the new reader (location / hands it to @reader); empty for everyone else. Three ways in:
  #  - reader_version=next: the reader opted in (set by Django, sefaria/helper/reader_choice.py);
  #  - follow=<session id> (43 base62 characters): a follow-me link, which only the new reader can open — whoever opens it, opted in
  #    or not, signed in or not; otherwise a guest outside the opt-in lands on legacy, which drops the parameter without a word;
  #  - reader_follow=1: the new reader set it while this browser is in a follow session (reader-next follow/params.ts), so a reload
  #    keeps the guest in the session once the reader has taken `follow` out of the address.
  #  - /social or /social/…: Social's pages, which only the new reader has (legacy Django 404s them) — whoever opens them;
  #  - reader_social=1: the new reader sets it on a Social page (reader-next src/features/shell/social-optin.ts), so whoever came
  #    in through Social stays in the new reader. Django never touches it (ReaderChoiceMiddleware manages only reader_version).
  map "$cookie_reader_version|$cookie_reader_follow|$cookie_reader_social|$uri|$arg_follow" $reader_page {
    default                                   "";
    "~^next\|"                                1;
    "~^[^|]*\|1\|"                            1;
    "~^[^|]*\|[^|]*\|1\|"                     1;
    "~^[^|]*\|[^|]*\|[^|]*\|/social(/|\|)"    1;
    "~\|[0-9A-Za-z]{43}$"                     1;
  }
  {{- else }}
  # reader.optin.enabled is false (the kill switch): the cookie is ignored, location / is legacy's, and the reader rollout keeps
  # running (reader-next/docs/DEPLOYMENT.md, "Kill switch and rollback")
  {{- end }}
  {{- end }}

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
    if ( $request_method !~ ^(GET|POST|HEAD|PUT|PATCH|DELETE|OPTIONS)$ ) {
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
{{ if and $.Values.authService.enabled $.Values.gateway.enabled }}      add_header x-sefaria-key-status $key_status always;
      add_header Access-Control-Expose-Headers 'x-sefaria-key-status' always;
{{ end }}      proxy_pass http://elasticsearch_upstream/;
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

    {{- if eq $.Values.nodejs.mode "reader" }}
    # nodejs.mode reader: pages go to the new reader client first; it hands what it does not render (Django's pages, its 404s,
    # writes) to Varnish. A reader that cannot be reached: see @reader_down. A response the reader sends itself (its 503 too) is
    # passed on as it is (no proxy_intercept_errors).
    location / {
      {{- if $.Values.instrumentation.enabled }}
      opentracing on;
      opentracing_propagate_context;
      {{- end }}
      # a reader that cannot be reached (scaled to zero, no endpoints) is given up on within seconds, not nginx's default 60
      proxy_connect_timeout 5s;
      proxy_send_timeout  300;
      proxy_read_timeout  300;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Port 443;
      proxy_set_header X-Forwarded-Host $host;
      proxy_set_header X-Internal-Proxy 1;
      proxy_set_header X-Request-Id $request_id;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_pass http://nodeupstream;
      error_page 502 504 = @reader_down;
    }

    # The API never needs the client
    location /api/ {
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
      proxy_set_header X-Request-Id $request_id;
      proxy_pass http://varnishupstream;
    }

    {{- else }}

    location / {
      {{- if and (eq $.Values.nodejs.mode "optin") $.Values.reader.optin.enabled }}
      # nodejs.mode optin: a visitor who chose the new reader ($reader_page: the reader_version cookie, follow me, Social) is handed to @reader;
      # for everyone else this location is legacy's, unchanged (no other error_page here, so recursive_error_pages only lets
      # @reader's own error_page work: nginx checks it in the location where the first error_page fired)
      recursive_error_pages on;
      error_page 418 = @reader;
      if ($reader_page) {
        return 418;
      }
      {{- end }}
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

    {{- end }}

    {{- if or (eq $.Values.nodejs.mode "reader") (eq $.Values.nodejs.mode "optin") }}
    {{- if eq $.Values.nodejs.mode "optin" }}

    # optin: the API never goes to the reader, cookie or not (legacy's location / body, without the cookie check)
    location /api/ {
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
      proxy_set_header X-Request-Id $request_id;
      proxy_pass http://varnishupstream;
    }

    # optin: an opted-in visitor's page request. The reader renders it, or hands it (Django's pages, its 404s, writes) to Varnish.
    # A response the reader sends itself (its 503 too) is passed on as it is (no proxy_intercept_errors); nginx's own 502/504 (the
    # reader cannot be reached or timed out) goes to @reader_down.
    location @reader {
      {{- if $.Values.instrumentation.enabled }}
      opentracing on;
      opentracing_propagate_context;
      {{- end }}
      proxy_connect_timeout 5s;
      proxy_send_timeout  300;
      proxy_read_timeout  300;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Port 443;
      proxy_set_header X-Forwarded-Host $host;
      proxy_set_header X-Internal-Proxy 1;
      proxy_set_header X-Request-Id $request_id;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_pass http://readerupstream;
      error_page 502 504 = @reader_down;
    }

    # The reader's own hashed bundles (Django has no /assets/): always from the reader, cookie or not, so a reader page that is
    # already open keeps loading its lazy chunks after its reader left the opt-in or the kill switch was thrown (it lands on the
    # legacy reader at its next full page load). If the reader is down, Varnish/Django answers (a 404).
    location /assets/ {
      proxy_connect_timeout 5s;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-Port 443;
      proxy_set_header X-Forwarded-Host $host;
      proxy_set_header X-Internal-Proxy 1;
      proxy_set_header X-Request-Id $request_id;
      proxy_http_version 1.1;
      proxy_set_header Connection "";
      proxy_pass http://readerupstream;
      error_page 502 504 = @reader_down;
    }
    {{- end }}

    # The reader could not be reached (nginx's own 502/504): a read is answered by Varnish/Django instead; a write is never
    # replayed (the reader may already have passed it on), so it gets the 502
    location @reader_down {
      if ($request_method !~ ^(GET|HEAD)$) {
        return 502;
      }
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
      proxy_set_header X-Request-Id $request_id;
      proxy_pass http://varnishupstream;
    }
    {{- end }}

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
    {{- if or (eq $.Values.nodejs.mode "reader") (eq $.Values.nodejs.mode "optin") }}

    # Django's own pages (DJANGO_PREFIXES in reader-next/src/lib/routing/django-paths.ts, except /api/ and /static/, which have their
    # own locations) and the site's well-known files go straight to Varnish: the reader client would only pass them on (or first try
    # to render a favicon). Generated: templates/_reader-django-paths.tpl (build/ci/reader-nginx-paths.mjs; CI checks it is current).
    # After the module redirects above on purpose: regex locations are tried in order, so those keep their 307s.
    location ~ "{{ include "sefaria.readerDjangoPathRegex" $ }}" {
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
      proxy_set_header X-Request-Id $request_id;
      proxy_pass http://varnishupstream;
    }
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
    if ( $request_method !~ ^(GET|POST|HEAD|PUT|PATCH|DELETE|OPTIONS)$ ) {
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
{{ if and $.Values.authService.enabled $.Values.gateway.enabled }}      add_header x-sefaria-key-status $key_status always;
      add_header Access-Control-Expose-Headers 'x-sefaria-key-status' always;
{{ end }}      proxy_pass http://elasticsearch_upstream/;
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

