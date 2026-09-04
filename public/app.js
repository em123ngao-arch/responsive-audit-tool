/**
 * app.js — Client-side logic for Responsive Audit Tool v2.0
 * Includes: DOM criteria rendering, Lighthouse scores, Core Web Vitals display
 */

// ==================== State ====================
let auditResults = null;
let loadingInterval = null;

// ==================== DOM Refs ====================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ==================== Init ====================
document.addEventListener('DOMContentLoaded', () => {
  // Enter key to start audit
  $('#url-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startAudit();
  });

  // Auto-focus input
  setTimeout(() => $('#url-input')?.focus(), 500);

  // Add SVG gradient for gauge
  addGaugeSVGDefs();
});

function addGaugeSVGDefs() {
  const svg = document.querySelector('.gauge-svg');
  if (!svg) return;
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  defs.innerHTML = `
    <linearGradient id="gauge-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#00d4ff" />
      <stop offset="50%" stop-color="#8b5cf6" />
      <stop offset="100%" stop-color="#ec4899" />
    </linearGradient>
  `;
  svg.prepend(defs);
}

// ==================== Start Audit ====================
async function startAudit() {
  const input = $('#url-input');
  let url = input.value.trim();

  if (!url) {
    input.focus();
    input.style.boxShadow = '0 0 0 2px rgba(255, 82, 82, 0.4)';
    setTimeout(() => input.style.boxShadow = '', 1500);
    return;
  }

  // Auto-prepend https if needed
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Show loading
  showSection('loading');
  $('#loading-url').textContent = url;
  $('#audit-btn').disabled = true;

  // Animate loading steps
  animateLoadingSteps();

  try {
    const response = await fetch('/api/audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || err.error || 'Audit failed');
    }

    auditResults = await response.json();

    // Complete loading animation
    completeLoading();

    // Small delay for visual effect before showing results
    setTimeout(() => {
      showSection('results');
      renderResults(auditResults);
    }, 800);

  } catch (err) {
    console.error('Audit error:', err);
    showSection('error');
    $('#error-message').textContent = err.message || 'Đã xảy ra lỗi. Vui lòng kiểm tra URL và thử lại.';
  } finally {
    $('#audit-btn').disabled = false;
    clearInterval(loadingInterval);
  }
}

