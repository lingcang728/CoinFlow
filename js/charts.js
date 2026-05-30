// Chart.js 4.x 图表配置与封装
// 所有的图表主题均采用 CoinFlow 的深色磨砂玻璃与橙金视觉风格

// 设置 Chart.js 默认全局样式
if (window.Chart) {
  Chart.defaults.color = 'rgba(255, 255, 255, 0.6)';
  Chart.defaults.font.family = "'Inter', 'Noto Sans SC', sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.responsive = true;
  Chart.defaults.maintainAspectRatio = false;
  
  // 调整 Tooltip 的默认样式
  Chart.defaults.plugins.tooltip.backgroundColor = 'rgba(15, 15, 25, 0.9)';
  Chart.defaults.plugins.tooltip.titleColor = '#fff';
  Chart.defaults.plugins.tooltip.bodyColor = 'rgba(255, 255, 255, 0.8)';
  Chart.defaults.plugins.tooltip.borderColor = 'rgba(255, 255, 255, 0.1)';
  Chart.defaults.plugins.tooltip.borderWidth = 1;
  Chart.defaults.plugins.tooltip.cornerRadius = 8;
  Chart.defaults.plugins.tooltip.padding = 10;
}

/**
 * 销毁已有的 Chart 实例，避免 Canvas 重复渲染报错
 */
function destroyChart(ctx) {
  const chartInstance = Chart.getChart(ctx);
  if (chartInstance) {
    chartInstance.destroy();
  }
}

/**
 * 创建圆环图 (Dashboard & Statistics 页面使用)
 * @param {HTMLCanvasElement} canvas
 * @param {Array<number>} data 各分类消费金额
 * @param {Array<string>} labels 各分类名称
 * @param {Array<string>} colors 各分类配色
 */
function createDoughnutChart(canvas, data, labels, colors) {
  destroyChart(canvas);
  
  // 如果全是 0，提供一个空灰环
  const total = data.reduce((sum, val) => sum + val, 0);
  const chartData = total === 0 ? [1] : data;
  const chartColors = total === 0 ? ['rgba(255, 255, 255, 0.1)'] : colors;
  const chartLabels = total === 0 ? ['无数据'] : labels;

  return new Chart(canvas, {
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
      animation: {
        animateRotate: true,
        animateScale: true,
        duration: 1000,
        easing: 'easeOutBack'
      }
    }
  });
}

/**
 * 创建每日消费柱状图 (Statistics 页面使用)
 * @param {HTMLCanvasElement} canvas
 * @param {Array<number>} data 每日消费金额
 * @param {Array<string>} labels 对应日期 (如 "1", "2", "3")
 * @param {number} avgLineValue 平均消费额虚线
 */
function createBarChart(canvas, data, labels, avgLineValue = 0) {
  destroyChart(canvas);

  // 橙金渐变填充
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
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
        const { ctx, chartArea: { left, right }, scales: { y } } = chart;
        const yPos = y.getPixelForValue(avgLineValue);
        
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
        ctx.font = '9px Inter';
        ctx.fillText(`日均: ¥${avgLineValue.toFixed(1)}`, right - 65, yPos - 5);
        ctx.restore();
      }
    });
  }

  return new Chart(canvas, {
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
        duration: 800,
        easing: 'easeOutQuart'
      }
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
  destroyChart(canvas);

  const ctx = canvas.getContext('2d');
  
  // 消费折线下方的渐变阴影
  const spentGradient = ctx.createLinearGradient(0, 0, 0, canvas.height || 200);
  spentGradient.addColorStop(0, 'rgba(255, 140, 0, 0.25)');
  spentGradient.addColorStop(1, 'rgba(255, 140, 0, 0.0)');

  return new Chart(canvas, {
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
        duration: 1000,
        easing: 'easeInOutCubic'
      }
    }
  });
}

// 暴露 API
window.CoinFlowCharts = {
  createDoughnutChart,
  createBarChart,
  createLineChart
};
