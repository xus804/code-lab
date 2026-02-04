#!/usr/bin/env node
const http = require('http');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { randomBytes } = require('crypto');

// --- Configuration ---
const PORT = process.env.PORT || 3000;
const TEMP_DIR = path.join(__dirname, 'temp');
const TIMEOUT_MS = 10000; // 10 seconds max execution time

// Ensure temp directory exists
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR);

// --- Language Definitions ---
// Note: These assume the compilers are in your system PATH.
const LANGUAGES = {
    javascript: { 
        ext: '.js', 
        cmd: (f) => `node "${f}"` 
    },
    python: { 
        ext: '.py', 
        // Tries python3 first, then python (for Windows compatibility)
        cmd: (f) => process.platform === 'win32' ? `python "${f}"` : `python3 "${f}"` 
    },
    java: { 
        ext: '.java', 
        // Java needs to be compiled then run. We set classpath to the temp dir.
        cmd: (f, dir) => `javac "${f}" && java -cp "${dir}" Main`,
        filename: 'Main.java'
    },
    cpp: { 
        ext: '.cpp', 
        cmd: (f, dir, name) => {
            const out = path.join(dir, name); // Output binary path
            const isWin = process.platform === 'win32';
            return `g++ "${f}" -o "${out}" && "${out}${isWin ? '.exe' : ''}"`;
        }
    },
    csharp: {
        ext: '.cs',
        cmd: (f, dir, name) => {
            const out = path.join(dir, name + '.exe');
            return `mcs "${f}" -out:"${out}" && mono "${out}"`;
        }
    },
    go: { ext: '.go', cmd: (f) => `go run "${f}"` },
    rust: { 
        ext: '.rs', 
        cmd: (f, dir, name) => {
            const out = path.join(dir, name); 
            const isWin = process.platform === 'win32';
            return `rustc "${f}" -o "${out}" && "${out}${isWin ? '.exe' : ''}"`;
        }
    },
    php: { ext: '.php', cmd: (f) => `php "${f}"` }
};

// --- Core Logic ---

const executeCode = (lang, code, callback) => {
    const config = LANGUAGES[lang];
    if (!config) return callback({ error: `Language '${lang}' not supported.` });

    // Generate unique ID for this run
    const runId = randomBytes(8).toString('hex');
    const fileName = config.filename || `s_${runId}${config.ext}`;
    const filePath = path.join(TEMP_DIR, fileName);

    // Write code to disk
    try {
        fs.writeFileSync(filePath, code);
    } catch (e) {
        return callback({ error: 'Server failed to write file.' });
    }

    // Prepare Command
    const command = config.cmd(filePath, TEMP_DIR, `bin_${runId}`);
    
    console.log(`[${new Date().toISOString()}] EXEC ${lang}: ${runId}`);

    exec(command, { timeout: TIMEOUT_MS }, (err, stdout, stderr) => {
        // Cleanup Immediately
        cleanup(filePath, runId, config.ext);

        if (err) {
            // Distinguish between timeout and compile error
            if (err.killed) {
                return callback({ error: 'Execution Timed Out (Max 10s)', stderr: 'Process killed.' });
            }
            // Often stderr contains the compile error, so we send that back
            return callback({ 
                success: false, 
                error: 'Execution Failed', 
                stderr: stderr || err.message 
            });
        }

        callback({ success: true, output: stdout, stderr: stderr });
    });
};

const cleanup = (filePath, runId, ext) => {
    try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        
        // Clean up compiled binaries if they exist
        const dir = path.dirname(filePath);
        
        // C++/Rust binaries
        const binPath = path.join(dir, `bin_${runId}`);
        if (fs.existsSync(binPath)) fs.unlinkSync(binPath);
        if (fs.existsSync(binPath + '.exe')) fs.unlinkSync(binPath + '.exe');

        // Java class
        const classPath = path.join(dir, 'Main.class');
        if (fs.existsSync(classPath)) fs.unlinkSync(classPath);

    } catch (e) {
        console.error('Cleanup Error:', e);
    }
};

// --- HTTP Server ---

const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((req, res) => {
    // Enable CORS for development flexibility
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    // 1. API: Execute
    if (req.method === 'POST' && req.url === '/execute') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { language, code } = JSON.parse(body);
                if (!language || !code) throw new Error("Missing params");
                
                executeCode(language, code, (result) => {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(result));
                });
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: "Invalid request" }));
            }
        });
        return;
    }

    // 2. Static Files
    let file = req.url === '/' ? 'index.html' : req.url.substring(1);
    const ext = path.extname(file);
    const filePath = path.join(__dirname, file);

    // Prevent directory traversal attacks
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403); res.end('Forbidden'); return;
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            res.writeHead(404); res.end('Not Found');
        } else {
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
            res.end(content);
        }
    });
});

server.listen(PORT, () => {
    console.log(`\n✨ CodeLab Ultimate is running!`);
    console.log(`👉 Open: http://localhost:${PORT}`);
    console.log(`💻 Log: Watching for code execution...\n`);
});
