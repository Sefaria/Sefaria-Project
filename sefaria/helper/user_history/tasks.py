"""
Tasks for validating and cleaning up UserHistory records with invalid refs.
"""
import uuid
import traceback
from datetime import datetime
from celery import chord
from sefaria.celery_setup.app import app
from sefaria.celery_setup.config import CeleryQueue
from sefaria.system.database import db
from sefaria.model.text import Ref
from sefaria.model.user_profile import UserHistory
from sefaria.system.exceptions import InputError
from sefaria.client.util import celeryResponse, jsonResponse
from sefaria.settings import CELERY_ENABLED
from sefaria.helper.slack.send_message import send_message
import structlog

logger = structlog.get_logger(__name__)


# Progress tracking collection name
PROGRESS_COLLECTION = 'user_history_validation_progress'


def get_or_create_validation_job(job_id=None):
    """
    Get existing validation job or create a new one.
    Returns job document with progress tracking.
    """
    if job_id:
        job = db[PROGRESS_COLLECTION].find_one({"job_id": job_id})
        if job:
            return job
    
    # Create new job
    job_id = str(uuid.uuid4())
    query = {"ref": {"$exists": True}, "is_sheet": {"$ne": True}}
    total_records = db.user_history.count_documents(query)
    
    job = {
        "job_id": job_id,
        "status": "running",
        "total_records": total_records,
        "chunks_completed": 0,
        "chunks_total": 0,
        "records_processed": 0,
        "records_valid": 0,
        "records_invalid_deleted": 0,
        "errors": [],
        "started_at": datetime.utcnow(),
        "last_updated": datetime.utcnow()
    }
    db[PROGRESS_COLLECTION].insert_one(job)
    return job


def update_job_progress(job_id, update_dict):
    """Update progress for a validation job"""
    update_dict["last_updated"] = datetime.utcnow()
    db[PROGRESS_COLLECTION].update_one(
        {"job_id": job_id},
        {"$set": update_dict}
    )


@app.task(name="user_history.validate_and_delete_chunk", acks_late=True, max_retries=3)
def validate_and_delete_chunk(skip, limit, job_id):
    """
    Process a chunk of UserHistory records.
    Validates refs and deletes records with invalid refs.
    
    Args:
        skip: Number of records to skip (for pagination)
        limit: Number of records to process in this chunk
        job_id: UUID of the validation job for progress tracking
    
    Returns:
        dict: Summary of processing results
    """
    try:
        query = {"ref": {"$exists": True}, "is_sheet": {"$ne": True}}
        
        # Use MongoDB's cursor with skip/limit
        cursor = db.user_history.find(
            query,
            {"_id": 1, "ref": 1, "uid": 1, "book": 1}
        ).skip(skip).limit(limit)
        
        valid_count = 0
        invalid_count = 0
        deleted_ids = []
        errors_encountered = []
        
        for doc in cursor:
            try:
                # Try to create a Ref object - this will raise InputError if invalid
                Ref(doc['ref'])
                valid_count += 1
                
            except InputError as e:
                # Invalid ref - delete it
                try:
                    result = db.user_history.delete_one({"_id": doc["_id"]})
                    if result.deleted_count > 0:
                        invalid_count += 1
                        deleted_ids.append(str(doc["_id"]))
                        
                        # Log the deletion
                        logger.info(
                            "Deleted invalid UserHistory",
                            user_history_id=str(doc["_id"]),
                            ref=doc.get("ref"),
                            uid=doc.get("uid"),
                            error=str(e)
                        )
                except Exception as delete_error:
                    errors_encountered.append({
                        "user_history_id": str(doc["_id"]),
                        "ref": doc.get("ref"),
                        "error": f"Failed to delete: {str(delete_error)}"
                    })
                    
            except Exception as e:
                # Unexpected error - log but don't delete
                errors_encountered.append({
                    "user_history_id": str(doc["_id"]),
                    "ref": doc.get("ref"),
                    "error": f"Unexpected error: {str(e)}"
                })
        
        result = {
            'status': 'ok',
            'skip': skip,
            'processed': valid_count + invalid_count,
            'valid': valid_count,
            'invalid_deleted': invalid_count,
            'errors': len(errors_encountered)
        }
        
        # Store detailed error log if there were errors
        if errors_encountered:
            db.user_history_validation_errors.insert_many([
                {**err, 'job_id': job_id, 'chunk_skip': skip, 'timestamp': datetime.utcnow()}
                for err in errors_encountered
            ])
        
        # Update progress
        db[PROGRESS_COLLECTION].update_one(
            {"job_id": job_id},
            {
                "$inc": {
                    "chunks_completed": 1,
                    "records_processed": valid_count + invalid_count,
                    "records_valid": valid_count,
                    "records_invalid_deleted": invalid_count
                },
                "$set": {"last_updated": datetime.utcnow()}
            }
        )
        
        return result
        
    except Exception as e:
        logger.error(
            f"Error processing chunk",
            skip=skip,
            limit=limit,
            job_id=job_id,
            error=str(e),
            traceback=traceback.format_exc()
        )
        return {
            'status': 'error',
            'skip': skip,
            'error': str(e)
        }


