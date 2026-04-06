// ==UserScript==
// @id             iitc-plugin-ingress-bookmarks2amap
// @name           Ingress Bookmarks -> Amap
// @author         Cheshire Lam
// @category       Controls
// @version        0.1.0
// @description    Export IITC bookmarks to Amap route links. Code by GPT-5.3-Codex.
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

(function () {
  'use strict';

  function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () {};

    var PLUGIN_NS = 'amapBridge';
    var MAX_POINTS_PER_IOS_SEGMENT = 18; // 1 start + 16 via + 1 end
    var PREF_PLATFORM_KEY = 'plugin-amapBridge-platform';

    function isFiniteNumber(n) {
      return typeof n === 'number' && Number.isFinite(n);
    }

    function parseLatLng(latlng) {
      if (typeof latlng !== 'string') return null;
      var parts = latlng.split(',');
      if (parts.length !== 2) return null;
      var lat = Number(parts[0]);
      var lng = Number(parts[1]);
      if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
      return { lat: lat, lng: lng };
    }

    function safeTitle(bookmarkId, item) {
      if (item && typeof item.label === 'string' && item.label.trim()) return item.label.trim();
      if (item && typeof item.guid === 'string' && item.guid.trim()) return item.guid.trim();
      return String(bookmarkId || 'untitled');
    }

    function readBookmarksObject() {
      // Preferred source: IITC Bookmarks plugin runtime object.
      var bkm = window.plugin && window.plugin.bookmarks;
      if (bkm && bkm.bkmrksObj && bkm.bkmrksObj.portals) {
        return bkm.bkmrksObj;
      }

      // Fallback: try localStorage keys that contain bookmarks payload.
      // This keeps the plugin resilient across IITC bookmark plugin variants.
      try {
        var keys = Object.keys(window.localStorage || {});
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          if (key.toLowerCase().indexOf('bookmark') === -1) continue;
          var raw = window.localStorage.getItem(key);
          if (!raw) continue;
          var parsed = JSON.parse(raw);
          if (parsed && parsed.portals) return parsed;
        }
      } catch (e) {
        // ignore fallback parsing errors
      }

      return null;
    }

    function normalizePortalsFromBookmarks(bookmarksObj) {
      var portals = (bookmarksObj && bookmarksObj.portals) || {};
      var items = [];
      var warnings = [];

      Object.keys(portals).forEach(function (folderId) {
        var folder = portals[folderId] || {};
        var folderName = (typeof folder.label === 'string' && folder.label.trim()) ? folder.label.trim() : folderId;
        var bkmrk = folder.bkmrk || {};

        Object.keys(bkmrk).forEach(function (bookmarkId) {
          var entry = bkmrk[bookmarkId] || {};
          var pos = parseLatLng(entry.latlng);
          if (!pos) {
            warnings.push('Skip invalid latlng for bookmark ' + bookmarkId);
            return;
          }

          items.push({
            id: String(bookmarkId),
            guid: entry.guid ? String(entry.guid) : '',
            title: safeTitle(bookmarkId, entry),
            lat: pos.lat,
            lng: pos.lng,
            folder: folderName
          });
        });
      });

      return { items: items, warnings: warnings };
    }

    function buildAmapMarkerUrl(item) {
      var params = new URLSearchParams();
      params.set('position', item.lng + ',' + item.lat); // lon,lat
      params.set('name', item.title);
      params.set('src', 'iitc-amap-bridge');
      params.set('coordinate', 'gaode');
      params.set('callnative', '1');
      return 'https://uri.amap.com/marker?' + params.toString();
    }

    function splitIntoSegments(items, maxPointsPerSegment) {
      if (!Array.isArray(items) || items.length <= 1) return [];
      var maxPts = Math.max(2, maxPointsPerSegment || MAX_POINTS_PER_IOS_SEGMENT);
      var segments = [];
      var i = 0;

      while (i < items.length - 1) {
        var end = Math.min(i + maxPts - 1, items.length - 1);
        segments.push(items.slice(i, end + 1));
        if (end === items.length - 1) break;
        i = end; // carry endpoint to next segment as next start
      }

      return segments;
    }

    function buildCommonRouteParams(segment, sourceApplication) {
      if (!Array.isArray(segment) || segment.length < 2) return '';
      var start = segment[0];
      var end = segment[segment.length - 1];
      var vias = segment.slice(1, -1).slice(0, 16);

      var params = new URLSearchParams();
      params.set('sourceApplication', sourceApplication || 'IITC-Intel');
      params.set('slat', String(start.lat));
      params.set('slon', String(start.lng));
      params.set('sname', start.title);
      params.set('dlat', String(end.lat));
      params.set('dlon', String(end.lng));
      params.set('dname', end.title);
      params.set('dev', '1');
      params.set('t', '0');

      if (vias.length > 0) {
        params.set('vian', String(vias.length));
        params.set('vialons', vias.map(function (v) { return String(v.lng); }).join('|'));
        params.set('vialats', vias.map(function (v) { return String(v.lat); }).join('|'));
        params.set('vianames', vias.map(function (v) { return String(v.title || 'via'); }).join('|'));
      }
      return params.toString();
    }

    function escapeHtml(s) {
      return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    function copyText(text) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).catch(function () {
          window.prompt('复制失败，请手动复制：', text);
        });
      } else {
        window.prompt('请手动复制：', text);
      }
    }

    function detectPlatform() {
      var ua = String((window.navigator && window.navigator.userAgent) || '').toLowerCase();
      if (ua.indexOf('android') !== -1) return 'android';
      if (ua.indexOf('iphone') !== -1 || ua.indexOf('ipad') !== -1 || ua.indexOf('ipod') !== -1 || ua.indexOf('ios') !== -1) return 'ios';
      return '';
    }

    function getCurrentPortalData() {
      if (!window.selectedPortal) return null;
      var guid = String(window.selectedPortal);
      var p = window.portals && window.portals[guid];
      if (!p || typeof p.getLatLng !== 'function') return null;
      var ll = p.getLatLng();
      if (!ll || !isFiniteNumber(ll.lat) || !isFiniteNumber(ll.lng)) return null;
      var title = '';
      if (p.options && p.options.data && p.options.data.title) title = String(p.options.data.title);
      if (!title) title = guid;
      return { title: title, lat: ll.lat, lng: ll.lng };
    }

    function runExport() {
      var bookmarksObj = readBookmarksObject();
      if (!bookmarksObj) {
        alert('未找到 IITC bookmarks 数据。请先确认已安装并启用 Bookmarks 插件。');
        return;
      }

      var normalized = normalizePortalsFromBookmarks(bookmarksObj);
      var items = normalized.items;
      if (!items.length) {
        alert('没有可导出的 portal bookmark。');
        return;
      }

      var folders = Array.from(new Set(items.map(function (x) { return x.folder; })));

      var html = [
        '<div>',
        '<p><b>当前 Portal：</b><span id="amap-current-portal">未选中</span> <button id="amap-open-current" disabled>跳转高德地图</button></p>',
        '<p>选择 Folder（已选 Portal：<span id="amap-selected-count">0</span>）</p>',
        '<div id="amap-folder-list" style="margin:8px 0 10px 0;">',
        folders.map(function (f) {
          return '<label style="display:inline-block;margin-right:10px;"><input type="checkbox" class="amap-folder-check" data-folder="' + escapeHtml(f) + '" checked> ' + escapeHtml(f) + '</label>';
        }).join(''),
        '</div>',
        '<p>平台：<select id="amap-platform"><option value="ios">iOS</option><option value="android">Android</option></select> <button id="amap-open-amap">跳转高德地图</button></p>',
        normalized.warnings.length ? '<p style="color:#b35c00;">警告: ' + normalized.warnings.length + ' 条（详见 JSON）</p>' : '',
        '<textarea id="amap-output-common" readonly style="width:100%;height:180px;"></textarea>',
        '<p><button id="amap-copy-current">复制当前 Portal 链接</button> <button id="amap-copy-route">复制路线链接</button></p>',
        '</div>'
      ].join('');

      window.dialog({
        title: 'Bookmarks -> Amap',
        html: html,
        width: 700
      });

      setTimeout(function () {
        var folderChecks = Array.prototype.slice.call(document.querySelectorAll('.amap-folder-check'));
        var btnOpenCurrent = document.getElementById('amap-open-current');
        var btnCopyCurrent = document.getElementById('amap-copy-current');
        var btnCopyRoute = document.getElementById('amap-copy-route');
        var btnOpenAmap = document.getElementById('amap-open-amap');
        var platformSelect = document.getElementById('amap-platform');
        var outputCommon = document.getElementById('amap-output-common');
        var selectedCountEl = document.getElementById('amap-selected-count');
        var currentPortalEl = document.getElementById('amap-current-portal');
        var lastSelectedPortalGuid = '';

        function selectedItems() {
          var selectedFolders = {};
          folderChecks.forEach(function (ch) {
            if (ch.checked) selectedFolders[ch.getAttribute('data-folder')] = true;
          });
          return items.filter(function (x) { return !!selectedFolders[x.folder]; });
        }

        function buildLinksForPlatform(sel, platform) {
          if (!Array.isArray(sel) || sel.length < 2) return [];
          var prefix = platform === 'android' ? 'androidamap://route?' : 'iosamap://path?';
          var segments = splitIntoSegments(sel, MAX_POINTS_PER_IOS_SEGMENT);
          return segments.map(function (seg) {
            return buildCommonRouteParams(seg, 'IITC-Intel');
          }).filter(Boolean).map(function (p) {
            return prefix + p;
          });
        }

        function refreshOutputs() {
          var sel = selectedItems();
          var currentPortal = getCurrentPortalData();
          var platform = (platformSelect && platformSelect.value) || 'ios';
          var routeLinks = buildLinksForPlatform(sel, platform);

          outputCommon.value = routeLinks.join('\n');
          selectedCountEl.textContent = String(sel.length);
          if (currentPortal) {
            currentPortalEl.textContent = currentPortal.title;
            btnOpenCurrent.disabled = false;
            btnOpenCurrent.setAttribute('data-url', buildAmapMarkerUrl(currentPortal));
            btnCopyCurrent.disabled = false;
            btnCopyCurrent.setAttribute('data-url', buildAmapMarkerUrl(currentPortal));
          } else {
            currentPortalEl.textContent = '未选中';
            btnOpenCurrent.disabled = true;
            btnOpenCurrent.setAttribute('data-url', '');
            btnCopyCurrent.disabled = true;
            btnCopyCurrent.setAttribute('data-url', '');
          }
          lastSelectedPortalGuid = window.selectedPortal ? String(window.selectedPortal) : '';
        }

        folderChecks.forEach(function (ch) {
          ch.addEventListener('change', refreshOutputs);
        });
        refreshOutputs();

        if (btnOpenCurrent) btnOpenCurrent.onclick = function () {
          if (btnOpenCurrent.disabled) return;
          var u = btnOpenCurrent.getAttribute('data-url') || '';
          if (!u) return;
          window.location.href = u;
        };

        if (btnCopyCurrent) btnCopyCurrent.onclick = function () {
          if (btnCopyCurrent.disabled) return;
          copyText(btnCopyCurrent.getAttribute('data-url') || '');
        };

        if (platformSelect) {
          var detected = detectPlatform();
          var saved = window.localStorage.getItem(PREF_PLATFORM_KEY);
          if (detected === 'ios' || detected === 'android') {
            platformSelect.value = detected;
          } else if (saved === 'ios' || saved === 'android') {
            platformSelect.value = saved;
          } else {
            platformSelect.value = 'ios';
          }
          window.localStorage.setItem(PREF_PLATFORM_KEY, platformSelect.value);
          platformSelect.addEventListener('change', function () {
            window.localStorage.setItem(PREF_PLATFORM_KEY, platformSelect.value);
            refreshOutputs();
          });
        }

        if (btnCopyRoute) btnCopyRoute.onclick = function () {
          var sel = selectedItems();
          var platform = (platformSelect && platformSelect.value) || 'ios';
          var links = buildLinksForPlatform(sel, platform);
          copyText(links.join('\n'));
        };

        if (btnOpenAmap) btnOpenAmap.onclick = function () {
          var sel = selectedItems();
          var platform = (platformSelect && platformSelect.value) || 'ios';
          var links = buildLinksForPlatform(sel, platform);
          if (!links.length) {
            alert('没有可跳转的路线，请先选择至少 2 个 portal。');
            return;
          }
          // Keep native scheme only for iOS/Android.
          window.location.href = links[0];
        };

        if (typeof window.addHook === 'function') {
          window.addHook('portalSelected', function () {
            refreshOutputs();
          });
        }

        window.setInterval(function () {
          var nowGuid = window.selectedPortal ? String(window.selectedPortal) : '';
          if (nowGuid !== lastSelectedPortalGuid) refreshOutputs();
        }, 500);
      }, 0);
    }

    function setup() {
      window.plugin[PLUGIN_NS] = {
        runExport: runExport,
        readBookmarksObject: readBookmarksObject,
        normalizePortalsFromBookmarks: normalizePortalsFromBookmarks,
        buildAmapMarkerUrl: buildAmapMarkerUrl,
        buildCommonRouteParams: buildCommonRouteParams,
        splitIntoSegments: splitIntoSegments
      };

      if (window.IITC && window.IITC.toolbox && typeof window.IITC.toolbox.addButton === 'function') {
        window.IITC.toolbox.addButton({
          id: 'bookmarks2amap-open',
          label: 'Bookmarks -> Amap',
          action: runExport
        });
      } else {
        var toolbox = document.getElementById('toolbox');
        if (toolbox) {
          var link = document.createElement('a');
          link.textContent = 'Bookmarks -> Amap';
          link.href = '#';
          link.addEventListener('click', function (ev) {
            ev.preventDefault();
            runExport();
          });
          toolbox.appendChild(document.createTextNode(' '));
          toolbox.appendChild(link);
        }
      }

      console.log('[Bookmarks -> Amap] loaded');
    }

    // expose userscript metadata to IITC plugin list/info page
    setup.info = plugin_info;
    window.bootPlugins = window.bootPlugins || [];
    window.bootPlugins.push(setup);
    if (window.iitcLoaded) setup();
  }

  var script = document.createElement('script');
  var info = {};
  if (typeof GM_info !== 'undefined' && GM_info && GM_info.script) {
    info.script = {
      version: GM_info.script.version,
      name: GM_info.script.name,
      description: GM_info.script.description
    };
  }
  script.appendChild(document.createTextNode('(' + wrapper + ')(' + JSON.stringify(info) + ');'));
  (document.body || document.head || document.documentElement).appendChild(script);
})();
