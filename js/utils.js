// CoinFlow 常用工具函数与全局配置
const CATEGORIES = {
  food: { name: '饮食', emoji: '🍚', color: '#FF6B6B', class: 'food' },
  drinks: { name: '奶茶零食', emoji: '🧋', color: '#A855F7', class: 'drinks' },
  shopping: { name: '网购', emoji: '🛒', color: '#F59E0B', class: 'shopping' },
  transport: { name: '交通', emoji: '🚌', color: '#3B82F6', class: 'transport' },
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

function normalizeAmountText(rawValue, cursorIndex = String(rawValue ?? '').length) {
  const source = String(rawValue ?? '').replace(/[，。]/g, '.');
  const safeCursor = Number.isFinite(cursorIndex) ? Math.max(0, cursorIndex) : source.length;
  let value = '';
  let nextCursor = 0;
  let hasDot = false;
  let integerDigits = 0;
  let decimalDigits = 0;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const beforeCursor = index < safeCursor;
    let accepted = false;

    if (/\d/.test(char)) {
      if (hasDot) {
        if (decimalDigits < 2) {
          decimalDigits += 1;
          accepted = true;
        }
      } else if (integerDigits < 8) {
        integerDigits += 1;
        accepted = true;
      }
    } else if (char === '.' && !hasDot) {
      hasDot = true;
      accepted = true;
    }

    if (accepted) {
      value += char;
      if (beforeCursor) {
        nextCursor += 1;
      }
    }
  }

  return { value, cursor: nextCursor };
}

function normalizeAmountForStorage(rawValue) {
  const normalized = normalizeAmountText(rawValue).value;
  const amount = parseFloat(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return amount.toFixed(2);
}

function normalizeDateString(rawValue) {
  const match = String(rawValue || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return '';
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return '';
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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
let toastHideTimer = null;
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

  // 连续弹出时取消上一条的隐藏定时器，避免新提示被提前藏掉
  if (toastHideTimer) {
    clearTimeout(toastHideTimer);
  }
  toastHideTimer = setTimeout(() => {
    toastHideTimer = null;
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(20px)';
  }, 2500);
}

// 应用内确认弹窗，替代原生 confirm()。
// Electron/Windows 下原生 confirm/alert 会阻塞渲染进程且关闭后窗口键盘焦点丢失
// （输入框无法再输入，表现为「卡死」），因此一律使用应用内弹窗。
function showConfirm(message, options = {}) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay active';
    overlay.style.zIndex = '10000';
    overlay.innerHTML = `
      <div class="bottom-sheet desktop-modal" style="max-width: 360px; text-align: center;" role="alertdialog" aria-modal="true">
        <p style="margin: 6px 0 18px; font-size: 14px; color: #fff; line-height: 1.6;"></p>
        <div style="display: flex; gap: 10px;">
          <button type="button" class="btn-secondary" data-confirm-cancel style="flex: 1; padding: 10px;"></button>
          <button type="button" class="btn-primary" data-confirm-ok style="flex: 1; padding: 10px;"></button>
        </div>
      </div>
    `;
    overlay.querySelector('p').textContent = String(message || '确认执行该操作吗？');
    const cancelBtn = overlay.querySelector('[data-confirm-cancel]');
    const okBtn = overlay.querySelector('[data-confirm-ok]');
    cancelBtn.textContent = options.cancelText || '取消';
    okBtn.textContent = options.okText || '确认';
    if (options.danger) {
      // btn-primary 的渐变背景带 !important，内联覆盖必须同样声明 important 才生效。
      okBtn.style.setProperty('background', 'linear-gradient(135deg, #EF5350, #D32F2F)', 'important');
      okBtn.style.setProperty('box-shadow', '0 6px 18px rgba(244, 67, 54, 0.3)', 'important');
    }

    const previousFocus = document.activeElement;
    function finish(result) {
      document.removeEventListener('keydown', onKeydown, true);
      overlay.remove();
      if (previousFocus && typeof previousFocus.focus === 'function' && previousFocus.isConnected) {
        previousFocus.focus();
      }
      resolve(result);
    }
    function onKeydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        finish(true);
      }
    }

    cancelBtn.addEventListener('click', () => finish(false));
    okBtn.addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) finish(false);
    });
    document.addEventListener('keydown', onKeydown, true);

    document.body.appendChild(overlay);
    okBtn.focus();
  });
}

// 暴露为全局对象
window.CoinFlowUtils = {
  CATEGORIES,
  formatAmount,
  formatFriendlyDate,
  getTodayDateString,
  escapeHtml,
  normalizeAmountText,
  normalizeAmountForStorage,
  normalizeDateString,
  triggerHaptic,
  events: coinFlowEvents,
  showToast,
  showConfirm
};
