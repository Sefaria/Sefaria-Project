# Newsletter Signup Form - Backend API Endpoints

## Overview

The newsletter signup form currently uses a **mocked API layer** defined in:
`static/js/NewsletterSignUpPage/newsletterApi.js`

These endpoints need to be implemented in the Django backend. All endpoints include realistic network delay simulation (300-800ms) and validation.

---

## Endpoints to Implement

### 1. **Subscribe New User (Logged-Out)**

**Function**: `subscribeNewsletter(data)`

**Purpose**: Create a new newsletter subscription for a logged-out user (signup)

**Request**:
```javascript
{
  firstName: string,      // Required: User's first name
  lastName: string,       // Optional: User's last name
  email: string,          // Required: User's email
  newsletters: {          // Required: At least one selected
    sefaria_news: boolean,
    educator_resources: boolean,
    text_updates: boolean,
    parashah_series: boolean,
    tech_updates: boolean,
    timeless_topics: boolean,
  }
}
```

**Expected Response** (Success):
```javascript
{
  success: true,
  message: "Successfully subscribed to newsletters",
  email: string,
  subscribedNewsletters: [string]  // Array of selected newsletter keys
}
```

**Error Cases**:
- Missing first name → "First name and email are required."
- Missing email → "First name and email are required."
- No newsletters selected → "Please select at least one newsletter."
- Email already subscribed → (optional, backend decision)
- Invalid email format → (validation by frontend)

**Mock Implementation**: `newsletterApi.js:37-76`

**Suggested Django Implementation**:
```python
# POST /api/v3/newsletter/subscribe
# Create NewsletterSubscription record
# Send confirmation email
# Return subscription details
```

---

### 2. **Update Preferences (Logged-In)**

**Function**: `updatePreferences(email, newsletters)`

**Purpose**: Update newsletter preferences for an authenticated user

**Request Parameters**:
```javascript
email: string,          // Required: User's email
newsletters: {          // Required: At least one selected
  sefaria_news: boolean,
  educator_resources: boolean,
  text_updates: boolean,
  parashah_series: boolean,
  tech_updates: boolean,
  timeless_topics: boolean,
}
```

**Expected Response** (Success):
```javascript
{
  success: true,
  message: "Preferences updated successfully",
  email: string,
  subscribedNewsletters: [string]  // Array of newly selected newsletter keys
}
```

**Error Cases**:
- Missing email → "Email is required."
- No newsletters selected → "Please select at least one newsletter."
- User not found → (backend decision on behavior)

**Mock Implementation**: `newsletterApi.js:86-115`

**Suggested Django Implementation**:
```python
# POST /api/v3/newsletter/preferences
# Update UserNewsletterPreference records
# Requires authentication (logged-in user)
# Return updated preferences
```

---

### 3. **Save Learning Level**

**Function**: `updateLearningLevel(email, learningLevel)`

**Purpose**: Save user's learning level preference (1-5 scale)

**Request Parameters**:
```javascript
email: string,                // Required: User's email
learningLevel: number (1-5)   // Required: Integer from 1 to 5
```

**Learning Level Scale**:
```
1: Newcomer       (מתחיל)
2: Beginner       (חדש)
3: Intermediate   (ביניים)
4: Advanced       (מתקדם)
5: Expert         (מומחה)
```

**Expected Response** (Success):
```javascript
{
  success: true,
  message: "Learning level saved successfully",
  email: string,
  learningLevel: number (1-5)
}
```

**Error Cases**:
- Missing email → "Email is required."
- Invalid learning level (not 1-5) → "Please select a valid learning level."
- User not found → (backend decision)

**Mock Implementation**: `newsletterApi.js:125-150`

**Suggested Django Implementation**:
```python
# POST /api/v3/newsletter/learning-level
# Create or update UserLearningLevel record
# Return saved learning level
```

---

### 4. **Fetch User Subscriptions (Logged-In)**

**Function**: `fetchUserSubscriptions(email)`

**Purpose**: Retrieve current newsletter subscriptions for a logged-in user to pre-populate form

**Request Parameters**:
```javascript
email: string  // Required: User's email
```

**Expected Response** (Success):
```javascript
{
  success: true,
  email: string,
  subscribedNewsletters: [string],  // Array of subscribed newsletter keys
  learningLevel: number | null      // User's learning level (1-5) or null if not set
}
```

**Example Response**:
```javascript
{
  success: true,
  email: "user@example.com",
  subscribedNewsletters: ["sefaria_news", "text_updates", "parashah_series"],
  learningLevel: 3
}
```

**Error Cases**:
- Missing email → "Email is required."
- User not found → Return empty subscriptions or error
- No subscriptions → Return empty array

**Mock Implementation**: `newsletterApi.js:159-171`

**Suggested Django Implementation**:
```python
# GET /api/v3/newsletter/subscriptions
# Query UserNewsletterPreference and UserLearningLevel records
# Filter by email
# Return current subscriptions
```

---

## Newsletter Keys

The system uses these standardized newsletter identifiers:

