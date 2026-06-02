// CoinFlow 性能模式探测：在老旧/低配设备上自动启用「精简渲染」，
// 关闭最耗 GPU 的毛玻璃模糊与重阴影动画。可被本地存储手动覆盖。
// 该脚本需在样式表生效前同步执行（见 index.html <head>），以避免闪烁。
(function() {
  var STORAGE_KEY = 'coinflow:perf-lite';

  function autoDetectLite() {
    // deviceMemory 单位为 GB（上限 8）；hardwareConcurrency 为逻辑核心数。
    // 老旧设备通常 <=4GB 内存或 <=2 核心 —— 此时关闭模糊以保流畅。
    var mem = typeof navigator.deviceMemory === 'number' ? navigator.deviceMemory : null;
    var cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;
    if (mem !== null && mem <= 4) return true;
    if (cores !== null && cores <= 2) return true;
    return false;
  }

  function shouldUseLite() {
    try {
      var stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === '1') return true;   // 手动强制开启
      if (stored === '0') return false;  // 手动强制关闭
    } catch (e) { /* localStorage 不可用时忽略 */ }
    return autoDetectLite();
  }

  var root = document.documentElement;
  if (shouldUseLite()) {
    root.classList.add('perf-lite');
  }

  window.CoinFlowPerf = {
    isLite: function() {
      return root.classList.contains('perf-lite');
    },
    prefersReducedMotion: function() {
      try {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      } catch (e) {
        return false;
      }
    },
    // setLite(true) 强制精简，setLite(false) 强制完整效果，setLite(null) 恢复自动判断
    setLite: function(on) {
      try {
        if (on === null) {
          window.localStorage.removeItem(STORAGE_KEY);
        } else {
          window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        }
      } catch (e) { /* 忽略 */ }
      root.classList.toggle('perf-lite', !!shouldUseLite());
    }
  };
})();
