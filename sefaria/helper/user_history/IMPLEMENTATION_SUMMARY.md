# UserHistory Validation Implementation Summary

## Files Created/Modified

### New Files Created

1. **`sefaria/helper/user_history/__init__.py`**
   - Package initialization file

2. **`sefaria/helper/user_history/tasks.py`** 
   - Core implementation with Celery tasks
   - Contains:
     - `validate_and_delete_chunk()` - Celery task to process chunks
     - `validation_complete()` - Callback task for completion
     - `validate_user_history_refs()` - Main orchestration function
     - `get_validation_status()` - Status checking function
     - `get_or_create_validation_job()` - Job management
     - `update_job_progress()` - Progress tracking

3. **`sefaria/helper/user_history/README.md`**
   - Complete documentation
   - Usage examples
   - API reference
   - Troubleshooting guide

4. **`sefaria/helper/user_history/test_validation.py`**
   - Test suite to verify functionality
   - Run with: `python manage.py shell < sefaria/helper/user_history/test_validation.py`

### Modified Files

1. **`reader/views.py`**
   - Added import: `from sefaria.helper.user_history.tasks import validate_user_history_refs, get_validation_status`
   - Added two new API endpoints:
     - `validate_user_history_refs_api()` - POST endpoint to start validation
     - `validation_status_api()` - GET endpoint to check status

2. **`sefaria/urls_shared.py`**
   - Added two new URL routes:
     - `POST /api/user-history/validate-refs`
     - `GET /api/user-history/validation-status/<job_id>`

3. **`sefaria/celery_setup/app.py`**
   - Added `'sefaria.helper.user_history'` to `autodiscover_tasks()`
   - Ensures Celery discovers the new tasks

## How It Works

### 1. Request Flow

```
User/Admin → POST /api/user-history/validate-refs
    ↓
validate_user_history_refs_api() in reader/views.py
    ↓
validate_user_history_refs() in tasks.py
    ↓
Creates job in user_history_validation_progress collection
    ↓
Splits work into chunks (default 10k records each)
    ↓
Queues validate_and_delete_chunk tasks to Celery
    ↓
Workers process chunks in parallel
    ↓
Each chunk validates refs and deletes invalid ones
    ↓
validation_complete() aggregates results
    ↓
Sends Slack notification
```

### 2. Validation Logic

For each UserHistory record:
```python
try:
    Ref(record['ref'])  # Try to create Ref object
    # If successful, ref is valid - keep record
except InputError as e:
    # If InputError, ref is invalid - delete record
    db.user_history.delete_one({"_id": record["_id"]})
    # Log the deletion
```

### 3. Progress Tracking

Uses MongoDB collection `user_history_validation_progress`:
```json
{
  "job_id": "uuid",
  "status": "running|complete",
  "total_records": 500000000,
  "chunks_completed": 150,
  "chunks_total": 50000,
  "records_processed": 1500000,
  "records_valid": 1480000,
  "records_invalid_deleted": 20000,
  "started_at": "2024-01-01T10:00:00",
  "last_updated": "2024-01-01T10:15:00"
}
```

### 4. Error Logging

Uses MongoDB collection `user_history_validation_errors`:
```json
{
  "job_id": "uuid",
  "user_history_id": "mongodb_id",
  "ref": "InvalidBook 999:999",
  "uid": 12345,
  "error": "Could not find index for InvalidBook",
  "chunk_skip": 10000,
  "timestamp": "2024-01-01T10:05:00"
}
```

## Testing Instructions

### Option 1: Via Python Shell

```bash
python manage.py shell
```

```python
from sefaria.helper.user_history.tasks import validate_user_history_refs

# Test synchronously on 100 records
result = validate_user_history_refs(method='sync', limit=100)
print(result)
# Output: {'valid': 95, 'invalid_deleted': 5, 'errors': 0}
```

### Option 2: Via API (With Celery)

Requires:
- `CELERY_ENABLED=True` in settings
- Celery workers running

```bash
# Start a job
curl -X POST http://localhost:8000/api/user-history/validate-refs \
  -H "Cookie: sessionid=YOUR_SESSION" \
  -d "limit=1000&chunk_size=100"

# Check status
curl http://localhost:8000/api/user-history/validation-status/JOB_ID \
  -H "Cookie: sessionid=YOUR_SESSION"
```

### Option 3: Direct MongoDB Query

```python
from sefaria.system.database import db
from sefaria.model.text import Ref
from sefaria.system.exceptions import InputError

# Check how many records have text refs
count = db.user_history.count_documents({
    "ref": {"$exists": True}, 
    "is_sheet": {"$ne": True}
})
print(f"Total records to validate: {count:,}")

# Test validation on a few records
sample = db.user_history.find({
    "ref": {"$exists": True}, 
    "is_sheet": {"$ne": True}
}).limit(10)

for doc in sample:
    try:
        Ref(doc['ref'])
        print(f"✓ Valid: {doc['ref']}")
    except InputError as e:
        print(f"✗ Invalid: {doc['ref']} - {e}")
```

## Production Deployment Checklist

- [ ] Ensure `CELERY_ENABLED=True` in production settings
- [ ] Verify Celery workers are running with the 'tasks' queue
- [ ] Test on small dataset first (limit=10000)
- [ ] Monitor first few chunks to estimate total time
- [ ] Ensure sufficient MongoDB connection pool
- [ ] Verify Slack notifications work
- [ ] Schedule during off-peak hours for large runs
- [ ] Monitor MongoDB disk space (error logs can grow)
- [ ] Set up monitoring/alerting for failed chunks

## Performance Estimates

For **500 million records**:
- **Chunk size:** 10,000 records
- **Total chunks:** 50,000
- **Estimated time per chunk:** 20-30 seconds
- **With 10 workers:** 12-18 days
- **With 100 workers:** 1.2-1.8 days

**Recommendations:**
- Increase chunk size to 50,000 for fewer overhead
- Start with 10 workers and scale up if needed
- Monitor first 100 chunks to refine estimates

## MongoDB Collections Used

1. **`user_history`** - Source data (READ + DELETE)
2. **`user_history_validation_progress`** - Job tracking (WRITE)
3. **`user_history_validation_errors`** - Error logs (WRITE)

## Security

- Both API endpoints require `request.user.is_staff` authentication
- Only admin users can trigger validation or check status
- Validation is read-only except for deletion of invalid records
- All deletions are logged with full context

## Rollback

If needed, invalid refs are logged before deletion in `user_history_validation_errors` collection:
- Contains original `_id`, `ref`, `uid`, and error details
- Could be used to restore records if needed (though they were invalid)

## Next Steps

1. **Test locally:**
   ```bash
   python manage.py shell
   >>> from sefaria.helper.user_history.tasks import validate_user_history_refs
   >>> result = validate_user_history_refs(method='sync', limit=100)
   >>> print(result)
   ```

2. **Test in cauldron with Celery enabled:**
   - Create/use cauldron with tasks enabled
   - Test via API with limit=10000
   - Monitor progress and check results

3. **Review results and refine parameters**

4. **Run on production during off-peak hours**

## Questions?

See `README.md` for detailed documentation or contact the engineering team.

