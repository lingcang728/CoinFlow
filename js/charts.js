// Chart.js 4.x 图表配置与封装
// 所有的图表主题均采用 CoinFlow 的深色磨砂玻璃与橙金视觉风格

const CHART_FONT_FAMILY = "Inter, 'Microsoft YaHei UI', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// 设置 Chart.js 默认全局样式
if (window.Chart) {
  window.Chart.defaults.color = 'rgba(255, 255, 255, 0.6)';
  window.Chart.defaults.font.family = CHART_FONT_FAMILY;
  window.Chart.defaults.font.size = 11;
  window.Chart.defaults.responsive = true;
  window.Chart.defaults.maintainAspectRatio = false;
  
  // 调整 Tooltip 的默认样式
  window.Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 15, 25, 0.9)';
  window.Chart.defaults.plugins.tooltip.titleColor = '#fff';
  window.Chart.defaults.plugins.tooltip.bodyColor = 'rgba(255, 255, 255, 0.8)';
  window.Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
  window.Chart.defaults.plugins.tooltip.borderWidth = 1;
  window.Chart.defaults.plugins.tooltip.cornerRadius = 8;
  window.Chart.defaults.plugins.tooltip.padding = 10;
}

const chartRegistry = new WeakMap();

// 老旧/低配设备或系统「减少动态」时，关闭图表入场动画以保流畅
function chartsLite() {
  return Boolean(window.CoinFlowPerf && (window.CoinFlowPerf.isLite() || window.CoinFlowPerf.prefersReducedMotion()));
}

function getChart(canvas) {
  if (!canvas || !window.Chart) return null;
  return window.Chart.getChart(canvas) || chartRegistry.get(canvas) || null;
}

/**
 * 销毁已有的 Chart 实例，避免 Canvas 重复渲染报错
 */
function destroyChart(canvas) {
  if (!canvas || !window.Chart) return;
  try {
    const chartInstance = getChart(canvas);
    if (chartInstance) {
      chartInstance.destroy();
      chartRegistry.delete(canvas);
    }
  } catch (e) {
    console.warn('[Chart.js] Failed to safely check/destroy existing chart instance:', e);
  }
}

function createOrUpdateChart(canvas, config, updateMode = 'none') {
  const existing = getChart(canvas);

  if (existing && existing.config.type === config.type) {
    existing.data.labels = config.data.labels;
    existing.data.datasets = config.data.datasets;
    existing.options = config.options;
    existing.config.plugins = config.plugins || [];
    if (updateMode === 'default') {
      existing.update();
    } else {
      existing.update(updateMode);
    }
    return existing;
  }

  destroyChart(canvas);
  const chart = new window.Chart(canvas, config);
  chartRegistry.set(canvas, chart);
  return chart;
}

function resizeAll() {
  document.querySelectorAll('canvas').forEach((canvas) => {
    const chart = getChart(canvas);
    if (chart) {
      chart.resize();
      chart.update('none');
    }
  });
}

/**
 * 创建圆环图 (Dashboard & Statistics 页面使用)
 * @param {HTMLCanvasElement} canvas
 * @param {Array<number>} data 各分类消费金额
 * @param {Array<string>} labels 各分类名称
 * @param {Array<string>} colors 各分类配色
 */
function createDoughnutChart(canvas, data, labels, colors) {
  if (!window.Chart) {
    throw new Error('Chart.js is not loaded');
  }
  // 如果全是 0，提供一个空灰环
  const total = data.reduce((sum, val) => sum + val, 0);
  const chartData = total === 0 ? [1] : data;
  const chartColors = total === 0 ? ['rgba(255, 255, 255, 0.1)'] : colors;
  const chartLabels = total === 0 ? ['无数据'] : labels;

  return createOrUpdateChart(canvas, {
    type: 'doughnut',
    data: {
      labels: chartLabels,
      datasets: [{
        data: chartData,
        backgroundColor: chartColors,
        borderWidth: 0,
        hoverOffset: 4,
        borderRadius: total === 0 ? 0 : 4
      }]
    },
    options: {
      cutout: '72%',
      plugins: {
        legend: {
          display: false // 自定义图例以获得更好的移动端排版
        },
        tooltip: {
          enabled: total !== 0,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const percent = ((val / total) * 100).toFixed(1);
              return ` ${context.label}: ¥${val.toFixed(2)} (${percent}%)`;
            }
          }
        }
      },
      animation: chartsLite() ? false : {
        animateRotate: true,
        animateScale: true,
        duration: 760,
        easing: 'easeOutCubic'
      }
    }
  }, 'default');
}

