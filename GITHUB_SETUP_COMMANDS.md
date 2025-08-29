# GitHub Fork Setup Commands

After creating the fork manually on GitHub, run these commands:

```bash
# Navigate to project directory
cd /Users/mami/projects/hebrew-sefaria/Sefaria-Project

# Add your fork as the origin remote (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/Sefaria-Project-Trilingual.git

# Rename current remote to upstream  
git remote rename origin upstream

# Push the experimental branch to your fork
git push -u origin experimental/trilingual-display

# Also push master branch to your fork
git checkout master
git push -u origin master

# Switch back to feature branch
git checkout experimental/trilingual-display
```

### Alternative: If you want to set your fork as origin
```bash
# Remove current origin
git remote remove origin

# Add your fork as origin (replace YOUR_USERNAME)
git remote add origin https://github.com/YOUR_USERNAME/Sefaria-Project-Trilingual.git

# Add original Sefaria repo as upstream
git remote add upstream https://github.com/Sefaria/Sefaria-Project.git

# Push both branches
git push -u origin master
git push -u origin experimental/trilingual-display
```

### Create Issues on GitHub
After pushing, create these GitHub issues in your fork:

1. **Column Width Algorithm Refinement**
2. **Performance Optimization** 
3. **Cross-Browser Compatibility**
4. **Sefaria Core Integration**
5. **Accessibility Compliance**

### Set Default Branch to Master
In your GitHub repository settings:
1. Go to Settings → General → Default branch
2. Select `master` as the default branch
3. Update default branch

### Add Release Labels
Create these labels in your repository:
- `not-alpha` (red) - Not ready for alpha testing
- `experimental` (yellow) - Experimental features
- `critical-bug` (red) - Critical issues blocking progress
- `needs-refinement` (orange) - Features needing improvement