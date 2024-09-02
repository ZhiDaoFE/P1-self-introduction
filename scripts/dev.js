const fs = require('fs');
const path = require('path');
const express = require('express');
const open = require('open');
const chokidar = require('chokidar');
const http = require('http');
const WebSocket = require('ws');

const app = express();
let port = 3001;
const projectDir = process.cwd();

const checkPort = (port, callback) => {
  const server = http.createServer().listen(port);
  server.on('listening', () => {
    server.close();
    callback(true);
  });
  server.on('error', () => {
    callback(false);
  });
};

const getFoldersWithHtmlFiles = () => {
  const folders = fs.readdirSync(projectDir)
    .filter(folder => /^s\d+$/.test(folder))
    .map(folder => {
      const folderPath = path.join(projectDir, folder);
      const files = fs.readdirSync(folderPath);
      const htmlFile = files.includes('index.html') ? 'index.html' : files.find(file => file.endsWith('.html'));
      return {
        folder: folder.toLowerCase(),
        htmlFile
      };
    }).filter(item => item.htmlFile);
  return folders;
};

app.get('/', (_req, res) => {
  const folders = getFoldersWithHtmlFiles();
  const links = folders.map(({ folder, htmlFile }) => {
    return `<li><a href="/folder/${folder}/${htmlFile}">打开 ${folder}/${htmlFile}</a></li>`;
  }).join('');

  const html = `
  <!DOCTYPE html>
  <html lang="zh-CN">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>项目链接</title>
  </head>
  <body>
    <h1>项目链接</h1>
    <ul>
      ${links}
    </ul>
  </body>
  </html>`;
  
  res.send(html);
});

app.get('/folder/:folder/:file', (req, res) => {
  const folder = req.params.folder.toUpperCase();
  const filePath = path.join(projectDir, folder, req.params.file);
  
  let html = fs.readFileSync(filePath, 'utf8');
  const wsScript = `
  <script>
    const ws = new WebSocket('ws://' + location.host);
    ws.onmessage = function(event) {
      if(event.data === 'refresh') {
        location.reload();
      }
    };
  </script>`;
  html = html.replace('</body>', `${wsScript}</body>`); // Inject the script before the closing body tag
  
  res.send(html);
});

const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

// Notify all connected clients about the file change
const notifyClients = () => {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send('refresh');
    }
  });
};

const startServer = () => {
  server.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}/`);
    open(`http://localhost:${port}/`);
  }).on('error', () => {
    console.log(`端口 ${port} 已被占用，尝试使用端口 ${port + 1}...`);
    port += 1;
    startServer();
  });
};

const foldersToWatch = getFoldersWithHtmlFiles().map(item => path.join(projectDir, item.folder));
foldersToWatch.forEach(folderPath => {
  chokidar.watch(folderPath).on('change', () => {
    notifyClients();
  });
});

checkPort(port, (isAvailable) => {
  if (isAvailable) {
    startServer();
  } else {
    console.log(`端口 ${port} 已被占用，尝试使用端口 ${port + 1}...`);
    port += 1;
    startServer();
  }
});
