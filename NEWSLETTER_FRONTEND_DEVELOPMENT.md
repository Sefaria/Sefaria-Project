# Newsletter System - Frontend Development Guide

This guide explains how to develop and test the newsletter signup system, including how to toggle between mock and real API endpoints.

## Quick Start

### Using Mock API (Default for Development)

To test the newsletter form without running the backend server:

```bash
# Set environment variable
export REACT_APP_USE_MOCK_API=true

# Run your development server
npm start
# or yarn start
```

The mock API simulates realistic network delays (300-800ms) and provides sample data without hitting the backend.

### Using Real API (Production/Integration Testing)

To test with actual backend endpoints:

```bash
# Ensure backend is running
# Then set environment variable
export REACT_APP_USE_MOCK_API=false

# Run your development server
npm start
```

Or simply don't set the environment variable (defaults to real API).

---

## Runtime API Toggling

### Browser Console Commands

You can toggle between mock and real APIs at runtime without restarting your server:

```javascript
// Open browser DevTools console (F12 or Cmd+Option+I)

// Switch to mock API
NewsletterAPI.setUseMockAPI(true)
console.log('Now using MOCK API for testing')

// Switch to real API
NewsletterAPI.setUseMockAPI(false)
console.log('Now using REAL API')

// Check current mode
console.log(NewsletterAPI.isMockMode())  // true or false
```

This is useful for quick testing without rebuilding your app.

### Browser LocalStorage

You can also manually set the API mode via localStorage:

```javascript
// In browser console
localStorage.setItem('_use_mock_api', 'true')   // Use mock
localStorage.setItem('_use_mock_api', 'false')  // Use real

// Check current setting
localStorage.getItem('_use_mock_api')

// Clear (will use environment variable or default)
localStorage.removeItem('_use_mock_api')
```

---

## API Configuration Priority

The API adapter uses this priority system to determine which endpoints to use:

1. **localStorage override** (highest priority)
   - Set via `localStorage.setItem('_use_mock_api', 'true'/'false')`
   - Persists across page reloads
   - Allows developers to toggle anytime in browser DevTools

2. **Environment variable** (medium priority)
   - Set via `REACT_APP_USE_MOCK_API=true/false` when starting dev server
   - Requires rebuild/restart to change
   - Good for CI/CD and build-time configuration

3. **Default to real API** (lowest priority)
   - If neither localStorage nor env var is set
   - Production-safe default (uses real endpoints)

**Example Priority Flow:**
```
If localStorage has '_use_mock_api'?
  └─ YES → Use that value
  └─ NO → Check environment variable?
      └─ YES → Use that value
      └─ NO → Default to real API
```

---

## Development Workflows

### Scenario 1: Styling & Layout (No Backend Needed)

Perfect for frontend-only development:

```bash
# Start with mock API enabled
export REACT_APP_USE_MOCK_API=true
npm start

# In browser
# - Form will use mock API calls
# - Network delays are simulated (300-800ms)
# - No backend server required
# - Can test form validation, error states, etc.
```

Mock responses include realistic success and error scenarios.

### Scenario 2: Integration Testing with Real Backend

Testing with actual API endpoints:

```bash
# Terminal 1: Start backend
cd /path/to/sefaria
python manage.py runserver

# Terminal 2: Start frontend
export REACT_APP_USE_MOCK_API=false
npm start

# Now the form calls real API endpoints
# - POST /api/newsletter/subscribe
# - GET /api/newsletter/subscriptions
# - POST /api/newsletter/preferences
# - POST /api/newsletter/learning-level
```

### Scenario 3: Quick Toggle Without Restart

Test both paths without restarting:

```bash
# Start with mock API
export REACT_APP_USE_MOCK_API=true
npm start

# In browser console
NewsletterAPI.setUseMockAPI(true)
// Test with mock, form works perfectly

NewsletterAPI.setUseMockAPI(false)
// Switch to real API, test against backend

// No page reload needed! Toggle instantly.
```

---

## Testing Different User Flows

