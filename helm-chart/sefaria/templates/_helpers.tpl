{{- define "sefaria.secrets.googleClient" }}
{{- if .Values.web.secrets.googleClient.ref -}}
{{- .Values.web.secrets.googleClient.ref }}
{{- else -}}
google-client-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.backupManager" }}
{{- if .Values.secrets.backupManager.ref -}}
{{- .Values.secrets.backupManager.ref }}
{{- else -}}
backup-manager-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.logging" }}
{{- if .Values.web.secrets.logging.ref -}}
{{- .Values.web.secrets.logging.ref }}
{{- else -}}
logging-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.varnish" }}
{{- if .Values.varnish.secrets.varnish.ref -}}
{{- .Values.varnish.secrets.varnish.ref }}
{{- else -}}
varnish-secret-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.schoolLookup" }}
{{- if .Values.web.secrets.schoolLookup.ref -}}
{{- .Values.web.secrets.schoolLookup.ref }}
{{- else -}}
school-lookup-data-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.slackWebhook" }}
{{- if .Values.secrets.slackWebhook.ref -}}
{{- .Values.secrets.slackWebhook.ref }}
{{- else -}}
slack-webhook-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.elasticCertificate" }}
{{- if .Values.web.secrets.elasticCertificate.ref -}}
{{- .Values.web.secrets.elasticCertificate.ref }}
{{- else -}}
elastic-certificate-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.elasticUser" }}
{{- if .Values.secrets.elasticUser.ref -}}
{{- .Values.secrets.elasticUser.ref }}
{{- else -}}
elastic-user-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.elasticAdmin" }}
{{- if .Values.secrets.elasticAdmin.ref -}}
{{- .Values.secrets.elasticAdmin.ref }}
{{- else -}}
elastic-admin-{{ .Values.deployEnv }}
{{- end }}
{{- end }}


{{- define "sefaria.secrets.originTls" }}
{{- if .Values.ingress.secrets.originTls.ref -}}
{{- .Values.ingress.secrets.originTls.ref }}
{{- else -}}
origin-tls-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.secrets.originIlTls" }}
{{- if .Values.ingress.secrets.originIlTls.ref -}}
{{- .Values.ingress.secrets.originIlTls.ref }}
{{- else -}}
origin-il-tls-{{ .Values.deployEnv }}
{{- end }}
{{- end }}

{{- define "sefaria.tarballName" }}
{{- if .Values.restore.tarball -}}
{{- .Values.restore.tarball }}
{{- else -}}
private_dump_small_{{ now | date "02.01.06" }}.tar.gz
{{- end }}
{{- end }}

{{/*
Expand the name of the chart.
*/}}
{{- define "sefaria.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this (by the DNS naming spec).
If release name contains chart name it will be used as a full name.
*/}}
{{- define "sefaria.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "sefaria.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "sefaria.labels" -}}
helm.sh/chart: {{ include "sefaria.chart" . }}
{{ include "sefaria.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "sefaria.selectorLabels" -}}
app.kubernetes.io/name: {{ include "sefaria.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Scheduling affinites applied to all pods
*/}}
{{- define "sefaria.nodeAffinities" }}
requiredDuringSchedulingIgnoredDuringExecution:
  nodeSelectorTerms:
    - matchExpressions:
        - key: database
          operator: DoesNotExist
{{- if eq .Values.sandbox "true" }}
preferredDuringSchedulingIgnoredDuringExecution:
  - weight: 100
    preference:
      matchExpressions:
        - key: preemptible
          operator: NotIn
          values:
            - "false"
            - ""
  - weight: 100
    preference:
      matchExpressions:
        - key: preemptible
          operator: In
          values:
            - "true"
{{- end }}
{{- end }}

{{/*
Setup complete tasks queue info
*/}}
{{- define "sefaria.tasks.internalQueues" }}
tasks: {{ .Values.deployEnv }}-tasks
{{- end }}
{{- define "sefaria.tasks.queues" }}
{{- merge  (fromYaml (include "sefaria.tasks.internalQueues" . )) .Values.tasks.queues | toYaml }}
{{- end }}
