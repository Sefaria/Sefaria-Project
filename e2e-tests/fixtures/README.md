# E2E Test Fixtures

This directory contains test fixtures used by the Playwright E2E tests.

## Image Testing Strategy

### Test Images
- `test-image.jpg` - A small test image for testing image upload functionality
- Source: Copied from `static/img/logo/icon.jpg` (existing project asset)

### Best Practices for Image Testing

1. **Use Small Images**: Test images should be small (< 100KB) to avoid slow test execution
2. **Use Existing Assets**: When possible, use images that already exist in the project
3. **Consistent Format**: Use common formats like JPG, PNG for maximum compatibility
4. **Version Control**: Include test images in git so they're available in CI/CD

### Local Development
- Test images are stored in `e2e-tests/fixtures/`
- Path resolution uses `path.join(__dirname, '../fixtures/test-image.jpg')`
- This ensures the path works regardless of where the test is run from

### CI/CD (GitHub Actions)
- Test images are included in the repository
- No additional setup required - images are available during CI/CD runs
- Same path resolution works in both local and CI environments

### Alternative Approaches (if needed)

1. **Base64 Images**: For very small images, you could embed them as base64 strings
2. **Generated Images**: Create simple images programmatically using canvas API
3. **External URLs**: Use publicly accessible image URLs (less reliable for CI/CD)

### Adding New Test Images
1. Add the image file to `e2e-tests/fixtures/`
2. Update the path in the test file
3. Ensure the image is committed to git
4. Document any special requirements in this README 