### Logged-Out User (New Subscriber)

1. **With Mock API:**
   ```
   - Fill in first name, email
   - Select newsletters
   - Click subscribe
   - Mock API returns success
   - See confirmation
   - Optionally save learning level
   ```

2. **With Real API:**
   ```
   - Same flow but:
   - Data is sent to POST /api/newsletter/subscribe
   - Creates contact in ActiveCampaign
   - Stored in newsletter system
   - Confirmation email sent (if configured)
   ```

### Logged-In User (Returning Subscriber)

1. **With Mock API:**
   ```
   - User is auto-detected as logged in
   - Form fetches mock subscriptions
   - Shows currently "subscribed" newsletters
   - User can modify selections
   - Updates mocked (not persisted)
   ```

2. **With Real API:**
   ```
   - User is auto-detected as logged in
   - Form calls GET /api/newsletter/subscriptions
   - Shows actual subscriptions from backend
   - User modifies selections
   - Calls POST /api/newsletter/preferences
   - Updates persisted to UserProfile + ActiveCampaign
   ```

---

## Mock API Behavior

### Simulated Network Delay

All mock API calls include realistic network delay:

```javascript
// Simulates 300-800ms delay
await simulateNetworkDelay(300, 800)
```

This helps you:
- Test loading states in your UI
- See how the form behaves with network latency
- Verify spinners and disabled states work correctly

### Mock Response Examples

#### Subscribe Response (Success)
```javascript
{
  success: true,
  message: 'Successfully subscribed to newsletters',
  email: 'user@example.com',
  subscribedNewsletters: ['sefaria_news', 'text_updates']
}
```

#### Update Preferences Response (Success)
```javascript
{
  success: true,
  message: 'Preferences updated successfully',
  email: 'user@example.com',
  subscribedNewsletters: ['parashah_series']
}
```

#### Learning Level Response (Success)
```javascript
{
  success: true,
  message: 'Learning level saved successfully',
  email: 'user@example.com',
  learningLevel: 3
}
```

#### Fetch Subscriptions Response
```javascript
{
  success: true,
  email: 'user@example.com',
  subscribedNewsletters: ['sefaria_news', 'text_updates'],
  learningLevel: null
}
```

### Error Handling

Mock API validates inputs and throws errors just like the real API:

```javascript
// Try with mock API
NewsletterAPI.setUseMockAPI(true)

// This will throw an error (no first name)
try {
  await subscribeNewsletter({
    firstName: '',
    email: 'test@example.com',
    newsletters: { sefaria_news: true }
  })
} catch (error) {
  console.log(error.message)
  // → "First name and email are required."
}
```

---

## Browser DevTools Tips

### Console Commands for Testing

```javascript
// Check which API is active
console.log(NewsletterAPI.isMockMode())  // true or false

// Toggle to mock
NewsletterAPI.setUseMockAPI(true)
console.log('Switched to mock API ✓')

// Toggle to real
NewsletterAPI.setUseMockAPI(false)
console.log('Switched to real API ✓')

// View current localStorage setting
console.log(localStorage.getItem('_use_mock_api'))

// Clear the override (use env var or default)
localStorage.removeItem('_use_mock_api')

// Test API directly from console
(async () => {
  const result = await NewsletterAPI.subscribeNewsletter({
    firstName: 'Test',
    lastName: 'User',
    email: 'test@example.com',
    newsletters: { sefaria_news: true }
  })
  console.log(result)
})()
```

### Network Tab

**With Mock API:**
- No network requests appear
- Everything happens in JavaScript
- Useful for testing when offline

**With Real API:**
- Network tab shows all XHR/Fetch requests
- Can inspect request bodies and response headers
- Useful for debugging API integration issues

Example real API requests:
- `POST /api/newsletter/subscribe`
- `GET /api/newsletter/subscriptions`
- `POST /api/newsletter/preferences`
- `POST /api/newsletter/learning-level`

---

## Common Development Tasks

### Task: Test Form Validation

