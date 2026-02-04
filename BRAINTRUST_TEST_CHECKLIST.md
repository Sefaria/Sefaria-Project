# Braintrust Automation - Test Coverage Checklist

## Assessment Result

```
COVERAGE: 0% - CRITICAL GAPS - [23+ Major Testing Gaps]
```

---

## Quick Assessment Checklist

### Unit Tests for Critical Functions
- [ ] fetch_and_filter_tags() - 0 tests
- [ ] query_all_logs() - 0 tests
- [ ] tag_log_with_claude() - 0 tests
- [ ] tag_all_logs() - 0 tests
- [ ] save_tagged_logs() - 0 tests
- [ ] load_tagged_logs() - 0 tests
- [ ] fetch_all_datasets() - 0 tests
- [ ] extract_relevant_tags_from_description() - 0 tests
- [ ] filter_datasets_by_relevant_tags() - 0 tests
- [ ] match_logs_to_datasets() - 0 tests
- [ ] get_existing_log_ids_in_dataset() - 0 tests
- [ ] push_logs_to_dataset() - 0 tests
- [ ] query_braintrust_logs() (backup script) - 0 tests
- [ ] logs_to_csv() - 0 tests

**TOTAL: 0/14 functions tested**

---

## Edge Cases - Test Coverage Matrix

### fetch_and_filter_tags()

#### Happy Path
- [ ] Empty tags list
- [ ] Tags with "dataset-tagging" in description
- [ ] Case-insensitive filtering
- [ ] Tags with null description

#### Error Handling
- [ ] API returns 401 (invalid API key)
- [ ] API returns 429 (rate limited)
- [ ] API returns 500 (server error)
- [ ] Network timeout (>30s)
- [ ] Malformed JSON response
- [ ] Missing "objects" field in response

#### Edge Cases
- [ ] All tags filtered out (no matches)
- [ ] Very large tag list (1000+)
- [ ] Tag name is empty string
- [ ] Tag name contains special characters

**Status:** 0/18 tests

---

### query_all_logs()

#### Happy Path
- [ ] Logs from last 24 hours
- [ ] Multiple logs returned
- [ ] Logs with various field types

#### Error Handling
- [ ] API returns 401 (invalid key)
- [ ] API returns 500 (server error)
- [ ] Network timeout
- [ ] Malformed JSON response

#### Edge Cases
- [ ] No logs in time range
- [ ] Missing "results" field in response
- [ ] Project ID doesn't exist
- [ ] Very large result set (100K+)
- [ ] Hours parameter edge cases (0, negative, very large)

**Status:** 0/14 tests

---

### tag_log_with_claude()

#### Happy Path
- [ ] Valid tag assignment
- [ ] Multiple tags returned
- [ ] Empty available_tags list

#### Error Handling
- [ ] Claude returns invalid JSON
- [ ] Claude returns object instead of array
- [ ] Claude returns string instead of array
- [ ] Claude API returns 401
- [ ] Claude API returns 429
- [ ] Claude API timeout
- [ ] API connection error

#### Data Validation
- [ ] Claude returns tags not in available_tags
- [ ] Claude returns duplicate tags
- [ ] Claude returns null/None values
- [ ] log.id is None
- [ ] log.id is empty string
- [ ] Log has no "input" field
- [ ] Log has no "output" field
- [ ] Input/output are very long (>500 chars)
- [ ] Tags returned with trailing spaces

#### Edge Cases
- [ ] Empty available_tags list
- [ ] available_tags contains special characters
- [ ] Very large input/output
- [ ] Input/output contain Unicode
- [ ] Response truncated (reaches max_tokens)

**Status:** 0/27 tests

---

### match_logs_to_datasets()

#### Happy Path
- [ ] Single log matches single dataset
- [ ] Multiple logs match datasets
- [ ] Partial tag intersection
- [ ] One log matches multiple datasets

#### Error Handling
- [ ] Empty logs list
- [ ] Empty datasets dict
- [ ] Log with None relevant_tags
- [ ] Log with empty relevant_tags list
- [ ] Log missing relevant_tags field

#### Data Validation
- [ ] Log relevant_tags is string instead of list (BUG)
- [ ] Log relevant_tags is dict instead of list
- [ ] Log relevant_tags contains None values
- [ ] Dataset tags contain duplicates
- [ ] Dataset tags are not in available_tags

