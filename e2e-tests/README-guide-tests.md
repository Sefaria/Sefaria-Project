# Guide Overlay Tests

This document lists all guide overlay test cases in the Playwright test suite (`guide-overlay.spec.ts`).

## Test Case List

### **Basic Functionality**
- **TC001**: ✅ Guide shows on authentic first visit to sheet editor
- **TC001A**: ✅ Guide API endpoint returns valid response structure
- **TC002**: ✅ Guide doesn't show on repeat visits
- **TC003**: ✅ Force show button displays guide

### **Navigation & User Interactions**
- **TC004**: ✅ Navigate between guide cards
- **TC005**: ✅ Circular navigation works
- **TC006**: ✅ Close button dismisses guide

### **Content Display**
- **TC007**: ✅ Video displays correctly
- **TC008**: ✅ Footer links are clickable
- **TC009**: ✅ Text content renders properly
- **TC010**: ✅ Loading state appears

### **Error Handling**
- **TC011**: ✅ Real timeout handling works
- **TC015**: ✅ Real API error handling works

### **Localization**
- **TC012**: ✅ Hebrew content displays correctly

### **Context & Authentication**
- **TC013**: ✅ Guide only shows in sheet editor
- **TC014**: ✅ Guide button only visible when appropriate
- **TC016**: ✅ Real user authentication affects guide behavior

### **Data Persistence**
- **TC017**: ✅ Guide data persists through normal navigation

### **Mobile Responsiveness**
- **TC018**: ✅ Guide does not show on mobile devices (user agent)
- **TC019**: ✅ Guide shows when changing from mobile to desktop user agent
- **TC020**: ✅ Guide button behavior with different user agents

**Total Tests:** 21 test cases - All passing ✅
- **Local:** 21 passed
- **Cauldron:** Network Issuse

## Running the Tests

### **Local Development**
```bash
export PLAYWRIGHT_USER_EMAIL="admin@admin.com" && export PLAYWRIGHT_USER_PASSWORD="admin" && npx playwright test guide-overlay.spec.ts --reporter=line
```

### **Cauldron Environment**
```bash
BASE_URL=https://tips-and-tricks.cauldron.sefaria.org/ PLAYWRIGHT_USER_EMAIL="danielschreiber@sefaria.org" PLAYWRIGHT_USER_PASSWORD="admin" npx playwright test guide-overlay --headed
```
