# Mochi MD

Mochi MD 是一个给自己使用的 macOS Markdown 阅读与编辑器。它把 Markdown 源码编辑、实时预览和个人主题放在同一个轻量窗口里，并保留文档的真实文件路径。

当前版本：**0.4.0**

## 下载

打开 GitHub 仓库的 **Releases** 页面，下载最新的 `Mochi MD-macOS.zip`，解压后将 `Mochi MD.app` 拖入“应用程序”即可。

## 功能

- Markdown 新建、打开、编辑和手动保存
- 编辑、预览、分屏和专注模式
- 巧克力、草莓、像素、淡紫莓果、极简 Ins、程序员等阅读主题
- 收藏、最近编辑、拖放打开和 Finder 文件位置
- 按当前预览样式导出 PDF
- 自定义头像、书桌名称和描述
- `.md`、`.markdown` 文件关联与 Mochi MD 文档图标

## 本地构建

需要 macOS、Xcode Command Line Tools 和 WebKit。执行：

```bash
./scripts/build-macos.sh
```

构建结果在 `dist/`：一个可运行的 `Mochi MD.app` 和一个可分发的 `Mochi MD-macOS.zip`。

## 项目结构

- `outputs/mochi-md/`：前端界面、主题和 Markdown 预览逻辑
- `work/mochi-md-native/`：macOS 原生壳、文件选择、保存、PDF 导出和文件关联
- `scripts/build-macos.sh`：本地构建脚本
- `.github/workflows/release-macos.yml`：推送版本标签后自动构建 GitHub Release

## 发布新版本

修改版本号后提交代码，再创建并推送版本标签：

```bash
git add .
git commit -m "Release v0.4.1"
git tag v0.4.1
git push origin main --tags
```

GitHub Actions 会自动构建并发布 macOS 压缩包，版本轨迹会保留在提交记录和 Releases 页面中。