```bash
export REACT_APP_USE_MOCK_API=true
npm start

# In form:
# Try submitting without first name
# Try invalid email format
# Try submitting without selecting newsletters
# Watch error messages appear
```

### Task: Test Loading States

```bash
export REACT_APP_USE_MOCK_API=true
npm start

# Submit the form
# Watch the submit button show loading spinner
# Form should be disabled during submission
# Success message appears after 300-800ms
```

### Task: Test Real API Integration

```bash
# Terminal 1: Start backend
python manage.py runserver

# Terminal 2: Start frontend with real API
export REACT_APP_USE_MOCK_API=false
npm start

# Submit form
# Check backend logs to see request received
# Check Django admin or AC to verify subscription created
```

### Task: Toggle APIs Mid-Testing

```bash
export REACT_APP_USE_MOCK_API=true
npm start

# In browser console:
NewsletterAPI.setUseMockAPI(true)
// Test with mock API, everything works

NewsletterAPI.setUseMockAPI(false)
// Instantly switch to real API, test against backend

// No rebuild, no reload needed!
```

---

## Debugging Tips

### Issue: "API is not returning data"

**Check which API is active:**
```javascript
console.log(NewsletterAPI.isMockMode())
// true = using mock (good for offline dev)
// false = using real API (requires backend)
```

### Issue: "Network requests aren't showing in DevTools"

**Mock API doesn't make network requests:**
```javascript
// If this is true, network tab will be empty
console.log(NewsletterAPI.isMockMode())

// Switch to real API to see network requests
NewsletterAPI.setUseMockAPI(false)
```

### Issue: "Form isn't submitting"

**Check backend is running (if using real API):**
```bash
# Make a test request to verify backend is up
curl http://localhost:8000/api/newsletter/lists

# Should return JSON with newsletters
```

### Issue: "Learning level not saving"

**Verify the endpoint is being called:**
```javascript
// In console, watch the network tab
// Should see POST request to /api/newsletter/learning-level
// Response should have success: true

// Or check mock mode
NewsletterAPI.isMockMode()  // Should be false for real API
```

---

## API Response Validation

### Expected Response Structure

All successful responses follow this pattern:

```javascript
{
  success: true,
  message: "Description of what happened",
  email: "user@example.com",
  ...otherFields
}
```

### Error Response Structure

```javascript
{
  error: "Error description"
}
```

The form should:
- Extract the `error` field for display
- Show user-friendly error messages
- Allow retry

---

## Performance Considerations

### Mock API
- ✅ No network requests
- ✅ Works offline
- ✅ Instant feedback (except simulated delays)
- ✅ Good for UI/UX testing

### Real API
- Requires backend to be running
- Network latency varies
- Actual data persistence
- Good for integration testing

---

## Troubleshooting Checklist

- [ ] Check `NewsletterAPI.isMockMode()` - are you on the right API?
- [ ] Check backend is running (if using real API)
- [ ] Check browser console for error messages
- [ ] Check Network tab (DevTools) for failed requests
- [ ] Try toggling to mock API to verify form works
- [ ] Check localStorage for API setting: `localStorage.getItem('_use_mock_api')`
- [ ] Clear browser cache if settings don't change
- [ ] Reload page (some changes require reload)

---

## Related Files

- **API Adapter**: `static/js/NewsletterSignUpPage/newsletterApi.js`
- **Form Component**: `static/js/NewsletterSignUpPage/NewsletterSignUpPageForm.jsx`
- **API Documentation**: `NEWSLETTER_API_IMPLEMENTATION.md`
- **Backend Views**: `api/newsletter_views.py`
- **Backend Service**: `api/newsletter_service.py`
- **Tests**: `api/test_newsletter.py` (78 tests)

---

## Additional Resources

- [ActiveCampaign API Docs](https://developers.activecampaign.com/reference/overview)
- [Sefaria Developer Docs](https://www.sefaria.org/developers)
- [React State Management](https://react.dev/learn/state-a-components-memory)
- [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
