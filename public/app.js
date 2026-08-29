/**
 * app.js — Client-side logic for Responsive Audit Tool
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
  // Reset loading steps
  for (let i = 1; i <= 5; i++) {
    const step = $(`#step-${i}`);
    step.classList.remove('active', 'done');
    if (i === 1) step.classList.add('active');
  }
  $('#progress-bar').style.width = '0%';
  setTimeout(() => $('#url-input')?.focus(), 300);
}

// ==================== Loading Animation ====================
function animateLoadingSteps() {
  let currentStep = 1;
  const totalSteps = 5;

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
  }, 4000);
}

function completeLoading() {
  clearInterval(loadingInterval);
  for (let i = 1; i <= 5; i++) {
    const step = $(`#step-${i}`);
    step.classList.remove('active');
    step.classList.add('done');
  }
  $('#progress-bar').style.width = '100%';
}

// ==================== Render Results ====================
function renderResults(data) {
  // Header
  $('#audit-url').textContent = data.url;
  $('#audit-duration').textContent = `⏱ ${data.auditDuration}`;

  // Score gauge
  animateScore(data.overallScore);

  // Grade
  $('#grade-emoji').textContent = data.grade.emoji;
  $('#grade-label').textContent = data.grade.label;
  $('#grade-badge').style.color = data.grade.color;

  // Description
  const descriptions = {
    'Excellent': 'Website của bạn có responsive design xuất sắc! Hiển thị tốt trên mọi thiết bị.',
    'Good': 'Responsive design tốt, nhưng vẫn có một số điểm cần cải thiện để đạt chuẩn hiện đại.',
    'Needs Work': 'Website có vấn đề responsive cần được sửa chữa. Trải nghiệm trên mobile/tablet chưa tối ưu.',
    'Poor': 'Website cần refactor responsive design nghiêm túc. Người dùng mobile sẽ gặp nhiều khó khăn.',
  };
  $('#score-description').textContent = descriptions[data.grade.label] || '';

  // Quick stats
  const criteria = Object.values(data.criteria);
  $('#stat-pass').textContent = criteria.filter(c => c.status === 'pass').length;
  $('#stat-warn').textContent = criteria.filter(c => c.status === 'warn').length;
  $('#stat-fail').textContent = criteria.filter(c => c.status === 'fail').length;
  $('#stat-viewports').textContent = data.viewports.length;

  // Render tabs
  renderScreenshots(data.viewports);
  renderCriteria(data.criteria);
  renderRecommendations(data.recommendations);

  // Default tab
  switchTab('screenshots');
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
function renderRecommendations(recommendations) {
  const list = $('#recommendations-list');
  list.innerHTML = '';

  if (recommendations.length === 0) {
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

  recommendations.forEach((rec, idx) => {
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
