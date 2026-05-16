# Skill: Publish X-Plane Assistant Release

This skill automates the process of releasing a new version of the X-Plane Assistant application.

## Prerequisites
- Ensure all features are tested and committed.
- Ensure the `CHANGELOG.md` is updated with the latest changes.

## Execution Steps

1. **Identify the Release Type**:
   - `patch`: Small bug fixes (e.g., 1.1.5 -> 1.1.6).
   - `minor`: New features or significant improvements (e.g., 1.1.5 -> 1.2.0).
   - `major`: Breaking changes or major overhauls (e.g., 1.1.5 -> 2.0.0).

2. **Update the Changelog**:
   - Review the changes made since the last release (you can run `git log --oneline` or review recent conversation history).
   - Open `CHANGELOG.md` and add a new section at the top for the new version.
   - Summarize the bug fixes, new features, and improvements using clear bullet points.
   - Format: `### vX.Y.Z - YYYY-MM-DD` followed by `- Added: ...`, `- Fixed: ...`.
   - Ensure you save `CHANGELOG.md` before proceeding.

3. **Run the Release Script**:
   Use the following command in the project root:
   ```powershell
   npm run release <type>
   ```
   *Example: `npm run release patch`*

4. **Verify the Process**:
   - Check that `package.json` has the new version.
   - Check that a new Git tag exists.
   - Confirm that changes, including `CHANGELOG.md`, are pushed to GitHub.

4. **Monitor GitHub Actions**:
   - Go to the [Actions tab](https://github.com/Feurum42/X-Plane-Assistant/actions).
   - Ensure the "Release" workflow starts and completes successfully.

## Troubleshooting
- **Tag already exists**: If the command fails because a tag exists, manually update the version in `package.json` and try again, or specify a specific version (e.g., `npm run release 1.2.3`).
- **Permission denied**: Ensure you have push access to the repository.
