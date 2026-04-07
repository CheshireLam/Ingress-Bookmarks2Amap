// ==UserScript==
// @id             iitc-plugin-ingress-bookmarks2amap
// @name           IITC plugin: Bookmarks -> Amap
// @author         Cheshire Lam
// @category       Controls
// @version        0.1.1
// @description    Export IITC bookmarks to Amap/Baidu/Tencent route links. Code by GPT-5.3-Codex.
// @match          https://intel.ingress.com/*
// @match          https://intel-x.ingress.com/*
// @grant          none
// ==/UserScript==

(function () {
  'use strict';

  function wrapper(plugin_info) {
    if (typeof window.plugin !== 'function') window.plugin = function () {};

    var PLUGIN_NS = 'amapBridge';
    var PREF_MAP_KEY = 'plugin-amapBridge-map';
    var TENCENT_REFERER = 'IITC-Intel';
    var BAIDU_SRC = 'IITC-Intel';
    var AMAP_WEB_MAX_VIA = 6;

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

    function isInChina(lat, lng) {
      return lng >= 73.66 && lng <= 135.05 && lat >= 3.86 && lat <= 53.55;
    }

    function transformLat(x, y) {
      var ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
      ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
      ret += (20.0 * Math.sin(y * Math.PI) + 40.0 * Math.sin(y / 3.0 * Math.PI)) * 2.0 / 3.0;
      ret += (160.0 * Math.sin(y / 12.0 * Math.PI) + 320 * Math.sin(y * Math.PI / 30.0)) * 2.0 / 3.0;
      return ret;
    }

    function transformLon(x, y) {
      var ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
      ret += (20.0 * Math.sin(6.0 * x * Math.PI) + 20.0 * Math.sin(2.0 * x * Math.PI)) * 2.0 / 3.0;
      ret += (20.0 * Math.sin(x * Math.PI) + 40.0 * Math.sin(x / 3.0 * Math.PI)) * 2.0 / 3.0;
      ret += (150.0 * Math.sin(x / 12.0 * Math.PI) + 300.0 * Math.sin(x / 30.0 * Math.PI)) * 2.0 / 3.0;
      return ret;
    }

    function wgs84ToGcj02(lat, lng) {
      if (!isInChina(lat, lng)) return { lat: lat, lng: lng };
      var a = 6378245.0;
      var ee = 0.00669342162296594323;
      var dLat = transformLat(lng - 105.0, lat - 35.0);
      var dLon = transformLon(lng - 105.0, lat - 35.0);
      var radLat = lat / 180.0 * Math.PI;
      var magic = Math.sin(radLat);
      magic = 1 - ee * magic * magic;
      var sqrtMagic = Math.sqrt(magic);
      dLat = (dLat * 180.0) / ((a * (1 - ee)) / (magic * sqrtMagic) * Math.PI);
      dLon = (dLon * 180.0) / (a / sqrtMagic * Math.cos(radLat) * Math.PI);
      return { lat: lat + dLat, lng: lng + dLon };
    }

    function gcj02ToBd09(lat, lng) {
      var xPi = Math.PI * 3000.0 / 180.0;
      var z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * xPi);
      var theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * xPi);
      var bdLng = z * Math.cos(theta) + 0.0065;
      var bdLat = z * Math.sin(theta) + 0.006;
      return { lat: bdLat, lng: bdLng };
    }

    function toGcjCoordinate(item) {
      return wgs84ToGcj02(item.lat, item.lng);
    }

    function toBaiduCoordinate(item) {
      var gcj = toGcjCoordinate(item);
      return gcj02ToBd09(gcj.lat, gcj.lng);
    }

    var BAIDU_LL_BAND = [75, 60, 45, 30, 15, 0];
    var BAIDU_LL2MC = [
      [-0.0015702102444, 111320.7020616939, 1704480524535203, -10338987376042340, 26112667856603880, -35149669176653700, 26595700718403920, -10725012454188240, 1800819912950474, 82.5],
      [0.0008277824516172526, 111320.7020463578, 647795574.6671607, -4082003173.641316, 10774905663.51142, -15171875531.51559, 12053065338.62167, -5124939663.577472, 913311935.9512032, 67.5],
      [0.00337398766765, 111320.7020202162, 4481351.045890365, -23393751.19931662, 79682215.47186455, -115964993.2797253, 97236711.15602145, -43661946.33752821, 8477230.501135234, 52.5],
      [0.00220636496208, 111320.7020209128, 51751.86112841131, 3796837.749470245, 992013.7397791013, -1221952.21711287, 1340652.697009075, -620943.6990984312, 144416.9293806241, 37.5],
      [-0.0003441963504368392, 111320.7020576856, 278.2353980772752, 2485758.690035394, 6070.750963243378, 54821.18345352118, 9540.606633304236, -2710.55326746645, 1405.483844121726, 22.5],
      [-0.0003218135878613132, 111320.7020701615, 0.00369383431289, 823725.6402795718, 0.46104986909093, 2351.343141331292, 1.58060784298199, 8.77738589078284, 0.37238884252424, 7.45]
    ];

    function baiduConvertorLL2MC(ll, coeff) {
      var x = coeff[0] + coeff[1] * Math.abs(ll.lng);
      var c = Math.abs(ll.lat) / coeff[9];
      var y = coeff[2] + coeff[3] * c + coeff[4] * c * c + coeff[5] * c * c * c +
        coeff[6] * c * c * c * c + coeff[7] * c * c * c * c * c + coeff[8] * c * c * c * c * c * c;
      x *= (ll.lng < 0 ? -1 : 1);
      y *= (ll.lat < 0 ? -1 : 1);
      return { x: x, y: y };
    }

    function bd09llToBd09mc(ll) {
      var lat = Math.max(Math.min(ll.lat, 74), -74);
      var absLat = Math.abs(lat);
      var coeff = BAIDU_LL2MC[BAIDU_LL2MC.length - 1];
      for (var i = 0; i < BAIDU_LL_BAND.length; i++) {
        if (absLat >= BAIDU_LL_BAND[i]) {
          coeff = BAIDU_LL2MC[i];
          break;
        }
      }
      return baiduConvertorLL2MC({ lat: lat, lng: ll.lng }, coeff);
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
      var p = toGcjCoordinate(item);
      var params = new URLSearchParams();
      params.set('position', p.lng + ',' + p.lat); // lon,lat
      params.set('name', item.title);
      params.set('src', 'iitc-amap-bridge');
      params.set('coordinate', 'gaode');
      params.set('callnative', '1');
      return 'https://uri.amap.com/marker?' + params.toString();
    }

    function buildBaiduMarkerUrl(item) {
      var p = toBaiduCoordinate(item);
      var params = new URLSearchParams();
      params.set('location', p.lat + ',' + p.lng);
      params.set('title', item.title);
      params.set('content', item.title);
      params.set('output', 'html');
      params.set('coord_type', 'bd09ll');
      params.set('src', BAIDU_SRC);
      return 'https://api.map.baidu.com/marker?' + params.toString();
    }

    function buildTencentMarkerUrl(item) {
      var p = toGcjCoordinate(item);
      var params = new URLSearchParams();
      params.set('marker', 'coord:' + p.lat + ',' + p.lng + ';title:' + item.title + ';addr:' + item.title);
      params.set('ref', TENCENT_REFERER);
      return 'https://apis.map.qq.com/uri/v1/marker?' + params.toString();
    }

    function buildMarkerUrl(item, mapProvider) {
      if (mapProvider === 'baidu') return buildBaiduMarkerUrl(item);
      if (mapProvider === 'tencent') return buildTencentMarkerUrl(item);
      return buildAmapMarkerUrl(item);
    }

    function pickRoutePoints(items, maxVia) {
      if (!Array.isArray(items) || items.length < 2) return null;
      var start = items[0];
      var end = items[items.length - 1];
      var vias = items.slice(1, -1);
      var pickedVia = vias.slice(0, Math.max(0, maxVia));
      return {
        start: start,
        end: end,
        vias: pickedVia,
        total: items.length,
        used: 2 + pickedVia.length
      };
    }

    function buildAmapWebRouteUrl(points) {
      if (!points) return '';
      var startP = toGcjCoordinate(points.start);
      var endP = toGcjCoordinate(points.end);
      var viaP = points.vias.map(toGcjCoordinate);
      var q = new URLSearchParams();
      q.set('type', 'car');
      q.set('policy', '2');
      q.set('from[lnglat]', startP.lng + ',' + startP.lat);
      q.set('from[name]', points.start.title);
      q.set('to[lnglat]', endP.lng + ',' + endP.lat);
      q.set('to[name]', points.end.title);
      for (var i = 0; i < viaP.length; i++) {
        q.set('via[' + i + '][lnglat]', viaP[i].lng + ',' + viaP[i].lat);
        q.set('via[' + i + '][name]', points.vias[i].title);
      }
      q.set('src', 'iitc-amap-bridge');
      q.set('callnative', '1');
      return 'https://ditu.amap.com/dir?' + q.toString();
    }

    function buildAmapSchemeRouteUrl(points, platform) {
      if (!points) return '';
      var startP = toGcjCoordinate(points.start);
      var endP = toGcjCoordinate(points.end);
      var viaP = points.vias.map(toGcjCoordinate);
      var params = new URLSearchParams();
      params.set('sourceApplication', 'IITC-Intel');
      params.set('slat', String(startP.lat));
      params.set('slon', String(startP.lng));
      params.set('sname', points.start.title);
      params.set('dlat', String(endP.lat));
      params.set('dlon', String(endP.lng));
      params.set('dname', points.end.title);
      params.set('dev', '1');
      params.set('t', '0');
      if (viaP.length > 0) {
        params.set('vian', String(viaP.length));
        params.set('vialons', viaP.map(function (v) { return String(v.lng); }).join('|'));
        params.set('vialats', viaP.map(function (v) { return String(v.lat); }).join('|'));
        params.set('vianames', points.vias.map(function (v) { return String(v.title || 'via'); }).join('|'));
      }
      var prefix = platform === 'android' ? 'androidamap://route?' : 'iosamap://path?';
      return prefix + params.toString();
    }

    function buildBaiduWebRouteUrl(points) {
      if (!points) return '';
      var startLL = toBaiduCoordinate(points.start);
      var endLL = toBaiduCoordinate(points.end);
      var startMC = bd09llToBd09mc(startLL);
      var endMC = bd09llToBd09mc(endLL);
      var startName = encodeURIComponent(points.start.title || '起点');
      var endName = encodeURIComponent(points.end.title || '终点');
      var path = '/dir/' + startName + '/' + endName + '/';
      var q = new URLSearchParams();
      q.set('querytype', 'nav');
      q.set('da_src', 'shareurl');
      q.set('navtp', '4');
      q.set('c', '1');
      q.set('drag', '0');
      q.set('sc', '1');
      q.set('ec', '1');
      q.set('sy', '0');
      q.set('sn', '0$$$$' + startMC.x.toFixed(4) + ',' + startMC.y.toFixed(4) + '$$' + (points.start.title || '起点') + '$$$$$$');
      q.set('en', '0$$$$' + endMC.x.toFixed(4) + ',' + endMC.y.toFixed(4) + '$$' + (points.end.title || '终点') + '$$$$$$');
      q.set('sq', points.start.title || '起点');
      q.set('eq', points.end.title || '终点');
      q.set('version', '4');
      q.set('mrs', '1');
      q.set('route_traffic', '1');
      var centerX = ((startMC.x + endMC.x) / 2).toFixed(6);
      var centerY = ((startMC.y + endMC.y) / 2).toFixed(6);
      return 'https://map.baidu.com' + path + '@' + centerX + ',' + centerY + ',12z?' + q.toString();
    }

    function buildBaiduSchemeRouteUrl(points) {
      if (!points) return '';
      var startP = toBaiduCoordinate(points.start);
      var endP = toBaiduCoordinate(points.end);
      var params = new URLSearchParams();
      params.set('origin', 'latlng:' + startP.lat + ',' + startP.lng + '|name:' + points.start.title);
      params.set('destination', 'latlng:' + endP.lat + ',' + endP.lng + '|name:' + points.end.title);
      params.set('mode', 'driving');
      params.set('coord_type', 'bd09ll');
      params.set('src', BAIDU_SRC);
      return 'baidumap://map/direction?' + params.toString();
    }

    function buildTencentWebRouteUrl(points) {
      if (!points) return '';
      var startP = toGcjCoordinate(points.start);
      var endP = toGcjCoordinate(points.end);
      var params = new URLSearchParams();
      params.set('type', 'nav');
      params.set('from', points.start.title);
      params.set('fromcoord', startP.lng + ',' + startP.lat);
      params.set('to', points.end.title);
      params.set('tocoord', endP.lng + ',' + endP.lat);
      params.set('tactic', '0');
      params.set('ref', TENCENT_REFERER);
      return 'https://map.qq.com/?' + params.toString();
    }

    function buildTencentSchemeRouteUrl(points) {
      if (!points) return '';
      var startP = toGcjCoordinate(points.start);
      var endP = toGcjCoordinate(points.end);
      var params = new URLSearchParams();
      params.set('type', 'drive');
      params.set('from', points.start.title || '起点');
      params.set('to', points.end.title || '终点');
      params.set('fromcoord', startP.lat + ',' + startP.lng);
      params.set('tocoord', endP.lat + ',' + endP.lng);
      params.set('policy', '0');
      params.set('referer', TENCENT_REFERER);
      return 'qqmap://map/routeplan?' + params.toString();
    }

    function buildRouteLink(sel, mapProvider, platform, target) {
      if (!Array.isArray(sel) || sel.length < 2) return '';
      var web = target === 'web';
      if (mapProvider === 'baidu') {
        var baiduPts = pickRoutePoints(sel, 0);
        return web ? buildBaiduWebRouteUrl(baiduPts) : buildBaiduSchemeRouteUrl(baiduPts);
      }
      if (mapProvider === 'tencent') {
        var qqPts = pickRoutePoints(sel, 0);
        return web ? buildTencentWebRouteUrl(qqPts) : buildTencentSchemeRouteUrl(qqPts);
      }
      var amapPts = pickRoutePoints(sel, web ? AMAP_WEB_MAX_VIA : 16);
      return web ? buildAmapWebRouteUrl(amapPts) : buildAmapSchemeRouteUrl(amapPts, platform);
    }

    function buildAmapSchemeMarkerUrl(item, platform) {
      var p = toGcjCoordinate(item);
      var params = new URLSearchParams();
      params.set('sourceApplication', 'IITC-Intel');
      params.set('poiname', item.title);
      params.set('lat', String(p.lat));
      params.set('lon', String(p.lng));
      params.set('dev', '1');
      var prefix = platform === 'android' ? 'androidamap://viewMap?' : 'iosamap://viewMap?';
      return prefix + params.toString();
    }

    function buildBaiduSchemeMarkerUrl(item) {
      var p = toBaiduCoordinate(item);
      var params = new URLSearchParams();
      params.set('location', p.lat + ',' + p.lng);
      params.set('title', item.title);
      params.set('content', item.title);
      params.set('coord_type', 'bd09ll');
      params.set('src', BAIDU_SRC);
      return 'baidumap://map/marker?' + params.toString();
    }

    function buildTencentSchemeMarkerUrl(item) {
      var p = toGcjCoordinate(item);
      var params = new URLSearchParams();
      params.set('marker', 'coord:' + p.lat + ',' + p.lng + ';title:' + item.title + ';addr:' + item.title);
      params.set('referer', TENCENT_REFERER);
      return 'qqmap://map/marker?' + params.toString();
    }

    function buildMarkerLink(item, mapProvider, platform, target) {
      if (target === 'web') return buildMarkerUrl(item, mapProvider);
      if (mapProvider === 'baidu') return buildBaiduSchemeMarkerUrl(item);
      if (mapProvider === 'tencent') return buildTencentSchemeMarkerUrl(item);
      return buildAmapSchemeMarkerUrl(item, platform);
    }

    function buildMarkerLinks(item, mapProvider) {
      return {
        web: buildMarkerLink(item, mapProvider, 'ios', 'web'),
        ios: buildMarkerLink(item, mapProvider, 'ios', 'app'),
        android: buildMarkerLink(item, mapProvider, 'android', 'app')
      };
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

    function openUrlInNewTab(url) {
      if (!url) return;
      var win = window.open(url, '_blank', 'noopener,noreferrer');
      if (!win) {
        window.prompt('浏览器拦截了新标签页，请手动打开：', url);
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
        '<p style="margin:4px 0;"><b>地图切换:</b> <select id="amap-map-provider"><option value="amap">高德</option><option value="baidu">百度</option><option value="tencent">腾讯</option></select></p>',
        '<div style="border-top:1px solid rgba(255,255,255,0.2);margin:6px 0;"></div>',
        '<p style="margin:4px 0;"><b>当前 Portal:</b> <span id="amap-current-portal">未选中</span></p>',
        '<p style="margin:4px 0;"><a href="#" id="amap-open-current">跳转地图</a> <a href="#" id="amap-copy-current-web">复制 Web 链接</a> <a href="#" id="amap-copy-current-ios">复制 iOS 链接</a> <a href="#" id="amap-copy-current-android">复制 Android 链接</a></p>',
        '<div style="border-top:1px solid rgba(255,255,255,0.2);margin:6px 0;"></div>',
        '<p style="margin:4px 0;"><b>Bookmarks Portal:</b> 已选 Folder: <span id="amap-selected-folder-count">0</span>/<span id="amap-total-folder-count">' + folders.length + '</span>, Portal: <span id="amap-selected-portal-count">0</span>/<span id="amap-total-portal-count">' + items.length + '</span></p>',
        '<div id="amap-folder-list" style="margin:8px 0 10px 0;">',
        folders.map(function (f) {
          return '<label style="display:inline-block;margin-right:10px;"><input type="checkbox" class="amap-folder-check" data-folder="' + escapeHtml(f) + '" checked> ' + escapeHtml(f) + '</label>';
        }).join(''),
        '</div>',
        '<p id="amap-start-row" style="margin:4px 0;"><b>起始 Portal:</b> <select id="amap-start-select"></select></p>',
        '<p id="amap-end-row" style="margin:4px 0;"><b>目的 Portal:</b> <select id="amap-end-select"></select></p>',
        '<div id="amap-via-wrap" style="display:none;margin:0;"><details id="amap-via-dropdown" style="display:inline-block;vertical-align:middle;"><summary><b>途经 Portal:</b></summary><div id="amap-via-checks" style="max-height:140px;overflow:auto;min-width:260px;padding:1px 0;"></div></details></div>',
        '<p style="margin:2px 0;"><a href="#" id="amap-open-amap">跳转地图</a> <a href="#" id="amap-copy-route-web">复制 Web 链接</a> <a href="#" id="amap-copy-route-ios">复制 iOS 链接</a> <a href="#" id="amap-copy-route-android">复制 Android 链接</a></p>',
        normalized.warnings.length ? '<p style="color:#b35c00;">警告: ' + normalized.warnings.length + ' 条（详见 JSON）</p>' : '',
        '<div style="border-top:1px solid rgba(255,255,255,0.2);margin:6px 0;"></div>',
        '<p style="margin:4px 0;"><b>Hints:</b></p>',
        '<div id="amap-hints" style="color:#fff;line-height:1.4;"></div>',
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
        var btnCopyCurrentWeb = document.getElementById('amap-copy-current-web');
        var btnCopyCurrentIos = document.getElementById('amap-copy-current-ios');
        var btnCopyCurrentAndroid = document.getElementById('amap-copy-current-android');
        var btnCopyRouteWeb = document.getElementById('amap-copy-route-web');
        var btnCopyRouteIos = document.getElementById('amap-copy-route-ios');
        var btnCopyRouteAndroid = document.getElementById('amap-copy-route-android');
        var btnOpenAmap = document.getElementById('amap-open-amap');
        var mapProviderSelect = document.getElementById('amap-map-provider');
        var startSelect = document.getElementById('amap-start-select');
        var endSelect = document.getElementById('amap-end-select');
        var viaWrap = document.getElementById('amap-via-wrap');
        var viaDropdown = document.getElementById('amap-via-dropdown');
        var viaChecks = document.getElementById('amap-via-checks');
        var hintsEl = document.getElementById('amap-hints');
        var selectedFolderCountEl = document.getElementById('amap-selected-folder-count');
        var selectedPortalCountEl = document.getElementById('amap-selected-portal-count');
        var currentPortalEl = document.getElementById('amap-current-portal');
        var lastSelectedPortalGuid = '';

        function selectedItems() {
          var selectedFolders = {};
          folderChecks.forEach(function (ch) {
            if (ch.checked) selectedFolders[ch.getAttribute('data-folder')] = true;
          });
          return items.filter(function (x) { return !!selectedFolders[x.folder]; });
        }

        function renderHints() {
          if (!hintsEl) return;
          hintsEl.innerHTML = [
            '<p style="white-space:nowrap;margin:0;line-height:1.4;">1) 高德地图、腾讯地图、百度地图均支持选择起始 Portal、目的 Portal。</p>',
            '<p style="white-space:nowrap;margin:0;line-height:1.4;">2) 高德地图支持多选途经 Portal，移动端最多 16 个，网页端最多 6 个。</p>',
            '<p style="white-space:nowrap;margin:0;line-height:1.4;">3) 如果无法跳转，请复制并使用系统浏览器打开链接。</p>'
          ].join('');
        }

        function setLinkDisabled(el, disabled) {
          if (!el) return;
          el.setAttribute('data-disabled', disabled ? '1' : '0');
          el.style.pointerEvents = disabled ? 'none' : '';
          el.style.opacity = disabled ? '0.5' : '';
        }

        function setViaVisibility(show) {
          if (!viaWrap) return;
          if (show) {
            viaWrap.hidden = false;
            viaWrap.style.display = 'block';
            viaWrap.style.maxHeight = '';
            viaWrap.style.overflow = '';
            viaWrap.style.pointerEvents = '';
            viaWrap.style.margin = '0';
          } else {
            viaWrap.hidden = true;
            viaWrap.style.display = 'none';
            viaWrap.style.maxHeight = '0';
            viaWrap.style.overflow = 'hidden';
            viaWrap.style.pointerEvents = 'none';
            viaWrap.style.margin = '0';
          }
        }

        function currentTarget() {
          return detectPlatform() ? 'app' : 'web';
        }

        function currentPlatform() {
          var p = detectPlatform();
          if (p === 'android') return 'android';
          return 'ios';
        }

        function escapeHtmlOption(s) {
          return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        function renderEndpointSelectors(sel, mapProvider) {
          if (!startSelect || !endSelect) return;
          setViaVisibility(mapProvider === 'amap');
          if (viaDropdown && mapProvider !== 'amap') viaDropdown.open = false;

          var prevStart = String(startSelect.value || '');
          var prevEnd = String(endSelect.value || '');
          var prevVia = viaChecks ? Array.prototype.slice.call(viaChecks.querySelectorAll('.amap-via-check:checked')).map(function (ip) { return String(ip.value); }) : [];
          var options = sel.map(function (item, idx) {
            return '<option value="' + idx + '">' + escapeHtmlOption(item.title) + '</option>';
          }).join('');
          startSelect.innerHTML = options;
          endSelect.innerHTML = options;

          if (sel.length < 2) {
            startSelect.disabled = true;
            endSelect.disabled = true;
            if (viaChecks) Array.prototype.forEach.call(viaChecks.querySelectorAll('.amap-via-check'), function (ip) { ip.disabled = true; ip.checked = false; });
            return;
          }

          startSelect.disabled = false;
          endSelect.disabled = false;

          var startIdx = Number(prevStart);
          var endIdx = Number(prevEnd);
          if (!Number.isInteger(startIdx) || startIdx < 0 || startIdx >= sel.length) startIdx = 0;
          if (!Number.isInteger(endIdx) || endIdx < 0 || endIdx >= sel.length) endIdx = 1;
          if (startIdx === endIdx) endIdx = (startIdx + 1) % sel.length;
          startSelect.value = String(startIdx);
          endSelect.value = String(endIdx);

          if (viaChecks) {
            var selectedSet = {};
            prevVia.forEach(function (x) { selectedSet[x] = true; });
            viaChecks.innerHTML = sel.filter(function (_, idx) {
              return idx !== startIdx && idx !== endIdx;
            }).map(function (item) {
              var originalIdx = sel.indexOf(item);
              var checked = selectedSet[String(originalIdx)] ? ' checked' : '';
              return '<label style="display:block;white-space:nowrap;"><input type="checkbox" class="amap-via-check" value="' + originalIdx + '"' + checked + '> ' + escapeHtmlOption(item.title) + '</label>';
            }).join('');
            if (mapProvider !== 'amap') {
              Array.prototype.forEach.call(viaChecks.querySelectorAll('.amap-via-check'), function (ip) { ip.checked = false; });
            }
          }
        }

        function selectedEndpoints(sel) {
          if (!startSelect || !endSelect || !Array.isArray(sel) || sel.length < 2) return null;
          var startIdx = Number(startSelect.value);
          var endIdx = Number(endSelect.value);
          if (!Number.isInteger(startIdx) || !Number.isInteger(endIdx)) return null;
          if (startIdx < 0 || startIdx >= sel.length || endIdx < 0 || endIdx >= sel.length) return null;
          if (startIdx === endIdx) return null;
          return { start: sel[startIdx], end: sel[endIdx] };
        }

        function selectedRouteItems(sel, mapProvider) {
          var ends = selectedEndpoints(sel);
          if (!ends) return [];
          if (mapProvider !== 'amap' || !viaChecks) return [ends.start, ends.end];
          var viaIdxList = Array.prototype.slice.call(viaChecks.querySelectorAll('.amap-via-check:checked')).map(function (ip) { return Number(ip.value); }).filter(function (i) { return Number.isInteger(i); });
          var viaItems = viaIdxList.map(function (i) { return sel[i]; }).filter(Boolean);
          return [ends.start].concat(viaItems).concat([ends.end]);
        }

        function buildRouteLinksByMode(sel, mapProvider) {
          var routeItems = selectedRouteItems(sel, mapProvider);
          if (routeItems.length < 2) return { web: '', ios: '', android: '' };
          return {
            web: buildRouteLink(routeItems, mapProvider, 'ios', 'web'),
            ios: buildRouteLink(routeItems, mapProvider, 'ios', 'app'),
            android: buildRouteLink(routeItems, mapProvider, 'android', 'app')
          };
        }

        function refreshOutputs() {
          var sel = selectedItems();
          var currentPortal = getCurrentPortalData();
          var mapProvider = (mapProviderSelect && mapProviderSelect.value) || 'amap';
          var platform = currentPlatform();
          var target = currentTarget();
          renderEndpointSelectors(sel, mapProvider);
          var routeItems = selectedRouteItems(sel, mapProvider);
          if (selectedPortalCountEl) selectedPortalCountEl.textContent = String(routeItems.length);
          if (selectedFolderCountEl) {
            var folderCount = folderChecks.filter(function (ch) { return ch.checked; }).length;
            selectedFolderCountEl.textContent = String(folderCount);
          }
          renderHints();
          var btnOpenRouteText = target === 'web' ? '打开地图' : '跳转地图';
          if (btnOpenAmap) btnOpenAmap.textContent = btnOpenRouteText;
          if (btnOpenCurrent) btnOpenCurrent.textContent = btnOpenRouteText;
          var hasPortalTitle = !!(currentPortal && currentPortal.title && String(currentPortal.title).trim());
          if (currentPortal && (mapProvider !== 'tencent' || hasPortalTitle)) {
            currentPortalEl.textContent = currentPortal.title;
            setLinkDisabled(btnOpenCurrent, false);
            var markerLinks = buildMarkerLinks(currentPortal, mapProvider);
            btnOpenCurrent.setAttribute('data-url', target === 'web' ? markerLinks.web : markerLinks[platform]);
            btnCopyCurrentWeb.setAttribute('data-url', markerLinks.web || '');
            btnCopyCurrentIos.setAttribute('data-url', markerLinks.ios || '');
            btnCopyCurrentAndroid.setAttribute('data-url', markerLinks.android || '');
            setLinkDisabled(btnCopyCurrentWeb, !markerLinks.web);
            setLinkDisabled(btnCopyCurrentIos, !markerLinks.ios);
            setLinkDisabled(btnCopyCurrentAndroid, !markerLinks.android);
          } else {
            currentPortalEl.textContent = currentPortal ? '' : '未选中';
            setLinkDisabled(btnOpenCurrent, true);
            btnOpenCurrent.setAttribute('data-url', '');
            btnCopyCurrentWeb.setAttribute('data-url', '');
            btnCopyCurrentIos.setAttribute('data-url', '');
            btnCopyCurrentAndroid.setAttribute('data-url', '');
            setLinkDisabled(btnCopyCurrentWeb, true);
            setLinkDisabled(btnCopyCurrentIos, true);
            setLinkDisabled(btnCopyCurrentAndroid, true);
          }
          var routeLinks = buildRouteLinksByMode(sel, mapProvider);
          var openRouteUrl = target === 'web' ? (routeLinks.web || '') : (routeLinks[platform] || '');
          btnOpenAmap.setAttribute('data-url', openRouteUrl);
          setLinkDisabled(btnOpenAmap, !openRouteUrl);
          btnCopyRouteWeb.setAttribute('data-url', routeLinks.web || '');
          btnCopyRouteIos.setAttribute('data-url', routeLinks.ios || '');
          btnCopyRouteAndroid.setAttribute('data-url', routeLinks.android || '');
          setLinkDisabled(btnCopyRouteWeb, !routeLinks.web);
          setLinkDisabled(btnCopyRouteIos, !routeLinks.ios);
          setLinkDisabled(btnCopyRouteAndroid, !routeLinks.android);
          lastSelectedPortalGuid = window.selectedPortal ? String(window.selectedPortal) : '';
        }

        folderChecks.forEach(function (ch) {
          ch.addEventListener('change', refreshOutputs);
        });
        if (startSelect) startSelect.addEventListener('change', refreshOutputs);
        if (endSelect) endSelect.addEventListener('change', refreshOutputs);
        if (viaChecks) viaChecks.addEventListener('change', refreshOutputs);

        if (btnOpenCurrent) btnOpenCurrent.onclick = function (ev) {
          ev.preventDefault();
          if (btnOpenCurrent.getAttribute('data-disabled') === '1') return;
          var u = btnOpenCurrent.getAttribute('data-url') || '';
          if (!u) return;
          if (currentTarget() === 'web') openUrlInNewTab(u);
          else window.location.href = u;
        };

        if (btnCopyCurrentWeb) btnCopyCurrentWeb.onclick = function (ev) { ev.preventDefault(); refreshOutputs(); if (btnCopyCurrentWeb.getAttribute('data-disabled') === '1') return; copyText(btnCopyCurrentWeb.getAttribute('data-url') || ''); };
        if (btnCopyCurrentIos) btnCopyCurrentIos.onclick = function (ev) { ev.preventDefault(); refreshOutputs(); if (btnCopyCurrentIos.getAttribute('data-disabled') === '1') return; copyText(btnCopyCurrentIos.getAttribute('data-url') || ''); };
        if (btnCopyCurrentAndroid) btnCopyCurrentAndroid.onclick = function (ev) { ev.preventDefault(); refreshOutputs(); if (btnCopyCurrentAndroid.getAttribute('data-disabled') === '1') return; copyText(btnCopyCurrentAndroid.getAttribute('data-url') || ''); };

        if (mapProviderSelect) {
          var savedMap = window.localStorage.getItem(PREF_MAP_KEY);
          if (savedMap === 'amap' || savedMap === 'baidu' || savedMap === 'tencent') {
            mapProviderSelect.value = savedMap;
          } else {
            mapProviderSelect.value = 'amap';
          }
          window.localStorage.setItem(PREF_MAP_KEY, mapProviderSelect.value);
          mapProviderSelect.addEventListener('change', function () {
            window.localStorage.setItem(PREF_MAP_KEY, mapProviderSelect.value);
            setViaVisibility(mapProviderSelect.value === 'amap');
            if (viaDropdown && mapProviderSelect.value !== 'amap') viaDropdown.open = false;
            refreshOutputs();
          });
        }
        refreshOutputs();

        if (btnCopyRouteWeb) btnCopyRouteWeb.onclick = function (ev) { ev.preventDefault(); refreshOutputs(); if (btnCopyRouteWeb.getAttribute('data-disabled') === '1') return; copyText(btnCopyRouteWeb.getAttribute('data-url') || ''); };
        if (btnCopyRouteIos) btnCopyRouteIos.onclick = function (ev) { ev.preventDefault(); refreshOutputs(); if (btnCopyRouteIos.getAttribute('data-disabled') === '1') return; copyText(btnCopyRouteIos.getAttribute('data-url') || ''); };
        if (btnCopyRouteAndroid) btnCopyRouteAndroid.onclick = function (ev) { ev.preventDefault(); refreshOutputs(); if (btnCopyRouteAndroid.getAttribute('data-disabled') === '1') return; copyText(btnCopyRouteAndroid.getAttribute('data-url') || ''); };

        if (btnOpenAmap) btnOpenAmap.onclick = function (ev) {
          ev.preventDefault();
          if (btnOpenAmap.getAttribute('data-disabled') === '1') return;
          var link = btnOpenAmap.getAttribute('data-url') || '';
          if (!link) {
            alert('没有可跳转的路线，请先选择至少 2 个 portal。');
            return;
          }
          if (currentTarget() === 'web') openUrlInNewTab(link);
          else window.location.href = link;
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
        buildRouteLink: buildRouteLink
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