#### Edge Cases
- [ ] No logs match any datasets
- [ ] Logs don't match optimization strategy
- [ ] Very large log count (10K+)
- [ ] Very large dataset count (1K+)
- [ ] Large dataset with 1M+ records

**Status:** 0/21 tests

---

### extract_relevant_tags_from_description()

#### Happy Path
- [ ] Valid pattern: `[[relevant_tags: ["tag1", "tag2"]]]`
- [ ] No spaces: `[[relevant_tags:["tag1","tag2"]]]`
- [ ] Empty tags: `[[relevant_tags: []]]`
- [ ] Single tag: `[[relevant_tags: ["tag1"]]]`

#### Error Handling
- [ ] Malformed JSON: `[[relevant_tags: ["tag1", ]]]`
- [ ] Missing closing bracket
- [ ] Invalid JSON in array
- [ ] Non-string tags: `[[relevant_tags: [1, 2, 3]]]`

#### Edge Cases
- [ ] Description is None
- [ ] Description is empty string
- [ ] Extra spaces before ]]
- [ ] Extra spaces in array
- [ ] Pattern embedded in text
- [ ] Multiple patterns in description
- [ ] Tags with special characters
- [ ] Very long description

**Status:** 0/17 tests (1 known bug with regex)

---

### get_existing_log_ids_in_dataset()

#### Happy Path
- [ ] Dataset with multiple records
- [ ] Each record has unique ID
- [ ] ID extracted correctly

#### Error Handling
- [ ] Dataset iteration fails
- [ ] Network error during iteration
- [ ] Log row has no "id" field

#### Data Validation
- [ ] Log ID is None
- [ ] Log ID is empty string
- [ ] Log input is None (not dict)
- [ ] Log input is list (not dict)
- [ ] Log input is string (not dict)

#### Edge Cases
- [ ] Large dataset (1M+ records) - performance
- [ ] Very large IDs (memory impact)
- [ ] Duplicate IDs in dataset
- [ ] Unicode IDs
- [ ] Empty dataset

**Status:** 0/16 tests

---

### push_logs_to_dataset()

#### Happy Path
- [ ] Insert single log
- [ ] Insert multiple logs
- [ ] Deduplication works

#### Error Handling
- [ ] Dataset insertion fails
- [ ] Network error during insertion
- [ ] Invalid dataset object

#### Edge Cases
- [ ] Empty logs list
- [ ] All logs already exist (all skipped)
- [ ] Partial insertion (some fail, some succeed)
- [ ] Very large metadata
- [ ] Large batch insertion

**Status:** 0/12 tests

---

### save_tagged_logs() & load_tagged_logs()

#### Happy Path
- [ ] Save creates file
- [ ] Load reads file
- [ ] JSONL format correct
- [ ] Round-trip (save then load)

#### Error Handling
- [ ] Directory doesn't exist (create it)
- [ ] Permission denied
- [ ] Disk full
- [ ] File already exists (overwrite?)

#### Data Validation
- [ ] Corrupted JSON in file
- [ ] Non-UTF-8 characters
- [ ] Missing newlines between records
- [ ] Empty file

#### Edge Cases
- [ ] Very large log file (memory)
- [ ] Concurrent access
- [ ] File path from environment is invalid
- [ ] Symlink handling

**Status:** 0/16 tests

---

### logs_to_csv()

#### Happy Path
- [ ] Convert logs to CSV
- [ ] Correct headers
- [ ] Proper escaping

#### Error Handling
- [ ] No logs provided
- [ ] Empty logs list
- [ ] File write fails

#### Data Validation
- [ ] Nested dicts/lists in logs
- [ ] Special characters in values
- [ ] CSV delimiters in data
- [ ] Null/None values
- [ ] Unicode characters

#### Edge Cases
- [ ] Very large log payloads
- [ ] Varying column counts between logs
- [ ] CSV header length limits
- [ ] Memory efficiency with large datasets

**Status:** 0/14 tests

---

## Integration Test Gaps

- [ ] Full init_step() workflow (tags -> logs -> tagging -> save)
- [ ] Full push_step() workflow (load -> datasets -> match -> insert)
- [ ] Full pipeline: init_step() then push_step()
- [ ] Deduplication across multiple runs
- [ ] Error recovery and retry logic
- [ ] Large-scale data processing (10K+ logs)
- [ ] Mixed success/failure scenarios

