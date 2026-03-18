# Floating Icon Extension

一个纳西妲基于当前页面信息进行聊天的浏览器插件

功能：

- 打开任意网页后自动注入一个悬浮图标
- 悬浮图标支持鼠标拖动
- 拖动后会记住位置，下次打开网页继续沿用
- 点击悬浮图标可打开对话框
- 对话框支持拖动（拖拽标题栏）与调整大小（右下角 resize）
- 对话框弹出位置会锚定在悬浮图标附近，并在超出页面时自动向内收敛
- 对话框显示时悬浮图标会自动隐藏，关闭对话框后恢复显示
- 扩展栏图标也会使用你的图片
- 当前图标资源放在 `assets/floating-icon.svg`

对话框关闭方式：

- 点击遮罩层
- 点击右上角“关闭”按钮

## 目录说明

- `manifest.json`: 插件配置
- `content.js`: 注入悬浮图标、对话框、拖动/定位逻辑
- `assets/floating-icon.svg`: 当前默认展示的悬浮图标

## 本地加载方式

1. 打开 Chrome 或 Edge
2. 进入扩展管理页
3. 打开“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 选择当前目录

## 开发与构建

本项目使用 `esbuild` 将 `src/` 下的源码打包成根目录的 `content.js`（供 `manifest.json` 直接引用）。

- 构建一次：

```bash
npm install
npm run build
```

- 开发监听（修改后自动重新打包）：

```bash
npm run dev
```

## 替换成你自己的原图

如果你后面想把图标换成你手里的原始图片，只需要：

1. 把你的原图放到 `assets/floating-icon.png`
2. 回到扩展管理页点击重新加载

插件会优先使用 `assets/floating-icon.png`，如果没有这个文件，才会自动回退到当前的 `assets/floating-icon.svg`。

如果 `assets/floating-icon.png` 已经存在，还可以继续生成扩展栏需要的多尺寸图标文件：

- `assets/icon-16.png`
- `assets/icon-32.png`
- `assets/icon-48.png`
- `assets/icon-128.png`
