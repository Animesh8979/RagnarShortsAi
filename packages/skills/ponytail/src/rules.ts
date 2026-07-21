// ponytail/src/rules.ts — Static analysis rules for minimal code
import * as fs from 'fs';
import * as path from 'path';

export interface Violation {
  file: string;
  line: number;
  rule: string;
  message: string;
  fixable: boolean;
}

export interface RuleConfig {
  enabled: boolean;
  severity: 'error' | 'warn';
}

/** Check if a line contains a forbidden loop construct */
export function checkNoLoops(line: string): boolean {
  const loopKeywords = ['for(', 'for (', 'while(', 'while (', 'do {', 'do{'];
  return loopKeywords.some(kw => line.includes(kw));
}

/** Check if a line indicates a nested if (simple heuristic) */
export function checkNoNestedIfs(lines: string[], index: number): boolean {
  const currentIndent = lines[index].search(/\S/);
  if (index === 0) return false;
  const prevIndent = lines[index - 1].search(/\S/);
  return lines[index].trim().startsWith('if ') && currentIndent > prevIndent;
}

/** Check if a line defines a class */
export function checkNoClasses(line: string): boolean {
  return /class\s+\w+/.test(line);
}

/** Check if a line contains a comment */
export function checkNoComments(line: string): boolean {
  return line.trim().startsWith('//') || line.trim().startsWith('/*');
}

/** Analyze a file and return all violations */
export function analyzeFile(filePath: string): Violation[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const violations: Violation[] = [];

  lines.forEach((line, index) => {
    if (checkNoLoops(line)) {
      violations.push({
        file: filePath,
        line: index + 1,
        rule: 'no-loops',
        message: 'Use array methods instead of loops',
        fixable: true,
      });
    }
    if (checkNoNestedIfs(lines, index)) {
      violations.push({
        file: filePath,
        line: index + 1,
        rule: 'no-nested-ifs',
        message: 'Extract nested if to early return or function',
        fixable: false,
      });
    }
    if (checkNoClasses(line)) {
      violations.push({
        file: filePath,
        line: index + 1,
        rule: 'no-classes',
        message: 'Use factory functions instead of classes',
        fixable: true,
      });
    }
    if (checkNoComments(line)) {
      violations.push({
        file: filePath,
        line: index + 1,
        rule: 'no-comments',
        message: 'Remove comment, use self-documenting code',
        fixable: true,
      });
    }
  });

  return violations;
}

/** Analyze all .ts and .tsx files in a directory recursively */
export function analyzeDir(dirPath: string): Violation[] {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let violations: Violation[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      violations = violations.concat(analyzeDir(fullPath));
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      violations = violations.concat(analyzeFile(fullPath));
    }
  }

  return violations;
}
