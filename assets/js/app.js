/* ============================================================
 * 工具箱首页逻辑
 * 1. 读取 projects.js 清单（标题 / 描述 / 图标 / 标签等元数据）
 * 2. 通过 GitHub API 扫描仓库，自动发现含 index.html 的子目录
 * 3. 合并渲染：搜索、标签筛选、深浅色、本地缓存、限额降级
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 配置与清单 ---------- */
  var manifest = window.SAMDAN_PROJECTS || {};
  var settings = Object.assign({
    title: '工具箱',
    subtitle: '',
    githubRepo: '',            // 留空则根据域名自动识别（xxx.github.io → xxx/xxx.github.io）
    basePath: '',              // 项目页部署时填，如 /my-repo
    exclude: ['assets', 'node_modules', '.github', '.git'],
    defaultIcon: '🧰'
  }, manifest.settings || {});
  var manifestProjects = Array.isArray(manifest.projects) ? manifest.projects : [];

  var CACHE_KEY = 'samdan-tools-cache-v1';
  var THEME_KEY = 'samdan-tools-theme';
  var CACHE_TTL = 10 * 60 * 1000; // 缓存 10 分钟

  var state = {
    projects: [],
    keyword: '',
    activeTag: '',
    loading: false
  };

  /* ---------- DOM ---------- */
  function $(id) { return document.getElementById(id); }
  var els = {
    title: $('site-title'),
    subtitle: $('site-subtitle'),
    logo: $('brand-logo'),
    search: $('search-input'),
    theme: $('theme-btn'),
    tip: $('tip-banner'),
    tagFilters: $('tag-filters'),
    resultMeta: $('result-meta'),
    status: $('status-line'),
    grid: $('card-grid'),
    empty: $('empty-state'),
    emptyText: $('empty-text'),
    footerText: $('footer-text'),
    repoLink: $('repo-link')
  };

  /* ---------- 工具函数 ---------- */
  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function prettifyDir(dir) {
    var s = dir.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!s) return dir;
    if (/[\u4e00-\u9fa5]/.test(s)) return s; // 中文目录名保持原样
    return s.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }

  function readCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 仓库识别 ---------- */
  function detectRepo() {
    if (settings.githubRepo) return settings.githubRepo;
    var m = location.hostname.match(/^([a-z0-9-]+)\.github\.io$/i);
    if (m) return m[1] + '/' + m[1] + '.github.io';
    return '';
  }

  /* ---------- 条目标准化 ---------- */
  function normalizeEntry(e) {
    var dir = e.dir || '';
    var url = e.url || (settings.basePath || '') + '/' + dir + '/';
    return {
      key: dir || e.url || e.title || Math.random().toString(36),
      dir: dir,
      title: e.title || prettifyDir(dir) || '未命名工具',
      description: e.description || '',
      icon: e.icon || settings.defaultIcon,
      tags: Array.isArray(e.tags) ? e.tags.slice() : [],
      featured: !!e.featured,
      order: typeof e.order === 'number' ? e.order : 999,
      url: url,
      auto: false
    };
  }

  /* 清单里是否已为该目录提供了元数据（有标题或描述） */
  function manifestMetaFor(dir) {
    for (var i = 0; i < manifestProjects.length; i++) {
      var e = manifestProjects[i];
      if ((e.dir || '') === dir && (e.title || e.description)) return e;
    }
    return null;
  }

  /* ---------- 合并清单 + 自动发现 ---------- */
  function buildProjects(dirs, scraped) {
    // dirs: { 顶层目录: 含 index.html 的完整目录 }；scraped: { 目录: {title, description} }
    dirs = dirs || {};
    scraped = scraped || {};
    var byKey = {};

    manifestProjects.forEach(function (e) {
      var p = normalizeEntry(e);
      byKey[p.key] = p;
    });

    Object.keys(dirs).forEach(function (top) {
      if (byKey[top]) {
        if (!byKey[top].url) byKey[top].url = (settings.basePath || '') + '/' + top + '/';
        return;
      }
      var meta = scraped[top] || {};
      byKey[top] = {
        key: top,
        dir: top,
        title: meta.title || prettifyDir(top),
        description: meta.description || '',
        icon: settings.defaultIcon,
        tags: [],
        featured: false,
        order: 999,
        url: (settings.basePath || '') + '/' + top + '/',
        auto: true
      };
    });

    var list = Object.keys(byKey).map(function (k) { return byKey[k]; });
    list.sort(function (a, b) {
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (a.order !== b.order) return a.order - b.order;
      return String(a.title).localeCompare(String(b.title), 'zh-Hans-CN');
    });
    return list;
  }

  /* ---------- GitHub API：扫描仓库目录 ---------- */
  function isExcluded(top) {
    if (!top || top.charAt(0) === '.') return true;
    return settings.exclude.indexOf(top) !== -1;
  }

  function fetchWithTimeout(url, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, ms) : null;
    var opts = ctrl ? { signal: ctrl.signal } : {};
    return fetch(url, opts).then(function (res) {
      if (timer) clearTimeout(timer);
      return res;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function fetchTree(repo) {
    return fetchWithTimeout('https://api.github.com/repos/' + repo + '/git/trees/HEAD?recursive=1', 12000)
      .then(function (res) {
        if (res.status === 403 || res.status === 429) {
          var err = new Error('rate-limited');
          err.rateLimited = true;
          throw err;
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (json) {
        var dirs = {};
        (json.tree || []).forEach(function (entry) {
          if (entry.type !== 'blob') return;
          var m = entry.path.match(/^(.*\/)?index\.html?$/i);
          if (!m) return;
          var dir = m[1] ? m[1].replace(/\/$/, '') : '';
          if (!dir) return; // 根目录 index.html 就是首页本身
          var top = dir.split('/')[0];
          if (isExcluded(top)) return;
          // 同一顶层目录下有多个 index.html 时，保留最浅的
          if (dirs[top] && dirs[top].split('/').length <= dir.split('/').length) return;
          dirs[top] = dir;
        });
        return dirs;
      });
  }

  /* 抓取未登记工具的页面标题/描述（raw 源，无需等 Pages 构建） */
  function scrapeMeta(repo, dirs) {
    var tops = Object.keys(dirs).filter(function (top) { return !manifestMetaFor(top); });
    if (!tops.length) return Promise.resolve({});
    var base = 'https://raw.githubusercontent.com/' + repo + '/HEAD/';
    var result = {};
    var queue = tops.slice();
    var workers = [];
    for (var i = 0; i < Math.min(6, queue.length); i++) {
      workers.push((function next() {
        var top = queue.shift();
        if (!top) return Promise.resolve();
        return fetchWithTimeout(base + dirs[top] + '/index.html', 10000)
          .then(function (res) { return res.ok ? res.text() : ''; })
          .then(function (text) {
            if (!text) return next();
            var doc = new DOMParser().parseFromString(text, 'text/html');
            var title = (doc.querySelector('title') || {}).textContent || '';
            var descEl = doc.querySelector('meta[name="description"]');
            var desc = descEl ? (descEl.getAttribute('content') || '') : '';
            title = title.trim();
            desc = desc.trim();
            if (title || desc) result[top] = { title: title || null, description: desc || null };
          })
          .catch(function () { /* 单个失败不影响其他 */ })
          .then(next);
      })());
    }
    return Promise.all(workers).then(function () { return result; });
  }

  /* ---------- 渲染 ---------- */
  function render(projects, source, note) {
    state.projects = projects;
    renderTagFilters(projects);
    applyFilter();
    var n = projects.length;
    var auto = projects.filter(function (p) { return p.auto; }).length;
    var manual = n - auto;
    var sourceText = {
      'github': '✓ 已自动扫描 GitHub 仓库，发现 ' + auto + ' 个子目录工具' + (manual ? '，另有 ' + manual + ' 个手动收录' : ''),
      'cache': '⏱ 正在使用本地缓存数据（' + note + '），后台刷新中…',
      'stale-cache': '⏱ GitHub API 暂不可用，显示本地缓存（' + note + '）',
      'manifest': '📄 未能连接 GitHub API，仅显示 projects.js 清单中的 ' + n + ' 个工具'
    };
    els.status.textContent = sourceText[source] || '';
    els.status.classList.toggle('warn', source === 'stale-cache' || source === 'manifest');
  }

  function renderTagFilters(projects) {
    var tagSet = {};
    projects.forEach(function (p) { p.tags.forEach(function (t) { tagSet[t] = true; }); });
    var tags = Object.keys(tagSet).sort(function (a, b) { return a.localeCompare(b, 'zh-Hans-CN'); });
    if (state.activeTag && tags.indexOf(state.activeTag) === -1) state.activeTag = '';
    var html = '<button class="tag-chip' + (state.activeTag === '' ? ' active' : '') + '" data-tag="">全部</button>';
    html += tags.map(function (t) {
      return '<button class="tag-chip' + (state.activeTag === t ? ' active' : '') + '" data-tag="' + escapeHtml(t) + '">' + escapeHtml(t) + '</button>';
    }).join('');
    els.tagFilters.innerHTML = html;
  }

  function applyFilter() {
    var kw = state.keyword.trim().toLowerCase();
    var list = state.projects.filter(function (p) {
      if (state.activeTag && p.tags.indexOf(state.activeTag) === -1) return false;
      if (!kw) return true;
      var hay = [p.title, p.description, p.dir, (p.tags || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(kw) !== -1;
    });
    renderCards(list);
    els.resultMeta.textContent = (kw || state.activeTag)
      ? '筛选出 ' + list.length + ' / ' + state.projects.length + ' 个工具'
      : '共 ' + state.projects.length + ' 个工具';
    els.empty.hidden = list.length > 0;
    if (!list.length) {
      els.emptyText.textContent = kw ? '没有找到「' + state.keyword.trim() + '」相关工具' : '该标签下暂无工具';
    }
  }

  function renderCards(list) {
    els.grid.innerHTML = list.map(function (p) {
      var tags = (p.tags || []).map(function (t) { return '<span class="tag">' + escapeHtml(t) + '</span>'; }).join('');
      return '<a class="card" href="' + escapeHtml(p.url) + '" target="_blank" rel="noopener">' +
        '<span class="card-icon">' + escapeHtml(p.icon) + '</span>' +
        '<div class="card-body">' +
        '<h3>' + escapeHtml(p.title) + (p.auto ? '<span class="badge-auto">自动收录</span>' : '') + '</h3>' +
        '<p>' + escapeHtml(p.description || '暂无描述，可在 projects.js 中补充') + '</p>' +
        (tags ? '<div class="card-tags">' + tags + '</div>' : '') +
        '</div>' +
        '<span class="card-arrow">→</span>' +
        '</a>';
    }).join('');
  }

  function showSkeleton() {
    els.grid.innerHTML = '';
    for (var i = 0; i < 6; i++) {
      var s = document.createElement('div');
      s.className = 'skeleton';
      els.grid.appendChild(s);
    }
    els.empty.hidden = true;
  }

  /* ---------- 加载流程 ---------- */
  function load(force) {
    var repo = detectRepo();
    var cached = readCache();
    var cacheFresh = cached && cached.repo === repo && (Date.now() - cached.time < CACHE_TTL);

    if (!repo) {
      render(buildProjects(null, {}), 'manifest');
      return;
    }

    if (!force && cacheFresh) {
      render(buildProjects(cached.dirs, cached.scraped || {}), 'cache', minutesAgo(cached.time));
      refresh(repo, true); // 后台静默刷新
      return;
    }

    if (cached && cached.repo === repo) {
      render(buildProjects(cached.dirs, cached.scraped || {}), 'stale-cache', minutesAgo(cached.time));
    } else {
      showSkeleton();
    }
    refresh(repo, false);
  }

  function minutesAgo(t) {
    var m = Math.max(0, Math.round((Date.now() - t) / 60000));
    return m <= 1 ? '刚刚' : m + ' 分钟前';
  }

  function refresh(repo, silent) {
    if (state.loading) return;
    state.loading = true;

    fetchTree(repo)
      .then(function (dirs) {
        return scrapeMeta(repo, dirs).then(function (scraped) {
          writeCache({ repo: repo, time: Date.now(), dirs: dirs, scraped: scraped });
          render(buildProjects(dirs, scraped), 'github');
        });
      })
      .catch(function (err) {
        var cached = readCache();
        if (err && err.rateLimited) {
          if (cached && cached.repo === repo) {
            render(buildProjects(cached.dirs, cached.scraped || {}), 'stale-cache',
              minutesAgo(cached.time) + '（GitHub API 限额已用完，每小时恢复）');
            els.status.classList.add('warn');
          } else {
            render(buildProjects(null, {}), 'manifest');
            els.status.textContent = '⚠ GitHub API 限额已用完（每小时 60 次），暂时只显示清单数据，可稍后刷新';
            els.status.classList.add('warn');
          }
        } else if (cached && cached.repo === repo) {
          render(buildProjects(cached.dirs, cached.scraped || {}), 'stale-cache', minutesAgo(cached.time));
        } else {
          render(buildProjects(null, {}), 'manifest');
        }
      })
      .then(function () {
        state.loading = false;
      });
  }

  /* ---------- 主题 ---------- */
  function initTheme() {
    var saved = null;
    try { saved = localStorage.getItem(THEME_KEY); } catch (e) { /* 忽略 */ }
    var theme = saved || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(theme);
    els.theme.addEventListener('click', function () {
      var next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 忽略 */ }
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    els.theme.textContent = theme === 'dark' ? '☀️' : '🌙';
  }

  /* ---------- 静态文案与事件 ---------- */
  function initStatic() {
    document.title = settings.title;
    els.title.textContent = settings.title;
    els.subtitle.textContent = settings.subtitle || '';
    els.logo.textContent = settings.defaultIcon || '🧰';
    var repo = detectRepo();
    els.repoLink.href = repo ? 'https://github.com/' + repo : 'https://github.com/samdan0809/samdan0809.github.io';
    els.footerText.textContent = 'Powered by GitHub Pages · 子目录工具自动收录';

    // 提示条
    els.tip.hidden = false;

    // 搜索
    els.search.addEventListener('input', function () {
      state.keyword = els.search.value;
      applyFilter();
    });
    els.search.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { els.search.value = ''; state.keyword = ''; applyFilter(); els.search.blur(); }
    });

    // 标签筛选（事件委托）
    els.tagFilters.addEventListener('click', function (e) {
      var chip = e.target.closest('.tag-chip');
      if (!chip) return;
      state.activeTag = chip.getAttribute('data-tag') || '';
      renderTagFilters(state.projects);
      applyFilter();
    });

    // 按 / 快速聚焦搜索
    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== els.search) {
        e.preventDefault();
        els.search.focus();
      }
    });
  }

  /* ---------- 启动 ---------- */
  initStatic();
  initTheme();
  load(false);
})();
