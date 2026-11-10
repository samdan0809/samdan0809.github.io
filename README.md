# samdan0809 的工具箱

个人 GitHub Pages 工具导航页。**新工具只要放进任意子目录（含 `index.html`），推送后刷新首页就会自动出现**，无需修改任何代码。

线上地址：https://samdan0809.github.io/

## 目录结构

```
samdan0809.github.io/
├── index.html            # 首页（工具导航门户）
├── projects.js           # 工具清单（可选，用于补充标题/描述/图标/标签）
├── assets/
│   ├── css/style.css     # 首页样式
│   └── js/app.js         # 首页逻辑（GitHub API 自动发现 + 渲染）
├── demo-tool/            # 示例工具（可删除，仅作演示）
│   └── index.html
└── README.md
```

## 如何添加新工具（日常使用）

1. 在仓库根目录新建一个文件夹，例如 `my-tool/`；
2. 放入你的工具页面 `my-tool/index.html`（纯静态即可，无构建要求）；
3. `git push` 推送到 GitHub；
4. 刷新首页 —— 工具已自动上架，标题默认取目录名。

可选：在 `projects.js` 的 `projects` 数组里补一条元数据，让卡片更好看：

```js
{
  dir: 'my-tool',                 // 子目录名
  title: '我的工具',               // 标题（缺省用目录名美化）
  description: '这个工具做什么…',  // 描述
  icon: '🚀',                     // 图标 emoji
  tags: ['效率'],                 // 标签，首页可筛选
  featured: false,                // true 置顶
  order: 10                       // 排序权重，越小越靠前
}
```

不填 `projects` 也能用：首页会自动扫描仓库里所有含 `index.html` 的子目录，并抓取各工具页面的 `<title>` 和 `<meta name="description">` 作为默认标题和描述。

## 自动发现原理

首页通过 GitHub 公开 API 拉取仓库文件树（`git/trees/HEAD?recursive=1`，无需令牌），找出所有包含 `index.html` 的目录，与 `projects.js` 清单合并后渲染。附带机制：

- **本地缓存**：扫描结果在浏览器缓存 10 分钟，打开时先渲染缓存、后台静默刷新；
- **限额降级**：未登录 GitHub API 限额为 60 次/小时，超额时自动改用缓存或清单数据，并在页面状态行提示；
- **忽略目录**：`assets`、`.github`、`node_modules` 等默认排除（可在 `projects.js` 的 `settings.exclude` 中增删）；
- **手动刷新**：点首页右上角 ⟳ 按钮可强制重新扫描。

## 本地预览

```bash
# 任选其一
python -m http.server 8000
npx serve .
```

然后访问 http://localhost:8000 。直接双击 `index.html`（file:// 协议）也能打开，清单模式正常，自动发现取决于浏览器是否允许跨域请求。

## 其他说明

- 推送到 GitHub 后，Pages 部署通常需 1 分钟左右生效；标题抓取走 raw 源，一般立即生效。
- 想换首页标题/副标题/默认图标：改 `projects.js` 顶部的 `settings`。
- 若以后绑定了自定义域名（不再是 `xxx.github.io`），请在 `settings.githubRepo` 中手动填写仓库名，如 `"samdan0809/samdan0809.github.io"`，自动发现才能继续工作。
- 若部署为项目页（`user.github.io/repo` 形式），需同时设置 `githubRepo` 和 `basePath`（如 `"/repo"`）。
