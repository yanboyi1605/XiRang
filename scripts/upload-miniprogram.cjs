/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');

let ci;
try {
  ci = require('miniprogram-ci');
} catch {
  console.error('缺少 miniprogram-ci。请先运行：npm install -D miniprogram-ci');
  process.exit(1);
}

const appid = process.env.WX_APPID;
const privateKeyPath = process.env.WX_PRIVATE_KEY_PATH;
const version = process.env.WX_VERSION || '1.0.0';
const desc = process.env.WX_DESC || `息壤股票分红计算器 ${version}`;

if (!appid || !privateKeyPath) {
  console.error('请设置 WX_APPID 和 WX_PRIVATE_KEY_PATH 环境变量。');
  console.error('代码上传密钥在：微信公众平台 → 开发管理 → 开发设置 → 小程序代码上传。');
  process.exit(1);
}
if (!fs.existsSync(privateKeyPath)) {
  console.error(`找不到上传密钥：${privateKeyPath}`);
  process.exit(1);
}

const projectPath = path.resolve(__dirname, '..', 'miniprogram');
const project = new ci.Project({
  appid,
  type: 'miniProgram',
  projectPath,
  privateKeyPath,
  ignores: ['node_modules/**/*'],
});

ci.upload({
  project,
  version,
  desc,
  robot: Number(process.env.WX_ROBOT || 1),
  setting: {
    es6: true,
    minify: true,
    autoPrefixWXSS: true,
    urlCheck: false,
  },
  onProgressUpdate: (task) => {
    if (task && task.message) console.log(task.message);
  },
})
  .then((result) => {
    console.log('上传成功，请到公众平台提交审核。');
    console.log(result);
  })
  .catch((error) => {
    console.error('上传失败：', error);
    process.exitCode = 1;
  });
