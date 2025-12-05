# Newsletter API Implementation Guide

## Overview

This document describes the implementation of the newsletter list integration endpoint that fetches available newsletters from ActiveCampaign and their metadata.

## Architecture

The implementation consists of three main components:

### 1. Service Layer (`api/newsletter_service.py`)

A functional, stateless service layer that handles all ActiveCampaign API integration:

- **Configuration**: Imports credentials from `sefaria.local_settings`
  - `ACTIVECAMPAIGN_API_TOKEN`: Your AC API token
  - `ACTIVECAMPAIGN_ACCOUNT_NAME`: AC account name (e.g., 'sefaria')

- **Core Functions**:
  - `get_all_lists()`: Fetches all mailing lists from AC
  - `get_all_personalization_variables()`: Fetches all personalization variables
  - `extract_list_id_from_tag(tag)`: Uses regex to extract list ID from `list_{id}_meta` tags
  - `parse_metadata_from_variable(variable)`: Parses JSON metadata from variable content
  - `get_newsletter_list()`: Orchestrates the above to return combined list+metadata

- **Error Handling**: Custom `ActiveCampaignError` exception with detailed messages

### 2. API View (`api/newsletter_views.py`)

A simple functional view that:

- Accepts GET requests to `/api/newsletter/lists`
- Returns JSON with available newsletters
- Handles errors gracefully with 500 status codes
- Uses module-level logger for production debugging

### 3. URL Routing (`sefaria/urls.py`)

- Registered at `/api/newsletter/lists` (note: without `/v3` version suffix)
- Direct function routing (no class-based views)
- Imported as `import api.newsletter_views as newsletter_views`

---

## Configuration

### Step 1: Add ActiveCampaign Credentials

In `sefaria/local_settings.py`, add:

```python
# ActiveCampaign Integration for Newsletter Management
ACTIVECAMPAIGN_API_TOKEN = "your_activecampaign_api_token_here"
ACTIVECAMPAIGN_ACCOUNT_NAME = "sefaria"
```

### Step 2: Prepare Newsletter Metadata in ActiveCampaign

For each newsletter list you want to expose:

1. Get the list ID from AC (numeric ID)
2. The list's `stringid` field in ActiveCampaign will be used as the newsletter identifier
3. Create a personalization variable with:
   - **Tag**: `list_{id}_meta` (e.g., `list_1_meta` for list ID 1) - Note: ActiveCampaign normalizes tags to lowercase
   - **Name**: The display name for the newsletter (e.g., "Sefaria News & Resources")
   - **Format**: Text
   - **Content**: JSON string with UI metadata (emoji and language only)

Example metadata JSON content:
```json
{
  "emoji": "📚",
  "language": "english"
}
```

This simplified JSON would be stored as the content in the personalization variable. The `stringid` comes from the AC list object, and the `displayName` comes from the variable's `name` field.

---

## API Endpoint

### Request

```
GET /api/newsletter/lists
```

No query parameters or request body required.

### Response (200 OK)

```json
{
  "newsletters": [
    {
      "id": "1",
      "stringid": "sefaria_news",
      "displayName": "Sefaria News & Resources",
      "emoji": "📚",
      "language": "english"
    },
    {
      "id": "2",
      "stringid": "educator_resources",
      "displayName": "Educator Resources",
      "emoji": "🎓",
      "language": "english"
    }
  ]
}
```

### Response Fields

- **id**: ActiveCampaign numeric list ID (string format)
- **stringid**: URL-friendly list identifier from metadata
- **displayName**: Display name from metadata (alternative to list name)
- **emoji**: Emoji to represent the list in UI
- **language**: Language code ("english" or "hebrew")

### Error Response (500 Internal Server Error)

```json
{
  "error": "ActiveCampaign API error: 401"
}
```

---

## Usage Examples

### Using curl

```bash
curl -X GET http://localhost:8000/api/newsletter/lists
```

### Using httpie

```bash
http GET http://localhost:8000/api/newsletter/lists
```

### Using JavaScript/Fetch

```javascript
fetch('/api/newsletter/lists')
  .then(response => response.json())
  .then(data => {
    console.log('Available newsletters:', data.newsletters);
    data.newsletters.forEach(newsletter => {
      console.log(`${newsletter.emoji} ${newsletter.displayName}`);
    });
  })
  .catch(error => console.error('Error:', error));
```

### Using JavaScript/Axios

