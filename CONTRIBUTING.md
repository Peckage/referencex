# Contributing to ReferenceX

Thank you for your interest in contributing to ReferenceX! This document provides guidelines and instructions to help you get started.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Testing the Extension Locally](#testing-the-extension-locally)
- [Making Changes](#making-changes)
- [Pull Request Process](#pull-request-process)
- [Coding Guidelines](#coding-guidelines)
- [Reporting Issues](#reporting-issues)

## Code of Conduct

By participating in this project, you agree to maintain a respectful and inclusive environment for everyone. Please be kind and courteous in all interactions.

## Getting Started

1. **Fork the repository** on GitHub

2. **Clone your fork** locally:

   ```bash
   git clone https://github.com/YOUR_USERNAME/referencex.git
   cd referencex
   ```

3. **Add the upstream remote**:

   ```bash
   git remote add upstream https://github.com/Peckage/referencex.git
   ```

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) (v18.x or later)
- [Visual Studio Code](https://code.visualstudio.com/) (v1.85.0 or later)
- [Git](https://git-scm.com/)

### Installation

1. Install dependencies:

   ```bash
   npm install
   ```

2. Compile the TypeScript code:

   ```bash
   npm run compile
   ```

3. For development with auto-recompilation on file changes:

   ```bash
   npm run watch
   ```

## Testing the Extension Locally

### Method 1: Using VS Code's Extension Development Host

1. Open the project in VS Code:

   ```bash
   code .
   ```

2. Start the watch task to automatically recompile on changes:

   - Press `Ctrl+Shift+B` (or `Cmd+Shift+B` on macOS) and select **npm: watch**
   - Or run `npm run watch` in the terminal

3. Launch the Extension Development Host:

   - Press `F5` or go to **Run > Start Debugging**
   - This opens a new VS Code window with the extension loaded

4. In the new window:

   - Open any TypeScript or JavaScript project
   - You should see reference counts appearing on functions, classes, and methods
   - Test features like:
     - Reference CodeLens/inline decorations
     - "Scan for Unused Code" command (`Ctrl+Shift+P` → "ReferenceX: Scan for Unused Code")
     - "Show Dependencies" command (right-click in editor)
     - Dependency Tree view in the Explorer sidebar

5. To reload after making changes:

   - If watch mode is running, changes compile automatically
   - Press `Ctrl+Shift+F5` to restart the Extension Development Host

### Method 2: Manual Testing with VSIX Package

1. Package the extension:

   ```bash
   npx vsce package
   ```

2. Install the generated `.vsix` file:

   - In VS Code, go to Extensions view (`Ctrl+Shift+X`)
   - Click the `...` menu and select "Install from VSIX..."
   - Select the generated `.vsix` file

### Debugging Tips

- Use `console.log()` statements in your code; output appears in the Debug Console
- Set breakpoints in VS Code to step through the extension code
- Check the Output panel (`View > Output`) and select "ReferenceX" from the dropdown

## Making Changes

1. **Create a feature branch**:

   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the [coding guidelines](#coding-guidelines)

3. **Test thoroughly** using the methods described above

4. **Run the linter**:

   ```bash
   npm run lint
   ```

5. **Commit your changes** with a descriptive message:

   ```bash
   git commit -m "feat: add your feature description"
   ```

   We follow [Conventional Commits](https://www.conventionalcommits.org/):
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `refactor:` for code refactoring
   - `chore:` for maintenance tasks

## Pull Request Process

1. **Push your branch** to your fork:

   ```bash
   git push origin feature/your-feature-name
   ```

2. **Open a Pull Request** against the `main` branch of the upstream repository

3. **Fill out the PR template** with:
   - A clear description of the changes
   - Any related issue numbers
   - Screenshots or GIFs if applicable

4. **Address review feedback** promptly

5. Once approved, your PR will be merged

## Coding Guidelines

### TypeScript

- Use TypeScript strict mode
- Prefer `const` over `let` where possible
- Use meaningful variable and function names
- Add JSDoc comments for public APIs
- Keep functions small and focused

### Project Structure

```txt
src/
├── extension.ts          # Extension entry point and activation
├── codeLensProvider.ts   # CodeLens/inline reference display
├── hoverProvider.ts      # Hover information provider
├── dependencyTreeProvider.ts  # Dependency tree view
└── unusedCodeScanner.ts  # Unused code scanning functionality
```

### VS Code Extension Best Practices

- Dispose of resources properly in the `deactivate` function
- Use the VS Code API efficiently to avoid performance issues
- Register commands with proper context when conditions
- Test with different VS Code themes (light/dark)

## Reporting Issues

Found a bug or have a feature request? Please [open an issue](https://github.com/Peckage/referencex/issues/new) with:

- A clear, descriptive title
- Steps to reproduce (for bugs)
- Expected vs actual behavior
- VS Code version and OS information
- Relevant code snippets or screenshots

---

Thank you for contributing to ReferenceX! Your help makes this extension better for everyone. 🎉
