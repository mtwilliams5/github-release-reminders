#!/usr/bin/env node

/**
 * Sync agent instructions between AGENTS.md and .github/copilot-instructions.md
 * AGENTS.md is the source of truth, and this script generates the Copilot version
 * with the appropriate frontmatter.
 */

const fs = require('fs');
const path = require('path');

const AGENTS_MD = path.join(__dirname, '..', 'AGENTS.md');
const COPILOT_MD = path.join(
  __dirname,
  '..',
  '.github',
  'copilot-instructions.md',
);

// Read the source file (AGENTS.md)
const agentsContent = fs.readFileSync(AGENTS_MD, 'utf8');

// Extract just the content after the "# AI Agent Instructions" heading and note
// Skip the title, intro paragraph, and the "Note:" blockquote
const contentMatch = agentsContent.match(
  /# AI Agent Instructions\n\nThis document provides guidelines for AI coding agents working in this repository\.\n\n> \*\*Note:\*\*[^\n]*\n\n([\s\S]*)/,
);

if (!contentMatch) {
  console.error('Error: Could not parse AGENTS.md content');
  process.exit(1);
}

const instructionsContent = contentMatch[1];

// Create the Copilot version with frontmatter and auto-generated comment
const copilotContent = `---
applyTo: '**'
---
<!-- This file is auto-generated from AGENTS.md. Edit AGENTS.md and run 'yarn sync:agent-instructions' to update. -->

${instructionsContent}`;

// Write to .github/copilot-instructions.md
fs.writeFileSync(COPILOT_MD, copilotContent, 'utf8');

console.log(
  '✅ Successfully synced agent instructions from AGENTS.md to .github/copilot-instructions.md',
);