**Status:** 0/7 tests

---

## Error Scenario Matrix

### API Errors Not Tested

| Error | fetch_tags | query_logs | braintrust_backup | claude_api |
|-------|-----------|-----------|------------------|-----------|
| 401 Unauthorized | [ ] | [ ] | [ ] | [ ] |
| 403 Forbidden | [ ] | [ ] | [ ] | [ ] |
| 429 Rate Limited | [ ] | [ ] | [ ] | [ ] |
| 500 Server Error | [ ] | [ ] | [ ] | [ ] |
| 503 Unavailable | [ ] | [ ] | [ ] | [ ] |
| Network Timeout | [ ] | [ ] | [ ] | [ ] |
| Connection Refused | [ ] | [ ] | [ ] | [ ] |
| SSL Error | [ ] | [ ] | [ ] | [ ] |
| Incomplete Response | [ ] | [ ] | [ ] | [ ] |
| Malformed JSON | [ ] | [ ] | [ ] | [ ] |

**Status:** 0/40 error tests

---

## Data Type Validation Matrix

| Type | Field | Not Tested | Risk |
|------|-------|-----------|------|
| log.id | string/None | [ ] | HIGH - assumes string |
| log.input | string/dict/None | [ ] | MEDIUM |
| log.output | string/dict/None | [ ] | MEDIUM |
| relevant_tags | list/string/dict | [ ] | HIGH - BUG at line 490 |
| available_tags | list | [ ] | MEDIUM |
| dataset.description | string/None/JSON | [ ] | HIGH - JSON parsing |
| tag name | string | [ ] | MEDIUM |
| dataset tags | set | [ ] | MEDIUM |

**Status:** 0/20+ validation tests

---

## Regex Pattern Test Cases

```
Pattern: r'\[\[relevant_tags:\s*\[(.*?)\]\]\]'

Case 1: '[[relevant_tags: ["tag1", "tag2"]]]'
Expected: MATCH ✓
Actual: MATCH ✓
Test: [ ] PASS

Case 2: '[[relevant_tags:["tag1","tag2"]]]'
Expected: MATCH ✓
Actual: MATCH ✓
Test: [ ] PASS

Case 3: '[[relevant_tags: [ "tag1" , "tag2" ]  ]]'
Expected: MATCH ✓
Actual: NO MATCH ✗
Test: [ ] FAIL (Known Issue)

Case 4: '[[relevant_tags: []]]'
Expected: MATCH ✓
Actual: MATCH ✓
Test: [ ] PASS

Case 5: '[[relevant_tags: ["single"]]]'
Expected: MATCH ✓
Actual: MATCH ✓
Test: [ ] PASS

Case 6: 'Text [[relevant_tags: ["tag1"]]] more'
Expected: MATCH ✓
Actual: MATCH ✓
Test: [ ] PASS

Case 7: '[relevant_tags: ["tag1"]]'
Expected: NO MATCH ✗
Actual: NO MATCH ✗
Test: [ ] PASS

Case 8: '[[relevant_tags ["tag1"]]]'
Expected: NO MATCH ✗
Actual: NO MATCH ✗
Test: [ ] PASS

Case 9: '[[relevant_tags: {"tag1": 1}]]'
Expected: NO MATCH ✗
Actual: NO MATCH ✗
Test: [ ] PASS

Case 10: '[[relevant_tags: [["tag1"]]]'
Expected: NO MATCH ✗
Actual: ? (nested array)
Test: [ ] VERIFY
```

**Status:** 1/10 known issues, 9/10 unverified

---

## Code Issues - Priority Fixes

### CRITICAL (Fix Before Writing Tests)

- [ ] **Issue 1:** JSON parsing without explicit error handling (Line 210)
  - [ ] Implement JSONDecodeError catch
  - [ ] Add descriptive logging
  - [ ] Return empty list on error

- [ ] **Issue 2:** Regex pattern fails on extra spaces (Line 404)
  - [ ] Update pattern to: `r'\[\[relevant_tags:\s*\[(.*?)\]\s*\]\]'`
  - [ ] Test with edge cases
  - [ ] Add comment about edge cases

- [ ] **Issue 3:** Type assumption bug in match_logs_to_datasets (Line 490)
  - [ ] Add type validation: `if not isinstance(log.get("relevant_tags", []), list)`
  - [ ] Add warning log for type mismatches
  - [ ] Add unit test

