# Changelog - X-Plane Assistant

All notable changes to this project will be documented in this file.

## [1.1.1] - 2026-05-16
### Added
- **Smart Caching Engine**: Dramatically improved startup speed by caching directory sizes based on modification time.
- **Scanning Indicator**: Added visual feedback ("Scanning directory...") during initial mod indexing.

## [1.1.0] - 2026-05-16
### Added
- **Auto-Update System**: Integrated GitHub-based automatic updates with one-click installation.
- **Enhanced UI**: Visual version indicator in the sidebar.
### Fixed
- **Stability**: Reverted to CommonJS (CJS) to fix "Module Not Found" and path resolution issues in production.
- **Packaging**: Correctly separated Setup and Portable builds with unique filenames.

## [1.0.6] - 2026-05-16
### Fixed
- **Missing Dependencies**: Moved `fs-extra` and `axios` to production dependencies to fix startup crashes.

## [1.0.5] - 2026-05-16
### Added
- **Public Releases**: Configured CI/CD to automatically publish releases to GitHub without manual draft approval.
- **README**: Added prominent download links for users.

## [1.0.4] - 2026-05-09
### Added
- **Hybrid Author Detection**: Improved metadata scraping for mods.
- **Real-time Mod Sizing**: Initial implementation of directory size calculations.
- **Windows Icon**: High-resolution 256x256 icon support.
