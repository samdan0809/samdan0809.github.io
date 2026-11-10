/* ============================================================
 * 工具箱项目清单（元数据）
 * ------------------------------------------------------------
 * 这里的 projects 数组只是"锦上添花"：即使不填任何条目，
 * 首页也会通过 GitHub API 自动发现所有含 index.html 的子目录。
 * 填了条目，就可以自定义标题、描述、图标、标签、置顶等。
 *
 * 字段说明：
 *   dir         子目录名（如 "demo-tool"），对应网址 /demo-tool/
 *   title       标题（缺省用目录名美化）
 *   description 描述
 *   icon        图标 emoji
 *   tags        标签数组，用于首页筛选
 *   featured    true 时置顶显示
 *   order       排序权重，数字越小越靠前（默认 999）
 *   url         外部链接（填了就变成外链卡片，忽略 dir）
 *
 * settings 字段：
 *   title / subtitle   首页标题与副标题
 *   githubRepo         仓库名，默认自动识别；自定义域名时需手动填写
 *   basePath           项目页部署时的路径前缀，如 "/my-repo"
 *   exclude           自动发现时忽略的目录
 *   defaultIcon       未登记工具使用的默认图标
 * ============================================================ */
window.SAMDAN_PROJECTS = {
  settings: {
    title: 'samdan0809 的工具箱',
    subtitle: '把文件夹丢进仓库，刷新即自动上架',
    githubRepo: '',
    basePath: '',
    exclude: ['assets', 'node_modules', '.github', '.git'],
    defaultIcon: '🧰'
  },

  projects: [
    {
      dir: 'demo-tool',
      title: '开发者小工具箱',
      description: 'JSON 格式化 / Base64 / URL 编解码 / 时间戳转换，纯前端本地运行。',
      icon: '🛠️',
      tags: ['开发', '示例'],
      featured: true,
      order: 1
    }
  ]
};
