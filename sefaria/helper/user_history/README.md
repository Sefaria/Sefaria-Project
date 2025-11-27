# UserHistory Validation and Cleanup

This module provides tools to validate and clean up UserHistory records that contain invalid text references.

## Overview

The validation system:
1. Loads UserHistory records in chunks (default: 10,000 records per chunk)
2. Tests each `ref` field by attempting to create a `Ref` object
3. Deletes records that have invalid refs (raises `InputError`)
4. Tracks progress in MongoDB for resumability
5. Logs detailed error information
6. Sends Slack notifications upon completion

## Features

- ✅ **Chunked Processing** - Processes large datasets in manageable chunks
- ✅ **Celery Integration** - Distributed processing across multiple workers
- ✅ **Progress Tracking** - Real-time progress monitoring
- ✅ **Error Logging** - Detailed error logs stored in MongoDB
- ✅ **Resumable** - Can check progress and status at any time
- ✅ **Test Mode** - Test with smaller datasets before full run

## Usage

### Via API (Recommended for Production)

**Start a validation job:**
```bash
curl -X POST http://localhost:8000/api/user-history/validate-refs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d "limit=100000&chunk_size=10000"
```

**Response:**
```json
{
  "status": "started",
  "job_id": "abc-123-def-456",
  "num_chunks": 10,
  "total_records": 100000,
  "chunk_size": 10000,
  "check_progress_at": "/api/user-history/validation-status/abc-123-def-456"
}
```

**Check progress:**
```bash
curl http://localhost:8000/api/user-history/validation-status/abc-123-def-456 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Response:**
```json
{
  "job_id": "abc-123-def-456",
  "status": "running",
  "progress_percentage": 45.5,
  "chunks_completed": 5,
  "chunks_total": 10,
  "records_processed": 50000,
  "records_valid": 49500,
  "records_invalid_deleted": 500,
  "started_at": "2024-01-01T10:00:00",
  "last_updated": "2024-01-01T10:15:00"
}
```

### Via Python Shell (For Testing)

```python
python manage.py shell

from sefaria.helper.user_history.tasks import validate_user_history_refs

# Test with 1,000 records synchronously (no Celery)
result = validate_user_history_refs(method='sync', limit=1000)
print(result)

# Run with Celery (requires CELERY_ENABLED=True)
result = validate_user_history_refs(method='API', limit=10000, chunk_size=1000)
print(result)
```

### Direct MongoDB Query (For Investigation)

```python
from sefaria.system.database import db

# Check validation progress
list(db.user_history_validation_progress.find())

# Check error details
errors = list(db.user_history_validation_errors.find())
for error in errors[:10]:
    print(f"Ref: {error['ref']}, Error: {error['error']}")

# Count invalid refs found
print(f"Total invalid refs: {db.user_history_validation_errors.count_documents({})}")
```

## API Endpoints

### POST /api/user-history/validate-refs

Starts a validation job.

**Parameters:**
- `chunk_size` (optional, default: 10000) - Number of records per chunk
- `limit` (optional) - Maximum number of records to process (for testing)

**Requires:** Staff/admin authentication

**Returns:** Job details including job_id for progress tracking

### GET /api/user-history/validation-status/<job_id>

Check the status of a running validation job.

**Requires:** Staff/admin authentication

**Returns:** Current progress and statistics

## MongoDB Collections Used

### `user_history_validation_progress`
Tracks overall job progress:
- `job_id` - Unique identifier for the validation run
- `status` - 'running' or 'complete'
- `total_records` - Total records to process
- `chunks_completed` - Number of chunks finished
- `records_processed` - Total records checked
- `records_valid` - Number of valid refs
- `records_invalid_deleted` - Number of invalid refs deleted
- `started_at`, `last_updated`, `completed_at` - Timestamps

### `user_history_validation_errors`
Detailed error logs:
- `job_id` - Reference to the validation job
- `user_history_id` - MongoDB _id of the problematic record
- `ref` - The invalid ref string
- `uid` - User ID (if available)
- `error` - Error message
- `chunk_skip` - Which chunk this error occurred in
- `timestamp` - When the error was logged

## Configuration

Ensure these settings are configured:

**In `local_settings.py` or environment:**
```python
CELERY_ENABLED = True  # Required for distributed processing
```

**Workers must be running:**
```bash
celery -A sefaria.celery_setup.app worker -Q tasks --concurrency=1 -l INFO
```

## Performance Estimates

For **500 million records**:
- **Chunk size:** 10,000 records
- **Total chunks:** 50,000
- **Processing time per chunk:** ~30 seconds (estimated)
- **With 10 workers:** ~17 days
- **With 100 workers:** ~1.7 days

**Recommendations:**
- Start with a small limit (e.g., 100,000) to test
- Increase chunk size to 50,000 for better performance on large datasets
- Monitor the first few chunks to estimate total time
- Run during off-peak hours

## Troubleshooting

**Job seems stuck:**
```python
from sefaria.system.database import db
job = db.user_history_validation_progress.find_one({"job_id": "YOUR_JOB_ID"})
print(job)
```

**Check Celery workers:**
```bash
# In production/Kubernetes
kubectl get pods | grep tasks
kubectl logs <task-pod-name>
```

**Re-run failed chunks:**
The system automatically retries failed chunks up to 3 times. Check error logs for persistent failures.

**Cancel a running job:**
Jobs cannot be cancelled mid-flight, but you can stop Celery workers to prevent new chunks from starting.

## Safety Features

1. **Only deletes on InputError** - Records are only deleted if `Ref()` raises an `InputError` exception
2. **Detailed logging** - All deletions are logged with full details
3. **Progress tracking** - Can monitor and verify deletions at any time
4. **Test mode** - Use `limit` parameter to test on small datasets first
5. **Atomic operations** - Each chunk is processed independently

## Example Workflow

1. **Test on small dataset:**
   ```bash
   curl -X POST http://localhost:8000/api/user-history/validate-refs \
     -d "limit=1000"
   ```

2. **Review results:**
   ```python
   from sefaria.system.database import db
   errors = list(db.user_history_validation_errors.find().limit(10))
   ```

3. **If satisfied, run on larger dataset:**
   ```bash
   curl -X POST http://localhost:8000/api/user-history/validate-refs \
     -d "limit=1000000&chunk_size=50000"
   ```

4. **Monitor progress periodically**

5. **Once complete, check Slack notification or query final results**