@app.task(name="user_history.validation_complete", acks_late=True)
def validation_complete(results, job_id):
    """
    Callback that runs after all chunks complete.
    Aggregates and reports final results.
    """
    total_processed = sum(r.get('processed', 0) for r in results)
    total_valid = sum(r.get('valid', 0) for r in results)
    total_invalid = sum(r.get('invalid_deleted', 0) for r in results)
    total_errors = sum(r.get('errors', 0) for r in results)
    failed_chunks = sum(1 for r in results if r.get('status') == 'error')
    
    # Update final job status
    update_job_progress(job_id, {
        "status": "complete",
        "completed_at": datetime.utcnow(),
        "final_summary": {
            "processed": total_processed,
            "valid": total_valid,
            "invalid_deleted": total_invalid,
            "errors": total_errors,
            "failed_chunks": failed_chunks
        }
    })
    
    # Send Slack notification
    title = f'UserHistory Validation Complete (job {job_id[:8]})'
    message = f"""
✅ Processed: {total_processed:,}
✓ Valid: {total_valid:,}
🗑️ Invalid (Deleted): {total_invalid:,}
⚠️ Errors: {total_errors}
❌ Failed Chunks: {failed_chunks}

View errors: db.user_history_validation_errors.find({{"job_id": "{job_id}"}})
    """
    
    try:
        send_message('#engineering-signal', 'UserHistory Validation', title, message, icon_emoji=':broom:')
    except Exception as e:
        logger.error(f"Failed to send Slack message: {e}")
    
    return {
        'job_id': job_id,
        'processed': total_processed,
        'valid': total_valid,
        'invalid_deleted': total_invalid,
        'errors': total_errors
    }


def should_run_with_celery(from_api):
    """Check if we should use Celery or run synchronously"""
    return CELERY_ENABLED and from_api


def validate_user_history_refs(method='API', chunk_size=10000, limit=None, job_id=None):
    """
    Main function to start UserHistory validation process.
    
    Args:
        method: 'API' to run with Celery, otherwise runs synchronously
        chunk_size: Number of records per chunk (default: 10,000)
        limit: Optional limit on total records (for testing)
        job_id: Optional job ID to resume existing job
    
    Returns:
        Response with job details or results
    """
    if should_run_with_celery(method == 'API'):
        # Get or create job
        job = get_or_create_validation_job(job_id)
        job_id = job['job_id']
        
        # Calculate chunks
        query = {"ref": {"$exists": True}, "is_sheet": {"$ne": True}}
        total = db.user_history.count_documents(query)
        
        if limit:
            total = min(total, limit)
        
        # Create chunk tasks
        tasks = []
        num_chunks = 0
        for skip in range(0, total, chunk_size):
            task = validate_and_delete_chunk.s(skip, chunk_size, job_id).set(
                queue=CeleryQueue.TASKS.value
            )
            tasks.append(task)
            num_chunks += 1
        
        # Update job with chunk count
        update_job_progress(job_id, {"chunks_total": num_chunks})
        
        # Use chord to execute all chunks, then call completion callback
        job = chord(
            tasks,
            validation_complete.s(job_id=job_id).set(
                queue=CeleryQueue.TASKS.value
            )
        )(task_id=job_id)
        
        task_ids = [task.id for task in job.parent.results]
        
        return celeryResponse(job.id, task_ids, extra_data={
            "job_id": job_id,
            "num_chunks": num_chunks,
            "chunk_size": chunk_size,
            "total_records": total,
            "check_progress_at": f"/api/user-history/validation-status/{job_id}"
        })
    
    else:
        # Synchronous fallback (not recommended for large datasets)
        logger.warning("Running validation synchronously - this may take a very long time!")
        
        query = {"ref": {"$exists": True}, "is_sheet": {"$ne": True}}
        cursor = db.user_history.find(query, {"_id": 1, "ref": 1}).limit(limit or 0)
        
        results = {'valid': 0, 'invalid_deleted': 0, 'errors': 0}
        
        for doc in cursor:
            try:
                Ref(doc['ref'])
                results['valid'] += 1
            except InputError:
                try:
                    db.user_history.delete_one({"_id": doc["_id"]})
                    results['invalid_deleted'] += 1
                except Exception as e:
                    logger.error(f"Failed to delete {doc['_id']}: {e}")
                    results['errors'] += 1
        
        return jsonResponse(results)


def get_validation_status(job_id):
    """
    Get the status of a validation job.
    """
    job = db[PROGRESS_COLLECTION].find_one({"job_id": job_id})
    if not job:
        return {"error": "Job not found"}
    
    # Calculate progress percentage
    progress_pct = 0
    if job.get('chunks_total', 0) > 0:
        progress_pct = (job.get('chunks_completed', 0) / job['chunks_total']) * 100
    
    return {
        "job_id": job['job_id'],
        "status": job['status'],
        "progress_percentage": round(progress_pct, 2),
        "chunks_completed": job.get('chunks_completed', 0),
        "chunks_total": job.get('chunks_total', 0),
        "records_processed": job.get('records_processed', 0),
        "records_valid": job.get('records_valid', 0),
        "records_invalid_deleted": job.get('records_invalid_deleted', 0),
        "started_at": job.get('started_at'),
        "last_updated": job.get('last_updated'),
        "completed_at": job.get('completed_at'),
        "final_summary": job.get('final_summary')
    }

