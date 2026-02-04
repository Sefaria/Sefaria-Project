# Braintrust Cronjob Infrastructure Setup

This guide provides the complete setup for the Braintrust evaluation automation cronjobs.

## Overview

Two cronjobs handle Braintrust evaluation automation:

1. **braintrust-backup-logs** (Weekly): Backs up 7 days of logs to CSV in GCS bucket `braintrust-logs`
2. **braintrust-tag-and-push** (Daily): Tags all logs with Claude, then pushes to Braintrust datasets

## Prerequisites

### 1. Dockerfile (Build Custom Image)

Create a `Dockerfile` in the repository root:

```dockerfile
FROM python:3.11-slim

# Install required Python packages
RUN pip install --no-cache-dir \
    braintrust>=0.3.0 \
    anthropic>=0.7.0 \
    langchain-anthropic>=0.1.0 \
    requests>=2.31.0 \
    structlog>=23.2.0 \
    google-cloud-logging>=3.5.0 \
    google-cloud-storage>=2.10.0

WORKDIR /app

# Scripts will be mounted via ConfigMap at runtime
RUN mkdir -p /app/scripts

ENTRYPOINT ["python"]
```

Build and push:
```bash
docker build -t your-registry/braintrust-automation:latest .
docker push your-registry/braintrust-automation:latest
```

### 2. K8s Secrets

Create required secrets:

```bash
# Braintrust API configuration
kubectl create secret generic braintrust-api-secret \
  --from-literal=api-key=<YOUR_BRAINTRUST_API_KEY> \
  --from-literal=project-id=<YOUR_PROJECT_ID> \
  -n your-namespace

# Anthropic API (should already exist)
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=<YOUR_ANTHROPIC_API_KEY> \
  -n your-namespace
```

**Or using SOP (Sealed Secrets Operator Pattern):**

Create sealed versions of the above for your environment.

### 3. GCS Service Account (for backup-logs)

Create a service account with GCS bucket write access:

```bash
# Create service account
kubectl create serviceaccount braintrust-sa -n your-namespace

# Bind to GCS bucket role (requires Workload Identity or IRSA setup)
# This depends on your GCP/K8s setup
```

### 4. values.yaml Configuration

Add this to your `helm-chart/sefaria/values.yaml`:

```yaml
secrets:
  braintrust:
    # Reference to K8s secret containing BRAINTRUST_API_KEY and BRAINTRUST_PROJECT_ID
    ref: braintrust-api-secret
  anthropic:
    # Reference to existing K8s secret containing ANTHROPIC_API_KEY
    ref: anthropic-api-key

cronJobs:
  braintrust:
    # Docker image for Braintrust automation (contains Python + SDKs)
    image:
      repository: your-registry/braintrust-automation
      tag: latest

    backupLogs:
      enabled: true
      # Weekly: Sunday at 1 AM
      schedule: "0 1 * * 0"
      # Service account for GCS bucket access
      serviceAccount: braintrust-sa
      # GCS bucket for log backups
      bucket: braintrust-logs
      # Prefix for backup files (e.g., "logs/")
      prefix: "logs/"

    tagAndPush:
      enabled: true
      # Daily: 2 AM
      schedule: "0 2 * * *"
      # Service account (can be same as backupLogs)
      serviceAccount: braintrust-sa
      # Whether to use PVC for shared storage
      # Set to false to use emptyDir (logs lost after job)
      # Set to true to use PVC (logs persisted for debugging)
      usePvc: false
      # If usePvc is true, name of the PVC
      # pvcName: braintrust-shared-storage
```

## Data Flow

### Step 1: backuptrust-backup-logs (Weekly)

```
Init Container:
  1. Query Braintrust for all logs from last 7 days (BTQL)
  2. Convert to CSV
  3. Save to /tmp/logs_backup_YYYY-MM-DD.csv

Main Container:
  1. Upload CSV to gs://braintrust-logs/logs/YYYY-MM-DD.csv
  2. Cleanup /tmp
```

### Step 2: braintrust-tag-and-push (Daily)

**Single container with two logical phases:**

```
INIT PHASE (Steps 1-5):
  1. Fetch ALL tags from /v1/project_tag
  2. Filter tags: keep those with "dataset-tagging" in description
  3. Query ALL logs from last 24 hours (BTQL, NO filtering)
  4. Tag ALL logs with Claude, constrained to use only filtered tags
  5. Save tagged logs to /shared/braintrust/tagged_logs.jsonl

PUSH PHASE (Steps 6-8):
  6. Fetch ALL datasets from /v1/dataset
  7. Filter datasets: keep those with [[relevant_tags: ["a","b"]]] in description
  8. Match logs to datasets based on relevant_tags and insert (with deduplication)
```

## Key Configuration Details

### Braintrust Tag Format

Tags with this description are available for Claude assignment:
```
description: "Your description here - dataset-tagging"
```

Example tag names: `classification`, `sentiment`, `error-type`, `user-flow`, etc.

### Dataset Description Format

Datasets specify target tags using this pattern:
```
description: "Your dataset description - [[relevant_tags: [\"classification\",\"sentiment\"]]]"
```

The script will:
1. Extract `["classification", "sentiment"]` from the description
2. Find all logs tagged with these tags
3. Insert them into this dataset

### Matching Algorithm (Optimized)

The script uses a leet-code style optimization:
- If logs_count ≤ datasets_count: Iterate logs, find matching datasets
- If logs_count > datasets_count: Iterate datasets, find matching logs

This minimizes memory usage and cache misses.

## Monitoring & Logging

Both scripts use structured logging with `structlog`. Logs are output as JSON:

```bash
# View logs
kubectl logs -f deployment/braintrust-backup-logs -n your-namespace

# Filter for errors
kubectl logs deployment/braintrust-tag-and-push -n your-namespace | jq 'select(.level=="error")'
```

## Troubleshooting

### Missing logs in query
- Verify BRAINTRUST_PROJECT_ID is correct
- Check that logs exist in the specified time range

### No datasets found
- Verify dataset descriptions include the `[[relevant_tags: [...]]]` pattern
- Check pattern syntax (case-sensitive, exact spacing)

### Logs not being inserted
- Verify dataset names match in Braintrust
- Check that logs have relevant_tags assigned (Claude tagging succeeded)
- Verify dataset is initialized and accessible

### Authentication errors
- Confirm secrets are created correctly:
  ```bash
  kubectl get secret braintrust-api-secret -o jsonpath='{.data.api-key}' | base64 -d
  ```
- Verify API keys haven't expired

## Scaling Considerations

- **Max logs per run**: Limited by Claude API rate limits and memory (3Gi allocated)
- **Recommend batch size**: 100-1000 logs per day for smooth operation
- **If more logs**: Increase container memory/CPU limits and/or split by project

## Security Best Practices

- Store API keys in sealed secrets (SOP)
- Use Workload Identity or IRSA for GCS bucket access
- Restrict service account permissions to minimum required
- Regularly rotate API keys
- Monitor for unusual query patterns or volumes
