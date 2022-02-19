{{/*
Create the name of the local-settings secret
*/}}
{{/*{{- define "localSettings.env" }} 
{{- range $key, $val := $.Values.localSettings }}
          - name: {{ $key }}
            valueFrom:
              configMapKeyRef:
                name: local-settings-{{ $.Values.deployEnv }}
                key: {{ $key }}
{{- end }}
{{- end }}
*/}}

{{- define "secrets.localSettings" -}} 
{{- if .Values.secrets.localSettings.ref }}
{{- .Values.secrets.localSettings.ref }}
{{- else -}}
local-settings-secrets-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.googleClient" }} 
{{- if .Values.web.secrets.googleClient.ref -}}
{{- .Values.web.secrets.googleClient.ref }}
{{- else -}}
google-client-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.backupManager" }} 
{{- if .Values.secrets.backupManager.ref -}}
{{- .Values.secrets.backupManager.ref }}
{{- else -}} 
backup-manager-secret-{{ .Values.deployEnv }} 
{{- end }}
{{- end }}

{{- define "secrets.logging" }} 
{{- if .Values.web.secrets.logging.ref -}}
{{- .Values.web.secrets.logging.ref }}
{{- else -}}
logging-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.varnish" }} 
{{- if .Values.varnish.secrets.varnish.ref -}}
{{- .Values.varnish.secrets.varnish.ref }}
{{- else -}}
varnish-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.schoolLookup" }} 
{{- if .Values.web.secrets.schoolLookup.ref -}}
{{- .Values.web.secrets.schoolLookup.ref }}
{{- else -}}
school-lookup-data-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.slackWebhook" }} 
{{- if .Values.secrets.slackWebhook.ref -}}
{{- .Values.secrets.slackWebhook.ref }}
{{- else -}}
slack-webhook-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.originTls" }} 
{{- if .Values.ingress.secrets.originTls.ref -}}
{{- .Values.ingress.secrets.originTls.ref }}
{{- else -}}
origin-tls-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.originIlTls" }} 
{{- if .Values.ingress.secrets.originIlTls.ref -}}
{{- .Values.ingress.secrets.originIlTls.ref }}
{{- else -}}
origin-il-tls-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "mongoSnapshotLocation" }} 
{{- if .Values.mongoSnapshotLocation -}}
{{- .Values.mongoSnapshotLocation }}
{{- else -}}
gs://sefaria-mongo-backup/private_dump_small_{{ now | date "02.01.06" }}.tar.gz
{{- end }}
{{- end }}