| Key | English Name | Hebrew Name | Emoji |
|-----|---|---|---|
| `sefaria_news` | Sefaria News & Resources | חדשות וממדים של ספריא | 📚 |
| `educator_resources` | Educator Resources | משאבים למחנכים | 🎓 |
| `text_updates` | New Text Updates | עדכוני טקסטים חדשים | ✨ |
| `parashah_series` | Weekly Parashah Study Series | מדריך לפרשת השבוע | 📖 |
| `tech_updates` | Technology and Developer Updates | עדכוני טכנולוגיה ופיתוח | 💻 |
| `timeless_topics` | Timeless Topics | נושאים נצחיים | ⏳ |

---

## Implementation Notes

### Authentication

1. **subscribeNewsletter** - No authentication required (public endpoint)
2. **updatePreferences** - Requires authentication (use `Sefaria._uid`)
3. **updateLearningLevel** - Requires authentication (use `Sefaria._uid`)
4. **fetchUserSubscriptions** - Requires authentication (use `Sefaria._uid`)

### Database Models

You'll need to create these models:

```python
# NewsletterSubscription - for new (logged-out) signups
class NewsletterSubscription(models.Model):
    first_name: str
    last_name: str (optional)
    email: str (unique? - allow re-subscribing with different preferences)
    newsletters: JSONField or ManyToMany relationship
    created_at: datetime
    updated_at: datetime
    confirmed_at: datetime (for double opt-in if needed)

# UserNewsletterPreference - for logged-in users
class UserNewsletterPreference(models.Model):
    user: ForeignKey(User)
    newsletter_key: str (e.g., 'sefaria_news')
    is_subscribed: bool
    created_at: datetime
    updated_at: datetime

# UserLearningLevel - store learning level preference
class UserLearningLevel(models.Model):
    user: ForeignKey(User)
    level: int (1-5)
    created_at: datetime
    updated_at: datetime
```

### Validation

Each endpoint should validate:
- ✅ Required fields are present
- ✅ Email format is valid
- ✅ Learning level is 1-5 if provided
- ✅ At least one newsletter is selected (for subscribe/update)
- ✅ User exists (for authenticated endpoints)

### Network Behavior

Current mocked implementation:
- Simulates 300-800ms network delay
- Logs all calls to console
- Never throws errors (commented-out error simulation)
- Always returns success

Real implementation should:
- Handle actual network latency (inherent to backend)
- Log requests to backend logging system
- Return appropriate HTTP status codes (200, 400, 401, 404, 500)
- Return error messages for validation failures

---

## Migration Path

### Phase 1: Testing with Mocked API ✅ COMPLETE
- Form fully functional with mocked endpoints
- All tests passing (90/90)
- Frontend ready for backend integration

### Phase 2: Backend Implementation
1. Create Django models for newsletter subscriptions
2. Implement API endpoints in `api/v3/newsletter/` (suggested)
3. Add authentication checks
4. Write backend tests

### Phase 3: Frontend Integration
1. Replace mocked API calls with real API endpoints
2. Update error handling for real network failures
3. Add retry logic if needed
4. Update test assertions for real responses

### Phase 4: Production
1. Email confirmation flow
2. Double opt-in verification
3. Unsubscribe mechanisms
4. Analytics integration
5. Admin dashboard for managing subscriptions

---

## Error Handling

The frontend currently handles:
- Network errors (caught in try/catch)
- Validation errors (displayed in `.newsletterErrorMessage`)
- Success responses (form progresses to next stage)

Backend should return appropriate HTTP status codes:
- `200 OK` - Successful subscription/update
- `400 Bad Request` - Validation errors (return error message in response body)
- `401 Unauthorized` - Not authenticated (for protected endpoints)
- `404 Not Found` - User/subscription not found
- `409 Conflict` - Already subscribed (if that's desired behavior)
- `500 Internal Server Error` - Server error

---

## Frontend Code References

- **API Layer**: `static/js/NewsletterSignUpPage/newsletterApi.js`
- **Main Component**: `static/js/NewsletterSignUpPage/NewsletterSignUpPageForm.jsx`
  - Uses `subscribeNewsletter()` at line 218
  - Uses `updatePreferences()` at line 215
  - Uses `updateLearningLevel()` at line 265
  - Uses `fetchUserSubscriptions()` at line 137
- **Newsletter Constants**: `static/js/NewsletterSignUpPage/NewsletterSignUpPageForm.jsx:14-21`
- **Learning Levels**: `static/js/NewsletterSignUpPage/NewsletterSignUpPageForm.jsx:28-84`

---

## Testing the API

Once implemented, you can test with Playwright:

```bash
# Run all tests (will work with real API too)
npx playwright test e2e-tests/tests/newsletter-signup-*.spec.js
```

The tests verify:
- Form submission triggers API calls
- Responses are handled correctly
- Errors are displayed appropriately
- Form progresses through all stages

---

## Questions for Backend Implementation

1. **Double Opt-In**: Should new subscribers confirm email before subscription?
2. **Unsubscribe**: How should users unsubscribe? (Link in email? Dashboard?)
3. **Email Service**: Will you use a service like Mailchimp, SendGrid, or Django Mail?
4. **User Linking**: Should logged-out subscribers be automatically linked to accounts if they create one later?
5. **Duplicate Handling**: If someone with same email subscribes twice, what should happen?
6. **Database**: Single table or split into subscription types (logged-in vs logged-out)?
