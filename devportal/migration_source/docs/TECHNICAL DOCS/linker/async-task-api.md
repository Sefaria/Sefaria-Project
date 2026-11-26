---
title: The Sefaria Linker Async Task API
excerpt: Learn how to use the Sefaria Linker Async Task API
deprecated: false
hidden: false
metadata:
  robots: index
---
The Async Task API can provide the status of any async task. If the task is complete, it can also respond with the result payload of the relevant task. Currently, the only async task is the [Linker API](doc:linker-api).

# GET /api/async/:task_id

This API takes a task_id, as returned by the original API that generated the task. In other words, when you call the Sefaria Linker API, a task ID is returned. 

## Response Format

```javascript
{
  "task_id": <str>,  # same as task ID sent in the request
  "state": <str>,    # see below
  "ready": <bool>    # true if result is ready
  "result": <dict>   # only appears when result is ready, contains payload of task result
  "error": <str>     # error message if the task failed
}
```

The table below describes the possible states described by the async API:

| **State**  | **Description**                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| `PENDING`  | The task is waiting to be executed or is unknown (e.g., the result isn’t in the backend yet).            |
| `RECEIVED` | The worker has received the task and will begin executing it soon.                                       |
| `STARTED`  | The task has begun execution. This is only set if `task_track_started=True` in the Celery configuration. |
| `RETRY`    | The task failed but will be retried. This happens due to a raised `Retry` exception.                     |
| `SUCCESS`  | The task has been executed successfully and has returned a result.                                       |
| `FAILURE`  | The task raised an exception during execution.                                                           |
