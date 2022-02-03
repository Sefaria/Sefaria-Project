{{/*
Create the name of the local-settings secret
*/}}
{{- define "secrets.localSettings" -}} # {{- template "secrets.localSettings" . }}
{{- if .Values.secrets.localSettings.ref }}
{{ .Values.secrets.localSettings.ref }}
{{- else }}
local-settings-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.googleClient" -}} # {{- template "secrets.googleClient" . }}
{{- if .Values.web.secrets.googleClient.ref }}
{{- .Values.web.secrets.googleClient.ref }}
{{- else }} google-client-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.backupManager" -}} # {{- template "secrets.backupManager" . }}
{{- if .Values.secrets.backupManager.ref }}
{{- .Values.secrets.backupManager.ref }}
{{- else }} 
backup-manager-secret-{{ .Values.deployEnv }} 
{{- end }}
{{- end }}

{{- define "secrets.logging" -}} # {{- template "secrets.logging" . }}
{{- if .Values.web.secrets.logging.ref }}
{{- .Values.web.secrets.logging.ref }}
{{- else }}
logging-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.varnish" -}} # {{- template "secrets.varnish" . }}
{{- if .Values.varnish.secrets.varnish.ref }}
{{- .Values.varnish.secrets.varnish.ref }}
{{- else }}
varnish-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.schoolLookup" -}} # {{- template "secrets.schoolLookup" . }}
{{- if .Values.web.secrets.schoolLookup.ref }}
{{- .Values.web.secrets.schoolLookup.ref }}
{{- else }}
school-lookup-data-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.slackWebhook" -}} # {{- template "secrets.slackWebhook" . }}
{{- if .Values.secrets.slackWebhook.data }}
{{- .Values.secrets.slackWebhook.data }}
{{- else }}
slack-webhook-{{ .Values.deployEnv }}
{{- end -}}
{{- end }}

{{- define "secrets.originTls" -}} # {{- template "secrets.originTls" . }}
{{- if .Values.ingress.secrets.originTls.ref }}
{{- .Values.ingress.secrets.originTls.ref }}
{{- else }}
origin-tls-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "secrets.originIlTls" -}} # {{- template "secrets.originIlTls" . }}
{{- if .Values.ingress.secrets.originIlTls.ref }}
{{- .Values.ingress.secrets.originIlTls.ref }}
{{- else }}
origin-il-tls-{{ .Values.deployEnv }}
{{- end }}
{{- end }}
