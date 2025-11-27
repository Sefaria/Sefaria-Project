# UserHistory Validation - Quick Start Guide

## What Was Implemented

A complete Celery-based system to validate and clean up UserHistory records with invalid text references.

## Files Created

```
sefaria/helper/user_history/
├── __init__.py                      # Package init
├── tasks.py                         # Main Celery tasks (370 lines)
├── README.md                        # Detailed documentation
├── test_validation.py               # Test suite
└── IMPLEMENTATION_SUMMARY.md        # Technical details
```

## Files Modified

1. **`reader/views.py`** - Added 2 API endpoints
2. **`sefaria/urls_shared.py`** - Added 2 URL routes  
3. **`sefaria/celery_setup/app.py`** - Added task autodiscovery

## Quick Test (Without Celery)

```bash
python manage.py shell
```

```python
from sefaria.helper.user_history.tasks import validate_user_history_refs
from sefaria.system.database import db

# Check how many records exist
count = db.user_history.count_documents({
    "ref": {"$exists": True}, 
    "is_sheet": {"$ne": True}
})
print(f"Total records with refs: {count:,}")

# Test on 10 records synchronously (no Celery needed)
result = validate_user_history_refs(method='sync', limit=10)
print(result)
# Expected output: {'valid': X, 'invalid_deleted': Y, 'errors': 0}
```

## Production Use (With Celery)

### Prerequisites
1. `CELERY_ENABLED=True` in settings
2. Celery workers running: `celery -A sefaria.celery_setup.app worker -Q tasks`

### Start Validation Job

**Via API:**
```bash
curl -X POST http://localhost:8000/api/user-history/validate-refs \
  -H "Cookie: sessionid=YOUR_SESSION" \
  -d "limit=100000&chunk_size=10000"
```

**Response:**
```json
{
  "status": "started",
  "job_id": "abc-123-def",
  "num_chunks": 10,
  "total_records": 100000,
  "check_progress_at": "/api/user-history/validation-status/abc-123-def"
}
```

### Check Progress

```bash
curl http://localhost:8000/api/user-history/validation-status/abc-123-def \
  -H "Cookie: sessionid=YOUR_SESSION"
```

**Response:**
```json
{
  "job_id": "abc-123-def",
  "status": "running",
  "progress_percentage": 45.5,
  "chunks_completed": 5,
  "chunks_total": 10,
  "records_processed": 50000,
  "records_valid": 49500,
  "records_invalid_deleted": 500
}
```

## What It Does

1. **Loads** UserHistory records in chunks (default: 10,000 per chunk)
2. **Tests** each `ref` by trying `Ref(record['ref'])`
3. **Deletes** records that raise `InputError` (invalid refs)
4. **Logs** all deletions with full details
5. **Tracks** progress in MongoDB
6. **Notifies** via Slack when complete

## Safety Features

✅ Only deletes on `InputError` exception  
✅ Logs every deletion with full context  
✅ Progress tracking for resumability  
✅ Test mode with `limit` parameter  
✅ Staff/admin authentication required  

## Key Parameters

- **`limit`** - Max records to process (for testing)
- **`chunk_size`** - Records per chunk (default: 10,000)
- **`method`** - 'API' for Celery, 'sync' for immediate execution

## MongoDB Collections

- **`user_history_validation_progress`** - Job tracking
- **`user_history_validation_errors`** - Detailed error logs

## Performance Estimate

For **500 million records**:
- 50,000 chunks × 30 seconds each
- With 10 workers: ~17 days
- With 100 workers: ~1.7 days

**Recommendation:** Test with `limit=10000` first!

## Example Workflow

### 1. Test on Small Dataset
```python
python manage.py shell
>>> from sefaria.helper.user_history.tasks import validate_user_history_refs
>>> result = validate_user_history_refs(method='sync', limit=1000)
>>> print(f"Valid: {result['valid']}, Deleted: {result['invalid_deleted']}")
```

### 2. Review Results
```python
>>> from sefaria.system.database import db
>>> errors = list(db.user_history_validation_errors.find().limit(5))
>>> for e in errors:
...     print(f"Ref: {e['ref']}, Error: {e['error']}")
```

### 3. Run Larger Test with Celery
```bash
# Via API (requires staff login)
curl -X POST http://localhost:8000/api/user-history/validate-refs \
  -d "limit=100000"
```

### 4. Monitor Progress
```bash
curl http://localhost:8000/api/user-history/validation-status/JOB_ID
```

### 5. Check Final Results
- Slack notification will be sent to `#engineering-signal`
- Query MongoDB for detailed error logs

## Troubleshooting

**Import Error?**
- Make sure Django is set up: `python manage.py shell` first

**No Celery Workers?**
- Use `method='sync'` for testing without Celery
- Or start workers: `celery -A sefaria.celery_setup.app worker -Q tasks`

**Job Stuck?**
```python
from sefaria.system.database import db
job = db.user_history_validation_progress.find_one({"job_id": "YOUR_ID"})
print(job)
```

## Documentation

- **Full docs:** `sefaria/helper/user_history/README.md`
- **Technical details:** `sefaria/helper/user_history/IMPLEMENTATION_SUMMARY.md`

## Next Steps

1. ✅ Test with `limit=100` to verify it works
2. ✅ Test with `limit=10000` to check performance
3. ✅ Review error logs to understand what refs are invalid
4. ✅ Plan production run during off-peak hours
5. ✅ Monitor first chunks to estimate total time

---

**Questions?** See the README or ask the engineering team!