- [ ] **Issue 4:** No API retry logic (Multiple locations)
  - [ ] Add retry decorator with exponential backoff
  - [ ] Max 3 retries with 2-10 second delays
  - [ ] Log retry attempts

- [ ] **Issue 5:** Large dataset iteration inefficiency (Line 537)
  - [ ] Add pagination or limit clause
  - [ ] Consider using dataset.distinct("id") if available
  - [ ] Add performance test for 1M+ records

---

## Test Implementation Roadmap

### Week 1: Critical Fixes
- [ ] Fix JSON parsing (Issue 1)
- [ ] Fix regex pattern (Issue 2)
- [ ] Fix type validation (Issue 3)
- [ ] Add retry logic (Issue 4)
- Time: 10-15 hours

### Week 2: Unit Tests
- [ ] Test fetch_and_filter_tags (10 tests)
- [ ] Test query_all_logs (8 tests)
- [ ] Test tag_log_with_claude (15 tests)
- [ ] Test extract_relevant_tags (8 tests)
- [ ] Test match_logs_to_datasets (10 tests)
- Time: 15-20 hours

### Week 3: More Unit Tests & Integration
- [ ] Test file I/O operations (8 tests)
- [ ] Test CSV generation (8 tests)
- [ ] Integration tests (5 tests)
- [ ] API error handling tests (10 tests)
- Time: 15-20 hours

### Week 4: Validation & CI/CD
- [ ] Achieve 80%+ coverage
- [ ] Test against real data
- [ ] Add to CI/CD pipeline
- [ ] Documentation
- Time: 10-15 hours

**Total Effort: 70-95 hours (~2-3 weeks)**

---

## Success Criteria

### Phase 1 (Critical Fixes)
- [ ] All 5 code issues resolved
- [ ] Code review completed
- [ ] No regression in functionality

### Phase 2 (Unit Tests)
- [ ] 50+ unit tests written
- [ ] All tests passing
- [ ] 80%+ line coverage
- [ ] All edge cases covered

### Phase 3 (Integration)
- [ ] 5+ integration tests
- [ ] Full pipeline tested
- [ ] Large-scale data tested
- [ ] Error scenarios verified

### Phase 4 (Production Ready)
- [ ] 90%+ code coverage
- [ ] All tests green
- [ ] CI/CD integration
- [ ] Documentation complete
- [ ] Code review approved

---

## Verification Steps

After implementing fixes and tests:

```bash
# Run all tests
pytest sefaria/tests/test_braintrust* -v

# Check coverage
pytest --cov=scripts.scheduled sefaria/tests/test_braintrust* --cov-report=html

# Run with markers
pytest -m "critical" sefaria/tests/test_braintrust*
pytest -m "integration" sefaria/tests/test_braintrust*

# Run against test Braintrust project
# (requires BRAINTRUST_API_KEY env var)
pytest sefaria/tests/test_braintrust* --integration
```

---

## Reference Documents

1. **BRAINTRUST_TEST_COVERAGE_ANALYSIS.md**
   - Comprehensive 400+ line analysis
   - Detailed findings for each function
   - Risk assessment
   - Recommendations

2. **BRAINTRUST_TEST_EXAMPLES.py**
   - 56+ ready-to-implement test cases
   - ~1200 lines of example code
   - Test fixtures and mocks
   - Integration test templates

3. **BRAINTRUST_FINDINGS_SUMMARY.md**
   - Executive summary
   - Quick metrics
   - Action plan

4. **BRAINTRUST_TEST_CHECKLIST.md** (this file)
   - Quick reference
   - Test coverage matrix
   - Implementation roadmap

---

## Sign-Off

| Item | Status | Notes |
|------|--------|-------|
| Analysis Complete | ✓ DONE | 4 comprehensive documents |
| Critical Issues Found | ✓ YES | 5 issues identified |
| Test Plan Ready | ✓ YES | 56+ test examples |
| Code Review Needed | ⚠ TODO | Before implementing |
| Implementation Ready | ✓ YES | Estimated 70-95 hours |

---

**Assessment Date:** February 4, 2026
**Status:** COMPLETE - Ready for implementation
**Next Step:** Review findings and schedule Phase 1 critical fixes

