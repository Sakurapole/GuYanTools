const fs = require('fs');
const path = require('path');

// 源目录和目标目录
const sourceDir = path.join(__dirname, '../../multi_platform_core');
const targetDir = path.join(__dirname, '../node_modules/@guyantools/core');

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
  console.log('Target directory does not exist:', targetDir);
  process.exit(0);
}

// 复制所有 .node 文件
const files = fs.readdirSync(sourceDir);
const nodeFiles = files.filter(file => file.endsWith('.node'));

if (nodeFiles.length === 0) {
  console.log('No .node files found in:', sourceDir);
  process.exit(0);
}

nodeFiles.forEach(file => {
  const sourcePath = path.join(sourceDir, file);
  const targetPath = path.join(targetDir, file);
  
  try {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied: ${file}`);
  } catch (error) {
    console.error(`Failed to copy ${file}:`, error.message);
  }
});

console.log(`Successfully copied ${nodeFiles.length} native module(s)`);
