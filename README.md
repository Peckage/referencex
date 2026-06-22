# ReferenceX

A VS Code extension that shows inline reference counts for TypeScript/JavaScript functions, methods, and classes - helping you identify unused code and understand your codebase at a glance.

## Features

- **Dependency Graph Visualization** - Interactive tree view showing symbol dependencies and relationships, powered by the language server's call hierarchy for accurate results
- **Impact Analysis** - See what would be affected if you delete a symbol
- **Inline Reference Counts** - See how many times each symbol is referenced, right where it's defined
- **Interactive Hover** - Hover over any symbol to see reference count and clickable link to view all references
- **Workspace Scanner** - Scan entire workspace for unused code with instant overview and navigation
- **Export to Mermaid** - Generate dependency diagrams for documentation
- **Variable Tracking** - Optionally track references for variables and constants (including exports)
- **Two Display Modes** - Choose between inline (end of line) or CodeLens (above line) display
- **Color-Coded Indicators** - Visual feedback based on usage frequency
- **Real-Time Updates** - Automatically refreshes as you code
- **Smart Detection** - Works with functions, methods, classes, interfaces, and type aliases
- **Clickable References** - Click any count in CodeLens mode or hover tooltips to view all references
- **Highly Customizable** - Configure display, colors, and behavior to your preference

## Display Modes

### Inline Mode (Default)
Reference counts appear at the end of the line - clean and unobtrusive:

```typescript
function calculateTotal(items: Item[]) {  ● 12 refs
  return items.reduce((sum, item) => sum + item.price, 0);
}

class UserService {  ● 5 refs
  async getUser(id: string) {  ● 8 refs
    // implementation
  }
}

const unusedHelper = () => {  ○ 0 refs
  // This function is never used!
};
```

### CodeLens Mode
Traditional CodeLens display above each symbol - clickable to view all references:

```typescript
● 12 references  ← Click to see all references
function calculateTotal(items: Item[]) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

● 5 references  ← Click to see all references
class UserService {
  ● 8 references  ← Click to see all references
  async getUser(id: string) {
    // implementation
  }
}

○ 0 references
const unusedHelper = () => {
  // This function is never used!
};
```

> **Tip:** In both modes, you can hover over any symbol name to see reference count and click to view all references!

## Color Coding

When enabled, reference counts are color-coded for quick visual feedback:

- **0 references** - Unused code (gray)
- **1 reference** - Single usage (blue)
- **2-4 references** - Normal usage (green)
- **5-9 references** - Popular (yellow)
- **10+ references** - Heavily used (orange/red)

## Configuration

Customize ReferenceX to match your workflow:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `referencex.enabled` | boolean | `true` | Enable/disable the extension |
| `referencex.displayMode` | string | `"inline"` | Display mode: `"inline"` or `"codelens"` |
| `referencex.showZeroReferences` | boolean | `true` | Show indicators for unused code |
| `referencex.onlyShowZeroReferences` | boolean | `false` | Only show unused code (0 refs), hide all others |
| `referencex.showVariables` | boolean | `false` | Show references for variables and constants (including exports) |
| `referencex.decorateWithColor` | boolean | `true` | Use color-coded emojis |
| `referencex.excludeTests` | boolean | `false` | Exclude test files from reference counting |
| `referencex.colors.zero` | string | `#858585` | Color for 0 references (gray) |
| `referencex.colors.one` | string | `#4EC9B0` | Color for 1 reference (cyan) |
| `referencex.colors.few` | string | `#4EC9B0` | Color for 2-4 references (cyan) |
| `referencex.colors.many` | string | `#DCDCAA` | Color for 5-9 references (yellow) |
| `referencex.colors.lots` | string | `#CE9178` | Color for 10+ references (orange) |

### Example Configuration

```json
{
  "referencex.displayMode": "inline",
  "referencex.decorateWithColor": true,
  "referencex.showZeroReferences": true,
  "referencex.onlyShowZeroReferences": false,
  "referencex.showVariables": false,
  "referencex.excludeTests": false,
  "referencex.colors.zero": "#858585",
  "referencex.colors.lots": "#FF6B6B"
}
```

> **Tip:** Set `onlyShowZeroReferences: true` to only highlight dead code!  
> **Tip:** Customize colors to match your theme using any hex color code.

## Usage

1. Install the extension
2. Open any TypeScript or JavaScript file
3. Reference counts will automatically appear next to your functions, classes, and methods
4. **Hover** over any symbol name to see reference count and click "View all references"
5. In CodeLens mode, click on any reference count to view all references in the references panel
6. Use **Command Palette** (`Ctrl/Cmd + Shift + P`) → `ReferenceX: Scan for Unused Code` to get workspace-wide overview
7. Configure settings via VS Code preferences (`Ctrl/Cmd + ,` → search "ReferenceX")

## Supported Languages

- TypeScript (`.ts`)
- JavaScript (`.js`)
- TypeScript React (`.tsx`)
- JavaScript React (`.jsx`)

## What Gets Detected

- Functions (regular and arrow)
- Class declarations
- Methods (including getters/setters)
- Interfaces
- Type aliases
- Constructors
- Variables and constants (when `showVariables` is enabled)

## Use Cases

- **Find Dead Code** - Quickly identify unused functions and classes
- **Refactoring** - Understand impact before making changes
- **Code Review** - Spot over-used or under-used code patterns
- **Learning Codebases** - See which functions are central to the project
- **API Design** - Identify heavily-used public APIs

## Requirements

- VS Code 1.85.0 or higher
- TypeScript/JavaScript language support (built into VS Code)

## License

MIT

## Issues & Feedback

Found a bug or have a feature request? [Open an issue on GitHub](https://github.com/Peckage/referencex/issues)

## Credits

Created by [Peckage](https://github.com/Peckage)

---

**Enjoy cleaner, more maintainable code with ReferenceX!**
