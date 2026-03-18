# Floating Icon Extension

一个最小可用的浏览器插件项目。

功能：

- 打开任意网页后自动注入一个悬浮图标
- 悬浮图标支持鼠标拖动
- 拖动后会记住位置，下次打开网页继续沿用
- 扩展栏图标也会使用你的图片
- 当前图标资源放在 `assets/floating-icon.svg`

## 目录说明

- `manifest.json`: 插件配置
- `content.js`: 注入悬浮图标和拖动逻辑
- `assets/floating-icon.svg`: 当前默认展示的悬浮图标

## 本地加载方式

1. 打开 Chrome 或 Edge
2. 进入扩展管理页
3. 打开“开发者模式”
4. 选择“加载已解压的扩展程序”
5. 选择当前目录

目录路径：

`/Users/yoursigh/Desktop/my/floating-icon-extension`

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
