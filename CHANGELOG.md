# Changelog

All notable changes to the ReferenceX extension will be documented in this file.

## [0.6.0] - 2026-06-22

### Performance
- Reference lookups now run in parallel (bounded concurrency) instead of one-at-a-time, dramatically speeding up large files and the workspace scan.
- Added a shared, version-keyed cache so CodeLens, hover, the dependency tree, and the scanner reuse results within a render pass instead of re-querying the language server repeatedly.

### Fixed
- Fixed the inline-decoration "debounce", which previously fired one update per keystroke instead of coalescing them.
- Removed duplicate `onDidChangeTextDocument` listeners that did redundant work on every edit.
- Reference counts are now consistent everywhere — hover and the unused-code scanner now filter out `import`/re-export statements the same way CodeLens/inline does.
- The definition occurrence is now identified by range intersection rather than list position, fixing miscounts when reference ordering varied.
- Fixed off-by-one decoration placement on files with CRLF line endings.
- CodeLens mode no longer leaves blank lenses for hidden (zero/non-zero filtered) symbols.
- Mermaid export now escapes labels so symbol/file names with quotes no longer break the diagram, and opens as a ready-to-paste fenced Markdown block.

### Changed
- **Dependencies** in the tree view are now resolved via the language server's call-hierarchy ("outgoing calls") instead of naive workspace-wide substring matching — far more accurate and no longer scans every file twice.
- Symbol detection now walks the document-symbol tree directly, removing the fragile regular-expression pre-pass (better handling of methods, getters/setters, and multi-line arrow functions).
- Test-file detection also recognises `__mocks__`.

### Tooling
- Added the missing ESLint configuration so `npm run lint` works.
- Updated `@typescript-eslint` to 7.x; `npm audit` now reports 0 vulnerabilities.

## [0.5.1] - 2025-12-08

### Fixed
- Fixed "View all references" link not working in hover tooltips

## [0.5.0] - 2025-12-08

### Added
- **Dependency Graph Visualization**: New sidebar tree view showing symbol dependencies
- **Bidirectional Tracking**: See both "Used By" (who references this) and "Dependencies" (what this uses)
- **Impact Analysis**: Understand what would be affected if a symbol is deleted
- **Interactive Navigation**: Click any item in the tree to jump to that location
- **Export to Mermaid**: Generate dependency diagrams for visualization
- **Context Menu Integration**: Right-click any symbol → "Show Dependencies"
- **File Grouping**: References organized by file for better overview

### Fixed
- Fixed hover tooltip showing icon syntax instead of proper icons

## [0.4.0] - 2025-12-08

### Added
- **Dependency Graph Visualization**: New sidebar tree view showing symbol dependencies
- **Bidirectional Tracking**: See both "Used By" (who references this) and "Dependencies" (what this uses)
- **Impact Analysis**: Understand what would be affected if a symbol is deleted
- **Interactive Navigation**: Click any item in the tree to jump to that location
- **Export to Mermaid**: Generate dependency diagrams that can be visualized
- **Context Menu Integration**: Right-click any symbol → "Show Dependencies"
- **File Grouping**: References organized by file for better overview

## [0.4.0] - 2025-12-08

### Added
- **Hover Provider**: Hover over any function, class, method, or interface name to see reference count
- Clickable "View all references" link in hover tooltip
- Shows first 5 reference locations directly in the hover
- Works in both inline and CodeLens modes
- Provides rich information about unused code when hovering

## [0.3.1] - 2025-12-08

### Fixed
- Clarified in documentation that inline decorations are not clickable (VS Code limitation)
- Updated README to explain that clickable references only work in CodeLens mode
- Added note about using workspace scanner for navigation in inline mode

## [0.3.0] - 2025-12-07

### Added
- **Workspace Scanner**: New command `ReferenceX: Scan for Unused Code` that scans your entire workspace
- Quick pick overview showing all files with unused symbols
- Instant navigation to any unused function, method, class, or interface
- Respects `excludeTests` and `showVariables` settings
- Progress indicator during workspace scan

## [0.2.4] - 2025-11-25

### Changed
- Updated extension icon with improved design

## [0.2.3] - 2025-11-24

### Changed
- Cleaned up README documentation with professional formatting (removed emojis)

## [0.2.2] - 2025-11-23

### Added
- New setting `referencex.showVariables` to show reference counts for variables and constants (including exports)
- Useful for tracking usage of exported constants and configuration values

## [0.2.1] - 2025-11-23

### Added
- Extension icon

## [0.2.0] - 2025-11-23

### Added
- Custom color configuration for each reference count range
- `onlyShowZeroReferences` setting to only highlight unused code
- Five customizable color settings: `colors.zero`, `colors.one`, `colors.few`, `colors.many`, `colors.lots`

### Changed
- Enhanced README with comprehensive documentation and examples
- Improved configuration options table

## [0.1.0] - 2025-11-23

### Added
- Initial release
- Inline reference count display at end of line
- CodeLens mode for displaying references above line
- Support for TypeScript, JavaScript, TSX, and JSX files
- Color-coded reference counts with emojis
- Configuration options:
  - Enable/disable extension
  - Show/hide zero references
  - Exclude test files
  - Toggle color decorations
  - Switch between inline and CodeLens display modes
- Detects functions, methods, classes, interfaces, and type aliases
- Clickable references to show all occurrences
- Real-time updates as code changes
