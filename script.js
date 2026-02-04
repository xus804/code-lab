// --- Configuration & State ---
const API_URL = '/execute';
const DEFAULT_LANG = 'javascript';

// Default code templates
const TEMPLATES = {
    javascript: `// JavaScript - Node.js
console.log("Hello from CodeLab!");
const numbers = [1, 2, 3, 4, 5];
const sum = numbers.reduce((a, b) => a + b, 0);
console.log("Sum:", sum);`,

    python: `# Python 3
import sys

def greet(name):
    return f"Hello, {name}!"

print(greet("CodeLab"))
print(f"Python Version: {sys.version.split()[0]}")`,

    java: `// Java
// Main class must be named 'Main'
public class Main {
    public static void main(String[] args) {
        System.out.println("Hello from Java!");
        for(int i = 1; i <= 3; i++) {
            System.out.println("Count: " + i);
        }
    }
}`,

    cpp: `// C++
#include <iostream>
#include <vector>

int main() {
    std::cout << "Hello from C++!" << std::endl;
    std::vector<int> v = {1, 2, 3};
    for(int n : v) {
        std::cout << n << " ";
    }
    return 0;
}`,

    csharp: `// C#
using System;
using System.Linq;

class Program {
    static void Main() {
        Console.WriteLine("Hello from C#!");
        var numbers = new[] { 1, 2, 3, 4, 5 };
        Console.WriteLine($"Average: {numbers.Average()}");
    }
}`,
    go: `// Go
package main
import "fmt"

func main() {
    fmt.Println("Hello from Go!")
}`,
    rust: `// Rust
fn main() {
    println!("Hello from Rust!");
}`,
    php: `<?php
echo "Hello from PHP!\\n";
echo "Version: " . phpversion();
?>`
};

// Map DOM elements
const els = {
    lang: document.getElementById('langSelect'),
    run: document.getElementById('runBtn'),
    reset: document.getElementById('resetBtn'),
    clear: document.getElementById('clearBtn'),
    output: document.getElementById('output'),
    saveStatus: document.getElementById('saveStatus')
};

// --- Editor Initialization ---
const editor = CodeMirror(document.getElementById('editor'), {
    mode: 'javascript',
    theme: 'dracula',
    lineNumbers: true,
    autoCloseBrackets: true,
    matchBrackets: true,
    tabSize: 4,
    indentUnit: 4,
    lineWrapping: true
});

// --- Logic ---

// 1. Language Switching & Persistence
const loadCode = (lang) => {
    // Try to get saved code from localStorage first
    const saved = localStorage.getItem(`codelab_v2_${lang}`);
    if (saved) {
        editor.setValue(saved);
        els.saveStatus.textContent = "Restored from storage";
    } else {
        editor.setValue(TEMPLATES[lang] || '// No template available');
        els.saveStatus.textContent = "Loaded template";
    }
    
    // Update CodeMirror mode
    const modeMap = {
        javascript: 'javascript', python: 'python', java: 'text/x-java',
        cpp: 'text/x-c++src', csharp: 'text/x-csharp', go: 'go', 
        rust: 'rust', php: 'php'
    };
    editor.setOption('mode', modeMap[lang]);
};

els.lang.addEventListener('change', (e) => loadCode(e.target.value));

// 2. Autosave
editor.on('change', () => {
    const lang = els.lang.value;
    const code = editor.getValue();
    localStorage.setItem(`codelab_v2_${lang}`, code);
    els.saveStatus.textContent = "Saved";
    setTimeout(() => els.saveStatus.textContent = "", 2000);
});

// 3. Execution
const runCode = async () => {
    const lang = els.lang.value;
    const code = editor.getValue();
    
    // UI State: Loading
    els.run.disabled = true;
    els.run.innerHTML = `<span class="spinner">↻</span> Running...`;
    els.output.innerHTML = `<div class="log-system">Executing ${lang}...</div>`;

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // Client-side timeout safety

        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language: lang, code }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const data = await res.json();

        // UI State: Result
        els.output.innerHTML = ''; // Clear loading msg

        if (data.success) {
            // Stdout
            if (data.output.trim()) {
                els.output.innerHTML += `<div class="log-success">${escapeHtml(data.output)}</div>`;
            } else {
                els.output.innerHTML += `<div class="log-system">Program completed successfully (No output).</div>`;
            }
            // Stderr (Warnings/Errors during execution)
            if (data.stderr) {
                els.output.innerHTML += `<div class="log-error">STDERR:\n${escapeHtml(data.stderr)}</div>`;
            }
        } else {
            // Execution Failed
            els.output.innerHTML += `<div class="log-error">ERROR:\n${escapeHtml(data.error)}</div>`;
            if (data.stderr) {
                els.output.innerHTML += `<div class="log-error">\n${escapeHtml(data.stderr)}</div>`;
            }
        }
        
    } catch (err) {
        els.output.innerHTML = `<div class="log-error">Network/System Error: ${err.message}</div>`;
    } finally {
        els.run.disabled = false;
        els.run.innerHTML = `<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> <span>Run Code</span>`;
    }
};

els.run.addEventListener('click', runCode);

// 4. Utilities
els.reset.addEventListener('click', () => {
    if(confirm('Reset code to default template? This will erase your changes.')) {
        const lang = els.lang.value;
        editor.setValue(TEMPLATES[lang]);
        localStorage.removeItem(`codelab_v2_${lang}`);
    }
});

els.clear.addEventListener('click', () => {
    els.output.innerHTML = '<div class="placeholder">Ready to execute. Press Run or Ctrl+Enter.</div>';
});

// Helper to prevent XSS in output
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// 5. Shortcuts
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        runCode();
    }
});

// Init
loadCode(DEFAULT_LANG);
