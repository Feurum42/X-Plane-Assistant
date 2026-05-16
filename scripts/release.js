const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const versionType = args[0] || 'patch'; // patch, minor, major or specific version

try {
  console.log(`🚀 Starting release process (${versionType})...`);

  // 1. Update version in package.json and create git commit/tag
  console.log('📦 Bumping version...');
  const newVersion = execSync(`npm version ${versionType} --no-git-tag-version`).toString().trim();
  
  // 2. Add all changes (including possible manual edits)
  console.log('📝 Committing changes...');
  execSync('git add .');
  execSync(`git commit -m "Release ${newVersion}"`);

  // 3. Create tag
  console.log(`🏷️ Creating tag ${newVersion}...`);
  execSync(`git tag ${newVersion}`);

  // 4. Push to origin
  console.log('📤 Pushing to GitHub...');
  execSync('git push origin main');
  execSync(`git push origin ${newVersion}`);

  console.log(`✅ Successfully released ${newVersion}!`);
  console.log('🔗 GitHub Actions will now build and publish the .exe files.');
} catch (error) {
  console.error('❌ Release failed:', error.message);
  process.exit(1);
}