// ==================== Section Management ====================
function showSection(name) {
  $('#hero-section').classList.toggle('hidden', name !== 'hero');
  $('#loading-section').classList.toggle('hidden', name !== 'loading');
  $('#error-section').classList.toggle('hidden', name !== 'error');
  $('#results-section').classList.toggle('hidden', name !== 'results');

  if (name !== 'hero') {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function resetToInput() {
  showSection('hero');
  auditResults = null;
  clearInterval(loadingInterval);
  // Reset loading steps (7 steps now)
  for (let i = 1; i <= 7; i++) {
    const step = $(`#step-${i}`);
    if (step) {
      step.classList.remove('active', 'done');
      if (i === 1) step.classList.add('active');
    }
  }
  $('#progress-bar').style.width = '0%';
  setTimeout(() => $('#url-input')?.focus(), 300);
}

// ==================== Loading Animation ====================
function animateLoadingSteps() {
  let currentStep = 1;
  const totalSteps = 7; // Updated: 7 steps including Lighthouse

  loadingInterval = setInterval(() => {
    if (currentStep > totalSteps) {
      clearInterval(loadingInterval);
      return;
    }

    // Mark previous as done
    if (currentStep > 1) {
      $(`#step-${currentStep - 1}`).classList.remove('active');
      $(`#step-${currentStep - 1}`).classList.add('done');
    }

    // Mark current as active
    $(`#step-${currentStep}`).classList.add('active');

    // Update progress
    const progress = ((currentStep - 1) / totalSteps) * 90;
    $('#progress-bar').style.width = progress + '%';

    currentStep++;
  }, 2000); // 2 seconds per step for 7 steps (~50-70s total audit)
}

function completeLoading() {
  clearInterval(loadingInterval);
  for (let i = 1; i <= 7; i++) {
    const step = $(`#step-${i}`);
    if (step) {
      step.classList.remove('active');
      step.classList.add('done');
    }
  }
  $('#progress-bar').style.width = '100%';
}

// ==================== Render Results ====================
function renderResults(data) {
  // Header
  $('#audit-url').textContent = data.url;
  $('#audit-duration').textContent = `⏱ ${data.auditDuration}`;

  // Score gauge (overall combined score)
  animateScore(data.overallScore);

  // Grade
  $('#grade-emoji').textContent = data.grade.emoji;
  $('#grade-label').textContent = data.grade.label;
  $('#grade-badge').style.color = data.grade.color;

  // Description
  const descriptions = {
    'Excellent': 'Website của bạn đạt chuẩn xuất sắc! Responsive design tốt, performance nhanh và accessibility cao.',
    'Good': 'Responsive design tốt, performance khá. Vẫn còn một số điểm cải thiện để đạt chuẩn hiện đại.',
    'Needs Work': 'Website có vấn đề cần sửa chữa. Trải nghiệm trên mobile/tablet và performance chưa tối ưu.',
    'Poor': 'Website cần refactor nghiêm túc. Người dùng mobile sẽ gặp nhiều khó khăn.',
  };
  $('#score-description').textContent = descriptions[data.grade.label] || '';

  // Score breakdown (DOM vs Lighthouse)
  renderScoreBreakdown(data);

  // Quick stats
  const criteria = Object.values(data.criteria);
  $('#stat-pass').textContent = criteria.filter(c => c.status === 'pass').length;
  $('#stat-warn').textContent = criteria.filter(c => c.status === 'warn').length;
  $('#stat-fail').textContent = criteria.filter(c => c.status === 'fail').length;
  $('#stat-viewports').textContent = data.viewports.length;

  // Render tabs
  renderScreenshots(data.viewports);
  renderWebVitals(data);
  renderCriteria(data.criteria);
  renderRecommendations(data.recommendations, data);

  // Default tab
  switchTab('screenshots');
}

function renderScoreBreakdown(data) {
  const el = $('#score-breakdown');
  if (!el) return;

  if (data.lighthouse) {
    const lhAvg = Math.round(
      (data.lighthouse.mobile.performance + data.lighthouse.mobile.accessibility +
       data.lighthouse.mobile.bestPractices + data.lighthouse.mobile.seo) / 4
    );
    el.innerHTML = `
      <div class="score-breakdown-pills">
        <span class="breakdown-pill">🔍 DOM: <strong>${data.domScore}</strong></span>
        <span class="breakdown-pill">🔦 Lighthouse: <strong>${lhAvg}</strong></span>
      </div>
    `;
  } else if (data.lighthouseError) {
    el.innerHTML = `<p class="breakdown-note">⚠️ ${data.lighthouseError}</p>`;
  }
}

function animateScore(targetScore) {
  const scoreEl = $('#score-number');
  const gaugeFill = $('#gauge-fill');
  const circumference = 2 * Math.PI * 85; // r=85

  // Animate number
  let current = 0;
  const duration = 2000;
  const start = performance.now();

  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic

    current = Math.round(eased * targetScore);
    scoreEl.textContent = current;

    // Animate gauge
    const offset = circumference - (circumference * eased * targetScore) / 100;
    gaugeFill.style.strokeDashoffset = offset;

    if (progress < 1) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);
}

// ==================== Screenshots ====================
function renderScreenshots(viewports) {
  const grid = $('#screenshots-grid');
  grid.innerHTML = '';

  viewports.forEach((vp, idx) => {
    const card = document.createElement('div');
    card.className = 'screenshot-card';
    card.style.animationDelay = `${idx * 0.1}s`;

    const hasScreenshot = vp.screenshot && !vp.error;

    card.innerHTML = `
      <div class="screenshot-header">
        <div class="screenshot-device">
          <span class="screenshot-device-icon">${vp.icon}</span>
          <span class="screenshot-device-name">${vp.name}</span>
        </div>
        <span class="screenshot-device-size">${vp.width}×${vp.height}</span>
      </div>
      ${hasScreenshot ? `
        <div class="screenshot-img-wrapper">
          <img class="screenshot-img" src="${vp.screenshot}" alt="Screenshot ${vp.name}" loading="lazy">
        </div>
        <div class="screenshot-status">
          <span class="screenshot-load-time">⏱ ${(vp.loadTime / 1000).toFixed(2)}s</span>
          <span class="screenshot-overflow-badge ${vp.hasOverflow ? 'overflow-yes' : 'overflow-no'}">
            ${vp.hasOverflow ? '⚠ Overflow' : '✓ No overflow'}
          </span>
        </div>
      ` : `
        <div class="screenshot-img-wrapper" style="padding: 3rem; text-align: center; color: var(--text-muted);">
          <p>❌ Không thể chụp screenshot</p>
          <p style="font-size: 0.75rem; margin-top: 0.5rem;">${vp.error || 'Unknown error'}</p>
        </div>
      `}
    `;

    if (hasScreenshot) {
      card.addEventListener('click', () => openModal(vp));
    }

    grid.appendChild(card);
  });
}

// ==================== Web Vitals (Lighthouse) ====================

/**
 * CWV thresholds based on Google's standards
 * Ref: https://web.dev/vitals/
 */
const CWV_THRESHOLDS = {
  lcp:  { good: 2500, poor: 4000, unit: 'ms', label: 'LCP', name: 'Largest Contentful Paint', desc: 'Thời gian hiển thị nội dung lớn nhất' },
  fcp:  { good: 1800, poor: 3000, unit: 'ms', label: 'FCP', name: 'First Contentful Paint', desc: 'Thời gian nội dung đầu tiên xuất hiện' },
  cls:  { good: 0.1,  poor: 0.25, unit: '',   label: 'CLS', name: 'Cumulative Layout Shift', desc: 'Mức độ dịch chuyển layout không mong muốn' },
  tbt:  { good: 200,  poor: 600,  unit: 'ms', label: 'TBT', name: 'Total Blocking Time', desc: 'Tổng thời gian main thread bị block' },
  si:   { good: 3400, poor: 5800, unit: 'ms', label: 'SI',  name: 'Speed Index', desc: 'Tốc độ hiển thị nội dung trên màn hình' },
  tti:  { good: 3800, poor: 7300, unit: 'ms', label: 'TTI', name: 'Time to Interactive', desc: 'Thời gian trang web có thể tương tác' },
};

function getCwvStatus(key, value) {
  if (value === null) return 'unknown';
  const t = CWV_THRESHOLDS[key];
  if (!t) return 'unknown';
  if (value <= t.good) return 'good';
  if (value <= t.poor) return 'needs-improvement';
  return 'poor';
}

function formatCwvValue(key, value) {
  if (value === null) return 'N/A';
  const t = CWV_THRESHOLDS[key];
  if (!t) return value;
  if (t.unit === 'ms') {
    return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`;
  }
  return value.toFixed(3);
}

function renderWebVitals(data) {
  const container = $('#vitals-content');
  if (!container) return;

  // If Lighthouse failed
  if (!data.lighthouse) {
    container.innerHTML = `
      <div class="vitals-error">
        <div class="vitals-error-icon">⚠️</div>
        <h3>Lighthouse Audit Không Khả Dụng</h3>
        <p>${data.lighthouseError || 'Không thể chạy Lighthouse cho URL này.'}</p>
        <p class="vitals-error-note">Điều này có thể xảy ra với trang yêu cầu đăng nhập, có CAPTCHA, hoặc block headless browsers.</p>
      </div>
    `;
    return;
  }

  const lhMobile = data.lighthouse.mobile;
  const lhDesktop = data.lighthouse.desktop;
  const cwvMobile = data.webVitals?.mobile;
  const cwvDesktop = data.webVitals?.desktop;

  container.innerHTML = `
    <!-- Lighthouse Category Scores -->
    <div class="vitals-section">
      <div class="vitals-section-header">
        <h3>🔦 Lighthouse Scores</h3>
        <div class="vitals-device-toggle">
          <button class="device-btn active" id="lh-mobile-btn" onclick="toggleLhDevice('mobile')">📱 Mobile</button>
          <button class="device-btn" id="lh-desktop-btn" onclick="toggleLhDevice('desktop')">💻 Desktop</button>
        </div>
      </div>

      <div class="lh-scores-grid" id="lh-scores-grid">
        ${renderLhScoreCards(lhMobile, lhDesktop, 'mobile')}
      </div>
    </div>

    <!-- Core Web Vitals -->
    <div class="vitals-section">
      <div class="vitals-section-header">
        <h3>⚡ Core Web Vitals</h3>
        <div class="vitals-device-toggle">
          <button class="device-btn active" id="cwv-mobile-btn" onclick="toggleCwvDevice('mobile')">📱 Mobile</button>
          <button class="device-btn" id="cwv-desktop-btn" onclick="toggleCwvDevice('desktop')">💻 Desktop</button>
        </div>
      </div>

      <div class="cwv-grid" id="cwv-grid">
        ${renderCwvCards(cwvMobile)}
      </div>
    </div>

    <!-- Performance Opportunities -->
    ${data.lighthouseOpportunities && data.lighthouseOpportunities.length > 0 ? `
    <div class="vitals-section">
      <div class="vitals-section-header">
        <h3>🎯 Cơ hội cải thiện Performance</h3>
      </div>
      <div class="opportunities-list">
        ${data.lighthouseOpportunities.map(opp => `
          <div class="opportunity-item">
            <div class="opportunity-score-dot ${opp.score < 0.5 ? 'fail' : opp.score < 0.9 ? 'warn' : 'pass'}"></div>
            <div class="opportunity-content">
              <div class="opportunity-title">${escapeHtml(opp.title)}</div>
              ${opp.displayValue ? `<div class="opportunity-value">${escapeHtml(opp.displayValue)}</div>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}

    <!-- Accessibility Issues -->
    ${data.a11yIssues && data.a11yIssues.length > 0 ? `
    <div class="vitals-section">
      <div class="vitals-section-header">
        <h3>♿ Vấn đề Accessibility (WCAG)</h3>
      </div>
      <div class="a11y-issues-list">
        ${data.a11yIssues.map(issue => `
          <div class="a11y-issue-item">
            <div class="a11y-score-badge ${issue.score < 0.5 ? 'fail' : 'warn'}">
              ${Math.round(issue.score * 100)}
            </div>
            <div class="a11y-content">
              <div class="a11y-title">${escapeHtml(issue.title)}</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>` : ''}
  `;

  // Store data for device toggle
  window._lhData = { mobile: lhMobile, desktop: lhDesktop };
  window._cwvData = { mobile: cwvMobile, desktop: cwvDesktop };
}

function renderLhScoreCards(mobileScores, desktopScores, device) {
  const scores = device === 'mobile' ? mobileScores : desktopScores;
  const categories = [
    { key: 'performance', label: 'Performance', icon: '⚡' },
    { key: 'accessibility', label: 'Accessibility', icon: '♿' },
    { key: 'bestPractices', label: 'Best Practices', icon: '🛡️' },
    { key: 'seo', label: 'SEO', icon: '🔎' },
  ];

  return categories.map(cat => {
    const score = scores[cat.key] ?? 0;
    const status = score >= 90 ? 'good' : score >= 50 ? 'needs-improvement' : 'poor';
    const color = score >= 90 ? '#00e676' : score >= 50 ? '#ffab00' : '#ff5252';
    const circumference = 2 * Math.PI * 28; // r=28
    const offset = circumference - (circumference * score) / 100;

    return `
      <div class="lh-score-card">
        <div class="lh-score-ring-wrapper">
          <svg viewBox="0 0 64 64" class="lh-ring-svg">
            <circle cx="32" cy="32" r="28" class="lh-ring-bg"/>
            <circle cx="32" cy="32" r="28" class="lh-ring-fill"
              style="stroke: ${color}; stroke-dasharray: ${circumference}; stroke-dashoffset: ${offset}; transform: rotate(-90deg); transform-origin: center;"/>
          </svg>
          <div class="lh-score-num" style="color: ${color}">${score}</div>
        </div>
        <div class="lh-score-label">${cat.icon} ${cat.label}</div>
        <div class="lh-score-status lh-status-${status}">${status === 'good' ? 'Tốt' : status === 'needs-improvement' ? 'Cần cải thiện' : 'Kém'}</div>
      </div>
    `;
  }).join('');
}

function renderCwvCards(cwv) {
  if (!cwv) return '<p class="vitals-no-data">Không có dữ liệu Core Web Vitals</p>';

  const metrics = ['lcp', 'fcp', 'cls', 'tbt', 'si', 'tti'];

  return metrics.map(key => {
    const metric = cwv[key];
    const threshold = CWV_THRESHOLDS[key];
    if (!threshold) return '';

    const value = metric?.value ?? null;
    const displayValue = metric?.displayValue || formatCwvValue(key, value);
    const status = getCwvStatus(key, value);
    const statusLabel = { good: '🟢 Tốt', 'needs-improvement': '🟡 Cần cải thiện', poor: '🔴 Kém', unknown: '⚪ N/A' };
    const statusClass = { good: 'cwv-good', 'needs-improvement': 'cwv-warn', poor: 'cwv-poor', unknown: 'cwv-unknown' };

    return `
      <div class="cwv-card ${statusClass[status]}">
        <div class="cwv-header">
          <span class="cwv-label">${threshold.label}</span>
          <span class="cwv-status-badge">${statusLabel[status]}</span>
        </div>
        <div class="cwv-value">${displayValue}</div>
        <div class="cwv-name">${threshold.name}</div>
        <div class="cwv-desc">${threshold.desc}</div>
        <div class="cwv-thresholds">
          <span class="cwv-threshold-good">≤ ${threshold.unit === 'ms' && threshold.good >= 1000 ? (threshold.good/1000)+'s' : threshold.good}${threshold.unit} tốt</span>
          <span class="cwv-threshold-poor">≥ ${threshold.unit === 'ms' && threshold.poor >= 1000 ? (threshold.poor/1000)+'s' : threshold.poor}${threshold.unit} kém</span>
        </div>
      </div>
    `;
  }).join('');
}

function toggleLhDevice(device) {
  if (!window._lhData) return;
  $('#lh-mobile-btn').classList.toggle('active', device === 'mobile');
  $('#lh-desktop-btn').classList.toggle('active', device === 'desktop');
  $('#lh-scores-grid').innerHTML = renderLhScoreCards(window._lhData.mobile, window._lhData.desktop, device);
}

function toggleCwvDevice(device) {
  if (!window._cwvData) return;
  $('#cwv-mobile-btn').classList.toggle('active', device === 'mobile');
  $('#cwv-desktop-btn').classList.toggle('active', device === 'desktop');
  $('#cwv-grid').innerHTML = renderCwvCards(window._cwvData[device]);
}

// ==================== Criteria ====================
function renderCriteria(criteria) {
  const list = $('#criteria-list');
  list.innerHTML = '';

  // Sort: fail first, then warn, then pass
  const order = { fail: 0, warn: 1, pass: 2 };
  const sorted = Object.entries(criteria).sort((a, b) => order[a[1].status] - order[b[1].status]);

  sorted.forEach(([key, data], idx) => {
    const item = document.createElement('div');
    item.className = 'criteria-item';
    item.style.animation = `fadeInUp 0.4s ease ${idx * 0.05}s both`;

    const statusText = { pass: 'ĐẠT', warn: 'CẢNH BÁO', fail: 'KHÔNG ĐẠT' };

    let issuesHTML = '';
    if (data.issues && data.issues.length > 0) {
      issuesHTML = `
        <div class="criteria-issues">
          ${data.issues.map(issue => `<div class="criteria-issue">${escapeHtml(issue)}</div>`).join('')}
        </div>
      `;
    }

    item.innerHTML = `
      <div class="criteria-icon">${data.icon}</div>
      <div class="criteria-content">
        <div class="criteria-header">
          <span class="criteria-name">${data.name}</span>
          <span class="criteria-score-badge ${data.status}">
            ${statusText[data.status]} · ${data.score}/100
          </span>
        </div>
        <div class="criteria-details">${escapeHtml(data.details)}</div>
        <div class="criteria-bar-track">
          <div class="criteria-bar-fill ${data.status}" style="width: ${data.score}%;"></div>
        </div>
        ${issuesHTML}
      </div>
    `;

    list.appendChild(item);
  });
}

// ==================== Recommendations ====================
function renderRecommendations(recommendations, data) {
  const list = $('#recommendations-list');
  list.innerHTML = '';

  // Add Lighthouse opportunities to recommendations if available
  const allRecs = [...(recommendations || [])];

  if (allRecs.length === 0) {
    list.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
        <div style="font-size: 3rem; margin-bottom: 1rem;">🎉</div>
        <h3 style="margin-bottom: 0.5rem;">Tuyệt vời!</h3>
        <p>Website của bạn không có vấn đề responsive nào cần sửa.</p>
      </div>
    `;
    return;
  }

  const priorityLabels = { high: 'Ưu tiên cao', medium: 'Ưu tiên trung bình', low: 'Ưu tiên thấp' };

  allRecs.forEach((rec, idx) => {
    const card = document.createElement('div');
    card.className = `recommendation-card priority-${rec.priority}`;
    card.style.animation = `fadeInUp 0.4s ease ${idx * 0.08}s both`;

    let codeHTML = '';
    if (rec.codeExample) {
      codeHTML = `
        <div class="recommendation-code">
          <span class="code-label">Code mẫu</span>
          <pre>${escapeHtml(rec.codeExample)}</pre>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="recommendation-header">
        <div class="recommendation-title">
          <span>${rec.icon}</span>
          <span>${rec.criterion}</span>
          <span style="color: var(--text-muted); font-weight: 400; font-size: 0.85rem;">— ${rec.currentScore}/100</span>
        </div>
        <span class="recommendation-priority">${priorityLabels[rec.priority]}</span>
      </div>
      <ul class="recommendation-actions">
        ${rec.actions.map(action => `<li>${escapeHtml(action)}</li>`).join('')}
      </ul>
      ${codeHTML}
    `;

    list.appendChild(card);
  });
}

// ==================== Tabs ====================
function switchTab(tabName) {
  // Update tab buttons
  $$('.tab').forEach(t => t.classList.remove('active'));
  $(`.tab[data-tab="${tabName}"]`).classList.add('active');

  // Update tab content
  $$('.tab-content').forEach(tc => tc.classList.remove('active'));
  $(`#tab-${tabName}`).classList.add('active');
}

// ==================== Modal ====================
function openModal(viewport) {
  const modal = $('#screenshot-modal');
  const img = $('#modal-image');
  const header = $('#modal-header');

  header.textContent = `${viewport.icon} ${viewport.name} — ${viewport.width}×${viewport.height}`;
  img.src = viewport.screenshot;
  img.alt = `Screenshot ${viewport.name}`;

  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(event) {
  if (event && event.target !== event.currentTarget) return;
  $('#screenshot-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// Close modal with Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    closeModal();
  }
});

// ==================== Helpers ====================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