```javascript
import axios from 'axios';

axios.get('/api/newsletter/lists')
  .then(response => {
    console.log('Newsletters:', response.data.newsletters);
  })
  .catch(error => {
    console.error('Error fetching newsletters:', error.response.data.error);
  });
```

### Storing Response for Form

```javascript
// In a React component
useEffect(() => {
  fetch('/api/newsletter/lists')
    .then(res => res.json())
    .then(data => setNewsletters(data.newsletters))
    .catch(err => setError(err.message));
}, []);

// Use numeric ID as form field value
const newsletterOptions = newsletters.map(nl => ({
  value: nl.id,  // Use numeric ID
  label: `${nl.emoji} ${nl.displayName}`
}));
```

---

## Integration with Newsletter Signup Form

The endpoint provides the data needed for the newsletter signup form:

1. **Form Field Values**: Use the numeric `id` field as checkbox values
2. **Display Labels**: Use `displayName` and `emoji` for UI presentation
3. **Form Submission**: Submit selected list IDs back to subscription endpoints

Example form submission payload:
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "newsletters": {
    "1": true,
    "2": true,
    "3": false,
    "4": true
  }
}
```

---

## Testing

### Run Tests

```bash
# Run all API tests
python manage.py test api.tests

# Run only newsletter tests
python manage.py test api.tests.NewsletterServiceTests
python manage.py test api.tests.NewsletterViewTests
```

### Test Coverage

The test suite includes:

1. **Service Layer Tests** (15 tests):
   - Regex extraction of list IDs (valid/invalid cases)
   - JSON parsing of metadata (valid/invalid/edge cases)
   - API calls to get lists and variables
   - Complete newsletter list building with metadata merging
   - Filtering to only return lists with metadata
   - Error handling and propagation

2. **View Tests** (3 tests):
   - Successful GET request handling
   - Error response when API fails
   - HTTP method validation (POST not allowed)

### Mock Data for Testing

All external API calls are mocked using `unittest.mock.patch`:
- `api.newsletter_service._make_ac_request` for HTTP requests
- `api.newsletter_service.get_all_lists` for list fetching
- `api.newsletter_service.get_all_personalization_variables` for variable fetching
- `api.newsletter_views.get_newsletter_list` for view tests

---

## Troubleshooting

### Issue: "ActiveCampaign credentials not configured"

**Solution**: Add credentials to `sefaria/local_settings.py`:
```python
ACTIVECAMPAIGN_API_TOKEN = "your_token"
ACTIVECAMPAIGN_ACCOUNT_NAME = "sefaria"
```

### Issue: "404 Not Found" for `/api/newsletter/lists`

**Solution**: Verify URL routing in `sefaria/urls.py`:
```python
url(r'^api/newsletter/lists/?$', newsletter_views.get_newsletter_lists),
```

### Issue: Empty newsletters list returned

**Possible causes**:
1. Lists exist in AC but don't have `list_{id}_meta` personalization variables
2. Personalization variables have invalid JSON in content field
3. AC API credentials are incorrect

**Solution**:
- Check AC for personalization variables with pattern `list_*_meta`
- Validate JSON in variable content: `{"stringid": "...", "displayName": "...", "emoji": "...", "language": "..."}`
- Test credentials with direct curl request to AC API

### Issue: "Connection timeout" errors

**Solution**:
- Check AC API endpoint availability
- Verify network connectivity
- Service has 10-second timeout for requests

---

## Performance

### Caching Recommendation

For production use, consider caching the response:

```python
# In api/newsletter_views.py
from django.views.decorators.cache import cache_page

@cache_page(60 * 60)  # Cache for 1 hour
def get_newsletter_lists(request):
    # ... existing code
