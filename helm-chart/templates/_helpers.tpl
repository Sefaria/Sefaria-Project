{{/*
Create the name of the local-settings secret
*/}}
{{- define "secrets.localSettingsName" -}}
{{- if .Values.secrets.localSettings.ref }}
{{ .Values.secrets.localSettings.ref }}
{{- else }}
local-settings-{{ .Values.deployEnv }}
{{- end }}
{{- end }}
