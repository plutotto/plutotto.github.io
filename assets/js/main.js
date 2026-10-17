/* 拾光集 · 交互脚本：主题、搜索、目录、代码高亮、阅读进度 */
(function () {
  "use strict";

  var root = document.documentElement;
  var base = (window.SITE && window.SITE.base) || "";

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }

  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeRegExp(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /* ---------------- 主题 ---------------- */
  function currentTheme() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function syncThemeMeta() {
    var meta = $('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute("content", currentTheme() === "dark" ? "#131210" : "#f7f4ed");
    }
    var label = currentTheme() === "dark" ? "切换到浅色模式" : "切换到深色模式";
    $$("[data-theme-toggle]").forEach(function (button) {
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    });
  }

  syncThemeMeta();

  $$("[data-theme-toggle]").forEach(function (button) {
    button.addEventListener("click", function () {
      var next = currentTheme() === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try {
        localStorage.setItem("theme", next);
      } catch (error) {
        /* 隐私模式下忽略 */
      }
      syncThemeMeta();
    });
  });

  /* ---------------- 页头 ---------------- */
  var header = $(".site-header");

  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var navToggle = $("[data-nav-toggle]");

  function closeNav() {
    if (!header || !navToggle) return;
    header.classList.remove("nav-open");
    navToggle.setAttribute("aria-expanded", "false");
    navToggle.setAttribute("aria-label", "打开菜单");
  }

  if (navToggle && header) {
    navToggle.addEventListener("click", function () {
      var open = header.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
      navToggle.setAttribute("aria-label", open ? "关闭菜单" : "打开菜单");
    });

    $$(".site-nav__link").forEach(function (item) {
      item.addEventListener("click", closeNav);
    });

    document.addEventListener("click", function (event) {
      if (!header.contains(event.target)) closeNav();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav();
    });
  }

  /* ---------------- 搜索 ---------------- */
  var dialog = $("#search-dialog");
  var input = $("#search-input");
  var resultsEl = $("#search-results");
  var indexData = null;
  var loadingIndex = false;
  var activeIndex = -1;
  var currentResults = [];

  function loadIndex() {
    if (indexData || loadingIndex || !resultsEl) return;
    loadingIndex = true;
    resultsEl.innerHTML = '<p class="search-empty">正在加载索引…</p>';
    fetch(base + "/search.json")
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (json) {
        indexData = json;
        if (dialog && dialog.open) renderSearch(input ? input.value : "");
      })
      .catch(function () {
        indexData = [];
        resultsEl.innerHTML = '<p class="search-empty">索引加载失败，请通过本地服务器预览后再试。</p>';
      })
      .then(function () {
        loadingIndex = false;
      });
  }

  function filterItems(query) {
    if (!indexData) return [];
    var keyword = query.trim().toLowerCase();
    if (!keyword) return indexData.slice(0, 5);
    var terms = keyword.split(/\s+/).filter(Boolean);
    return indexData
      .map(function (item) {
        var title = item.title.toLowerCase();
        var tags = (item.tags || []).join(" ").toLowerCase();
        var summary = (item.summary || "").toLowerCase();
        var text = (item.text || "").toLowerCase();
        var score = 0;
        var matchedAll = terms.every(function (term) {
          if (title.indexOf(term) > -1) score += 8;
          else if (tags.indexOf(term) > -1) score += 4;
          else if (summary.indexOf(term) > -1) score += 2;
          else if (text.indexOf(term) > -1) score += 1;
          else return false;
          return true;
        });
        return matchedAll ? { item: item, score: score } : null;
      })
      .filter(Boolean)
      .sort(function (a, b) {
        return b.score - a.score;
      })
      .slice(0, 8)
      .map(function (entry) {
        return entry.item;
      });
  }

  function highlight(text, query) {
    var terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
    if (!terms.length) return escapeHtml(text);
    var pattern = new RegExp("(" + terms.join("|") + ")", "gi");
    return String(text)
      .split(pattern)
      .map(function (part, index) {
        return index % 2 ? "<mark>" + escapeHtml(part) + "</mark>" : escapeHtml(part);
      })
      .join("");
  }

  function resultCard(item, query) {
    var tag = (item.tags && item.tags[0]) || "文章";
    return (
      '<a class="search-result" role="option" href="' + item.url + '">' +
      '<span class="search-result__title">' + highlight(item.title, query) + "</span>" +
      '<span class="search-result__meta"><span>' + item.date + "</span><span>·</span>" +
      '<span class="search-result__tag">#' + escapeHtml(tag) + "</span></span>" +
      '<span class="search-result__snippet">' + highlight(item.summary || "", query) + "</span>" +
      "</a>"
    );
  }

  function setActive(index) {
    var cards = $$(".search-result", resultsEl);
    activeIndex = index;
    cards.forEach(function (card, i) {
      var isActive = i === index;
      card.classList.toggle("is-active", isActive);
      card.setAttribute("aria-selected", isActive ? "true" : "false");
      if (isActive && card.scrollIntoView) {
        card.scrollIntoView({ block: "nearest" });
      }
    });
  }

  function renderSearch(query) {
    if (!resultsEl) return;
    if (!indexData) return;
    currentResults = filterItems(query);
    activeIndex = currentResults.length ? 0 : -1;

    if (!currentResults.length) {
      resultsEl.innerHTML = query.trim()
        ? '<p class="search-empty">没有找到与「' + escapeHtml(query.trim()) + "」相关的文章。</p>"
        : '<p class="search-empty">还没有文章。</p>';
      return;
    }

    resultsEl.innerHTML = currentResults.map(function (item) {
      return resultCard(item, query);
    }).join("");
    setActive(0);
  }

  function openSearch() {
    if (!dialog || !input) return;
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.body.classList.add("no-scroll");
    input.value = "";
    renderSearch("");
    loadIndex();
    window.setTimeout(function () {
      input.focus();
    }, 30);
  }

  function closeSearch() {
    if (!dialog) return;
    if (typeof dialog.close === "function") {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
    document.body.classList.remove("no-scroll");
  }

  $$("[data-search-open]").forEach(function (button) {
    button.addEventListener("click", openSearch);
  });

  if (dialog) {
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) closeSearch();
    });
    dialog.addEventListener("close", function () {
      document.body.classList.remove("no-scroll");
      if (input) input.value = "";
    });
  }

  if (input) {
    input.addEventListener("input", function () {
      renderSearch(input.value);
    });
    input.addEventListener("keydown", function (event) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (!currentResults.length) return;
        setActive((activeIndex + 1) % currentResults.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        if (!currentResults.length) return;
        setActive((activeIndex - 1 + currentResults.length) % currentResults.length);
      } else if (event.key === "Enter") {
        if (currentResults[activeIndex]) {
          window.location.href = currentResults[activeIndex].url;
        }
      }
    });
  }

  document.addEventListener("keydown", function (event) {
    var target = event.target;
    var typing =
      target &&
      (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      if (dialog && dialog.open) closeSearch();
      else openSearch();
      return;
    }

    if (event.key === "/" && !typing && !(dialog && dialog.open)) {
      event.preventDefault();
      openSearch();
    }

    if (event.key === "Escape" && dialog && dialog.open) {
      closeSearch();
    }
  });

  /* ---------------- 阅读进度 ---------------- */
  var progress = $("#reading-progress");
  if (progress) {
    var updateProgress = function () {
      var total = document.documentElement.scrollHeight - window.innerHeight;
      var ratio = total > 0 ? window.scrollY / total : 0;
      progress.style.width = Math.max(0, Math.min(1, ratio)) * 100 + "%";
    };
    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
  }

  /* ---------------- 目录高亮 ---------------- */
  var tocLinks = $$(".toc__list a");
  if (tocLinks.length) {
    var headings = $$(".prose h2[id], .prose h3[id]");
    var spy = function () {
      var current = null;
      headings.forEach(function (heading) {
        if (heading.getBoundingClientRect().top <= 140) current = heading.id;
      });
      tocLinks.forEach(function (link) {
        link.classList.toggle("is-active", link.getAttribute("href") === "#" + current);
      });
    };
    spy();
    window.addEventListener("scroll", spy, { passive: true });
  }

  /* ---------------- 入场动画 ---------------- */
  var revealEls = $$("[data-reveal]");
  var reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!("IntersectionObserver" in window) || reduceMotion) {
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  } else {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -36px" }
    );
    revealEls.forEach(function (el, index) {
      el.style.transitionDelay = Math.min(index, 6) * 55 + "ms";
      observer.observe(el);
    });
  }

  /* ---------------- 复制代码 ---------------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.top = "-9999px";
      document.body.appendChild(area);
      area.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(area);
      }
    });
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest ? event.target.closest("[data-copy]") : null;
    if (!button) return;
    var figure = button.closest(".code-block");
    var code = figure ? figure.querySelector("pre code") : null;
    if (!code) return;

    var restore = function (label) {
      button.textContent = label;
      button.classList.toggle("is-done", label === "已复制");
      window.setTimeout(function () {
        button.textContent = "复制";
        button.classList.remove("is-done");
      }, 1600);
    };

    copyText(code.innerText).then(
      function () {
        restore("已复制");
      },
      function () {
        restore("复制失败");
      }
    );
  });

  /* ---------------- 轻量代码高亮 ---------------- */
  var HIGHLIGHT = {
    python: {
      pattern:
        /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|\b(False|None|True|and|as|assert|async|await|break|class|continue|def|del|elif|else|except|finally|for|from|global|if|import|in|is|lambda|nonlocal|not|or|pass|raise|return|try|while|with|yield)\b|\b(\d+(?:\.\d+)?)\b/g,
      groups: ["tok-com", "tok-str", "tok-kw", "tok-num"]
    },
    javascript: {
      pattern:
        /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|new|class|extends|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|this|null|undefined|true|false|switch|case|break|continue|of|in|delete|yield)\b|\b(\d+(?:\.\d+)?)\b/g,
      groups: ["tok-com", "tok-str", "tok-kw", "tok-num"]
    },
    typescript: {
      pattern:
        /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|new|class|extends|interface|type|enum|implements|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|this|null|undefined|true|false|switch|case|break|continue|of|in|public|private|readonly|as|satisfies)\b|\b(\d+(?:\.\d+)?)\b/g,
      groups: ["tok-com", "tok-str", "tok-kw", "tok-num"]
    },
    bash: {
      pattern:
        /(#[^\n]*)|("(?:\\.|[^"\\])*"|'[^']*')|(\$\{?[A-Za-z_][A-Za-z0-9_]*\}?)|\b(if|then|else|elif|fi|for|in|do|done|while|case|esac|function|echo|export|local|return|cd|set|source|alias|sudo)\b|\b(\d+)\b/g,
      groups: ["tok-com", "tok-str", "tok-fn", "tok-kw", "tok-num"]
    },
    json: {
      pattern:
        /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/g,
      groups: ["tok-attr", "tok-str", "tok-kw", "tok-num"]
    },
    yaml: {
      pattern:
        /(#[^\n]*)|^([ \t]*[A-Za-z0-9_.-]+)(?=[ \t]*:)|("(?:\\.|[^"\\])*"|'[^']*')|\b(true|false|null)\b|(-?\b\d+(?:\.\d+)?\b)/gm,
      groups: ["tok-com", "tok-attr", "tok-str", "tok-kw", "tok-num"]
    }
  };

  function highlightWith(source, config) {
    var output = "";
    var last = 0;
    var match;
    config.pattern.lastIndex = 0;
    while ((match = config.pattern.exec(source)) !== null) {
      output += escapeHtml(source.slice(last, match.index));
      var groupIndex = 0;
      for (var i = 1; i < match.length; i += 1) {
        if (match[i] !== undefined) {
          groupIndex = i - 1;
          break;
        }
      }
      var className = config.groups[groupIndex] || "tok-str";
      output += '<span class="' + className + '">' + escapeHtml(match[0]) + "</span>";
      last = match.index + match[0].length;
      if (match[0].length === 0) config.pattern.lastIndex += 1;
    }
    output += escapeHtml(source.slice(last));
    return output;
  }

  $$("pre code[data-lang]").forEach(function (code) {
    var lang = (code.getAttribute("data-lang") || "").toLowerCase();
    var config = HIGHLIGHT[lang];
    if (!config || code.children.length) return;
    var source = code.textContent;
    try {
      code.innerHTML = highlightWith(source, config);
    } catch (error) {
      code.textContent = source;
    }
  });
})();