```

**Why cache?**
- Makes two API calls to AC (lists + variables)
- Lists rarely change
- Reduces AC API usage and improves response time

### API Response Time

- Without cache: 300-1000ms (depends on AC API latency)
- With cache: <10ms (Redis lookup)

---

## Development Notes

### Key Design Decisions

1. **Functional Approach**: All service functions are stateless and pure
2. **Regex for ID Extraction**: Uses `re.match(r'list_(\d+)_meta', tag)` pattern (lowercase)
3. **Filter + Comprehension**: Uses Python's functional tools instead of loops:
   - `filter()` for variable filtering
   - Dictionary comprehensions for metadata mapping
   - List comprehensions with walrus operator for final merge
4. **Only Lists with Metadata**: Returns only lists that have complete metadata
5. **Error Propagation**: Exceptions bubble up with descriptive messages

### Files Created/Modified

- **Created**:
  - `api/newsletter_service.py` - Service layer (211 lines)
  - `api/newsletter_views.py` - View function (52 lines)

- **Modified**:
  - `sefaria/urls.py` - Added newsletter view import and URL route
  - `api/tests.py` - Added 18 comprehensive tests

### Dependencies

- `requests`: For HTTP calls to AC API (already in project)
- `re`: For regex ID extraction (stdlib)
- `json`: For JSON parsing (stdlib)
- `logging`: For debug logging (stdlib)

No new external dependencies required.

---

## Future Enhancements

1. **Caching**: Add Redis caching for 1-hour TTL
2. **Webhook Invalidation**: Listen for AC webhook updates to invalidate cache
3. **Rate Limiting**: Add rate limiting if needed
4. **Batch Subscription**: Create endpoint to subscribe/unsubscribe in one call
5. **Preferences Management**: Get/set user preferences for authenticated users
6. **Analytics**: Track newsletter selection metrics

---

## Related Endpoints

### Overview

The newsletter API consists of multiple endpoints supporting both authenticated and unauthenticated users:

#### **Unauthenticated Endpoints** (Logged-Out Users)
- `GET /api/newsletter/lists` - Fetch available newsletters
- `POST /api/newsletter/subscribe` - Subscribe to newsletters (union-based: adds to existing)

#### **Authenticated Endpoints** (Logged-In Users)
- `GET /api/newsletter/subscriptions` - Fetch current subscriptions
- `POST /api/newsletter/preferences` - Update subscriptions (replace-based: overwrites)
- `POST /api/newsletter/learning-level` - Save learning level (works for both auth states)

---

## Authenticated Endpoints Documentation

### GET /api/newsletter/subscriptions

Fetch the current newsletter subscriptions for an authenticated user.

**Authentication:** Required (Django session/auth)

**Request:**
```
GET /api/newsletter/subscriptions
```

**Response (200 OK):**
```json
{
  "success": true,
  "email": "user@example.com",
  "subscribedNewsletters": [
    "sefaria_news",
    "text_updates",
    "parashah_series"
  ]
}
```

**Errors:**
- **401 Unauthorized**: User is not authenticated
- **405 Method Not Allowed**: Only GET is supported
- **500 Internal Server Error**: ActiveCampaign API error or profile access error

**Notes:**
- Returns empty array if user has no subscriptions
- User email is automatically retrieved from request.user
- All subscriptions are for this user account only

---

### POST /api/newsletter/preferences

Update newsletter preferences for an authenticated user using **REPLACE** semantics.

The user's selected newsletters become their complete subscription list. Any newsletters not selected are automatically unsubscribed.

**Authentication:** Required (Django session/auth)

**Request Body:**
```json
{
  "newsletters": {
    "sefaria_news": true,
    "educator_resources": false,
    "text_updates": true,
    "parashah_series": true,
    "tech_updates": false,
    "timeless_topics": false
  }
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Preferences updated successfully",
  "email": "user@example.com",
  "subscribedNewsletters": [
    "sefaria_news",
    "text_updates",
    "parashah_series"
  ]
}
```

**Errors:**
- **400 Bad Request**: No newsletters selected or invalid JSON
- **401 Unauthorized**: User is not authenticated
- **405 Method Not Allowed**: Only POST is supported
- **500 Internal Server Error**: ActiveCampaign API error

**Important Differences from Subscribe Endpoint:**
- **REPLACE semantics**: New selections become the complete list (unlike subscribe which uses UNION)
- **Automatic unsubscribe**: Unchecked newsletters are unsubscribed
- **Idempotent**: Calling multiple times with the same selections produces the same result
- **Authenticated only**: Requires logged-in user

**Example Workflow:**
```
User was subscribed to: [A, B, C]
User selects: [A, C]
Result: User is now subscribed to [A, C], B is removed
If user selects [A, B, D]:
Result: User is now subscribed to [A, B, D], C is removed
```

---

### POST /api/newsletter/learning-level

Save or update a user's learning level (1-5 scale representing proficiency with Sefaria texts).

**Authentication:** Optional (works for both authenticated and unauthenticated users)

**Request (Authenticated User):**
```json
{
  "learningLevel": 3
}
```
Email is automatically retrieved from request.user

**Request (Unauthenticated User):**
```json
{
  "email": "user@example.com",
  "learningLevel": 2
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "message": "Learning level updated successfully (and saved to profile)",
  "email": "user@example.com",
  "learningLevel": 3,
  "userId": 12345
}
```

**Note**: `userId` will be `null` if no account exists for the email (unauthenticated users without accounts).

**Errors:**
- **400 Bad Request**:
  - Invalid learning level (not 1-5 or null)
  - Missing email (for unauthenticated users)
  - Invalid JSON
- **405 Method Not Allowed**: Only POST is supported
- **500 Internal Server Error**: ActiveCampaign API error or profile save error

**Learning Level Scale:**
- **1**: Newcomer - Need significant guidance and translation
- **2**: Beginner - Need translation and contextual information
- **3**: Intermediate - Can navigate but need translation/context
- **4**: Advanced - Can navigate but benefit from translation in some cases
- **5**: Expert - Can study independently in original language

**Storage Behavior:**
- **For users WITH accounts**: Stored in UserProfile (MongoDB) + ActiveCampaign
- **For users WITHOUT accounts**: Stored only in ActiveCampaign
- **Optional field**: Learning level can be null/undefined (user skips it)
- **Idempotent**: Safe to call multiple times with same value

**Example Workflows:**

*Logged-out user, no account:*
```
POST /api/newsletter/learning-level
{ "email": "new@example.com", "learningLevel": 2 }
→ Stored in AC only, userId: null
```

*Logged-out user, has account:*
```
POST /api/newsletter/learning-level
{ "email": "existing@example.com", "learningLevel": 4 }
→ Stored in UserProfile + AC, userId: 42
```

*Logged-in user:*
```
POST /api/newsletter/learning-level
{ "learningLevel": 3 }
→ Email from request.user, stored in UserProfile + AC
```

---

## API Integration Summary

### Full User Journey (Logged-Out)

1. **Get available newsletters**
   ```
   GET /api/newsletter/lists
   ```

2. **Subscribe to newsletters**
   ```
   POST /api/newsletter/subscribe
   { firstName, lastName, email, newsletters }
   ```

3. **Optional: Save learning level**
   ```
   POST /api/newsletter/learning-level
   { email, learningLevel }
   ```

### Full User Journey (Logged-In)

1. **Get available newsletters** (if needed for UI)
   ```
   GET /api/newsletter/lists
   ```

2. **Fetch current subscriptions**
   ```
   GET /api/newsletter/subscriptions
   ```

3. **Update preferences**
   ```
   POST /api/newsletter/preferences
   { newsletters }
   ```

4. **Optional: Update learning level**
   ```
   POST /api/newsletter/learning-level
   { learningLevel }
   ```

---

## Frontend API Adapter Configuration

The JavaScript API adapter (`static/js/NewsletterSignUpPage/newsletterApi.js`) supports both mock and real endpoints.

### Configuration Methods

**Environment Variable** (Build-time):
```bash
REACT_APP_USE_MOCK_API=true  # Use mocked endpoints
REACT_APP_USE_MOCK_API=false # Use real endpoints (default)
```

**Runtime Toggle** (Browser Storage):
```javascript
// In browser console or app code
localStorage.setItem('_use_mock_api', 'true')   // Switch to mock
localStorage.setItem('_use_mock_api', 'false')  // Switch to real
```

**DevTools Console** (Immediate):
```javascript
NewsletterAPI.setUseMockAPI(true)   // Switch to mock
NewsletterAPI.isMockMode()          // Check current mode
```

### Priority Order
1. localStorage override (highest priority - developer can toggle anytime)
2. Environment variable (build-time configuration)
3. Default to real API (production safe)

---

## Future Enhancements

1. **Caching**: Add Redis caching for 1-hour TTL on newsletter lists
2. **Webhook Invalidation**: Listen for AC webhook updates to invalidate cache
3. **Batch Updates**: Create endpoint to manage multiple list memberships atomically
4. **Learning Level UI**: Show pre-filled learning level for returning users
5. **Analytics**: Track newsletter selection and learning level metrics
6. **Unsubscribe Management**: Bulk unsubscribe endpoint for cleanup
7. **Rate Limiting**: Add rate limiting for API endpoints

---

## Related Files

- **Service Layer**: `api/newsletter_service.py` - ActiveCampaign integration and business logic
- **Views**: `api/newsletter_views.py` - HTTP endpoint handlers
- **Routes**: `sefaria/urls.py` - URL pattern registration
- **Frontend API**: `static/js/NewsletterSignUpPage/newsletterApi.js` - JavaScript adapter
- **Component**: `static/js/NewsletterSignUpPage/NewsletterSignUpPageForm.jsx` - React form component
- **Tests**: `api/test_newsletter.py` - Comprehensive test suite (78 tests)