/**
 * 创建每日消费柱状图 (Statistics 页面使用)
 * @param {HTMLCanvasElement} canvas
 * @param {Array<number>} data 每日消费金额
 * @param {Array<string>} labels 对应日期 (如 "1", "2", "3")
 * @param {number} avgLineValue 平均消费额虚线
 */
function createBarChart(canvas, data, labels, avgLineValue = 0) {
  if (!window.Chart) {
    throw new Error('Chart.js is not loaded');
  }
  // 橙金渐变填充
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || canvas.height || 200);
  gradient.addColorStop(0, '#FF8C00');
  gradient.addColorStop(1, 'rgba(255, 215, 0, 0.2)');

  const datasets = [{
    label: '每日消费',
    data: data,
    backgroundColor: gradient,
    borderRadius: 4,
    hoverBackgroundColor: '#FFD700',
    borderWidth: 0,
    barPercentage: 0.6
  }];

  const plugins = [];

  // 如果有均线，使用 Chart.js 插件画虚线
  if (avgLineValue > 0) {
    plugins.push({
      id: 'averageLine',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales || !scales.y) return;

        const { left, right } = chartArea;
        const y = scales.y;
        const yPos = y.getPixelForValue(avgLineValue);
        if (!Number.isFinite(yPos)) return;
        
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.moveTo(left, yPos);
        ctx.lineTo(right, yPos);
        ctx.stroke();
        
        // 绘制文字标记
        ctx.fillStyle = 'rgba(255, 215, 0, 0.6)';
        ctx.font = `9px ${CHART_FONT_FAMILY}`;
        ctx.fillText(`日均: ¥${avgLineValue.toFixed(1)}`, right - 65, yPos - 5);
        ctx.restore();
      }
    });
  }

  return createOrUpdateChart(canvas, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: datasets
    },
    plugins: plugins,
    options: {
      scales: {
        x: {
          grid: { display: false },
          ticks: { maxRotation: 0 }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          border: { dash: [5, 5] },
          beginAtZero: true
        }
      },
      plugins: {
        legend: { display: false }
      },
      animation: {
        duration: (getChart(canvas) || chartsLite()) ? 0 : 650,
        easing: 'easeOutQuart'
      },
      resizeDelay: 120
    }
  });
}

/**
 * 创建月度趋势折线图 (Statistics 页面使用)
 * @param {HTMLCanvasElement} canvas
 * @param {Array<number>} spentData 过去 6 个月每月消费额
 * @param {Array<number>} budgetData 对应预算额 (通常是定值)
 * @param {Array<string>} labels 月份 (如 "12月", "1月", "2月")
 */
function createLineChart(canvas, spentData, budgetData, labels) {
  if (!window.Chart) {
    throw new Error('Chart.js is not loaded');
  }
  const ctx = canvas.getContext('2d');
  
  // 消费折线下方的渐变阴影
  const spentGradient = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || canvas.height || 200);
  spentGradient.addColorStop(0, 'rgba(255, 140, 0, 0.25)');
  spentGradient.addColorStop(1, 'rgba(255, 140, 0, 0.0)');

  return createOrUpdateChart(canvas, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: '月度消费',
          data: spentData,
          borderColor: '#FF8C00',
          borderWidth: 3,
          pointBackgroundColor: '#FFD700',
          pointBorderColor: '#0a0a0f',
          pointBorderWidth: 2,
          pointRadius: 5,
          pointHoverRadius: 7,
          fill: true,
          backgroundColor: spentGradient,
          tension: 0.3
        },
        {
          label: '月度预算',
          data: budgetData,
          borderColor: 'rgba(255, 255, 255, 0.25)',
          borderWidth: 2,
          pointRadius: 0,
          borderDash: [5, 5],
          fill: false,
          tension: 0.1
        }
      ]
    },
    options: {
      scales: {
        x: {
          grid: { display: false }
        },
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          border: { dash: [5, 5] },
          beginAtZero: true
        }
      },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            boxWidth: 15,
            padding: 10
          }
        }
      },
      animation: {
        duration: (getChart(canvas) || chartsLite()) ? 0 : 650,
        easing: 'easeInOutCubic'
      },
      resizeDelay: 120
    }
  });
}

// 暴露 API
window.CoinFlowCharts = {
  createDoughnutChart,
  createBarChart,
  createLineChart,
  resizeAll,
  destroyChart
};
