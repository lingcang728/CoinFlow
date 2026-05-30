// CoinFlow 常用工具函数与全局配置
const CATEGORIES = {
  food: { name: '饮食', emoji: '🍚', color: '#FF6B6B', class: 'food' },
  drinks: { name: '奶茶零食', emoji: '🧋', color: '#A855F7', class: 'drinks' },
  transport: { name: '交通', emoji: '🚌', color: '#3B82F6', class: 'transport' },
  shopping: { name: '网购', emoji: '🛒', color: '#F59E0B', class: 'shopping' },
  entertainment: { name: '娱乐', emoji: '🎮', color: '#EC4899', class: 'entertainment' },
  housing: { name: '宿舍生活', emoji: '🏠', color: '#10B981', class: 'housing' },
  social: { name: '社交', emoji: '👥', color: '#06B6D4', class: 'social' },
  study: { name: '学习', emoji: '📚', color: '#8B5CF6', class: 'study' }
};

// 格式化金额：如 1234.5 -> ¥1,234.50
function formatAmount(amount) {
  return '¥' + parseFloat(amount).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

// 格式化日期：
// 如果是今天，返回 "今天"
// 如果是昨天，返回 "昨天"
// 其他返回 "M月D日" 或 "YYYY-MM-DD"
function formatFriendlyDate(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dateObj = new Date(dateStr + 'T00:00:00');
  const compareDate = new Date(dateObj);
  compareDate.setHours(0, 0, 0, 0);
  
  const diffTime = today.getTime() - compareDate.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return '今天';
  if (diffDays === 1) return '昨天';
  if (diffDays === 2) return '前天';

  return `${dateObj.getMonth() + 1}月${dateObj.getDate()}日`;
}

// 获取当前的 YYYY-MM-DD
function getTodayDateString() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function escapeHtml(value) {
  const escapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };

  return String(value ?? '').replace(/[&<>"']/g, char => escapeMap[char]);
}

// 智能震动反馈 (模拟 iOS Haptic Feedback)
function triggerHaptic(type = 'light') {
  if (!navigator.vibrate) return;
  switch (type) {
    case 'light':
      navigator.vibrate(15);
      break;
    case 'medium':
      navigator.vibrate(30);
      break;
    case 'success':
      navigator.vibrate([30, 40, 30]);
      break;
    case 'warning':
      navigator.vibrate([60, 50, 60]);
      break;
    case 'error':
      navigator.vibrate([100, 50, 100, 50, 100]);
      break;
  }
}

// 全局简易事件总线
class EventBus {
  constructor() {
    this.events = {};
  }
  on(event, callback) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(callback);
  }
  emit(event, data) {
    if (this.events[event]) {
      this.events[event].forEach(cb => cb(data));
    }
  }
}

const coinFlowEvents = new EventBus();

// 自定义轻量 Toast 提示
function showToast(message, type = 'info') {
  let toast = document.getElementById('coinflow-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'coinflow-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 85px;
      left: 50%;
      transform: translateX(-50%) translateY(20px);
      background: rgba(20, 20, 30, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.15);
      color: #fff;
      padding: 10px 20px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      z-index: 9999;
      opacity: 0;
      pointer-events: none;
      box-shadow: 0 5px 20px rgba(0,0,0,0.5);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    `;
    document.body.appendChild(toast);
  }

  // 根据类型显示颜色
  if (type === 'success') {
    toast.style.borderColor = 'rgba(76, 175, 80, 0.4)';
    toast.style.color = '#81C784';
  } else if (type === 'warning') {
    toast.style.borderColor = 'rgba(255, 183, 77, 0.4)';
    toast.style.color = '#FFB74D';
  } else if (type === 'error') {
    toast.style.borderColor = 'rgba(244, 67, 54, 0.4)';
    toast.style.color = '#E57373';
  } else {
    toast.style.borderColor = 'rgba(255, 255, 255, 0.15)';
    toast.style.color = '#fff';
  }

  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translateX(-50%) translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2500);
}

// 暴露为全局对象
window.CoinFlowUtils = {
  CATEGORIES,
  formatAmount,
  formatFriendlyDate,
  getTodayDateString,
  escapeHtml,
  triggerHaptic,
  events: coinFlowEvents,
  showToast
};
