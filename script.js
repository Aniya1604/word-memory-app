const STORAGE_KEY = 'wordMemoryApp_words';
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REVIEW_STAGES = [
  { key: '1h', label: '1 hour', offsetMs: HOUR_MS },
  { key: '12h', label: '12 hours', offsetMs: 12 * HOUR_MS },
  { key: '1d', label: '1 day', offsetMs: DAY_MS },
  { key: '2d', label: '2 days', offsetMs: 2 * DAY_MS },
  { key: '4d', label: '4 days', offsetMs: 4 * DAY_MS },
  { key: '7d', label: '7 days', offsetMs: 7 * DAY_MS },
  { key: '15d', label: '15 days', offsetMs: 15 * DAY_MS },
  { key: '30d', label: '30 days', offsetMs: 30 * DAY_MS },
];
const MONTH_LABELS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

let words = loadWordsFromStorage();
let activeTab = 'date';
let currentMonthDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let selectedDate = null;
let hasShownReviewToast = false;
let hasBoundFirstInteractionForToast = false;

const pageDate = document.getElementById('page-date');
const pageRemember = document.getElementById('page-remember');
const pageReview = document.getElementById('page-review');
const navTabs = Array.from(document.querySelectorAll('.nav-tab'));

function getTodayDateString() {
  return formatDateToYMD(new Date());
}

function getNowISO() {
  return new Date().toISOString();
}

function formatDateToYMD(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function loadWordsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const data = Array.isArray(parsed) ? parsed : [];
    return data.map(normalizeWord);
  } catch (error) {
    return [];
  }
}

function saveWordsToStorage(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function calculateNextReviewAtFromCreated(createdAtISO, stageIndex) {
  const createdAt = new Date(createdAtISO);
  const stage = REVIEW_STAGES[stageIndex] || REVIEW_STAGES[REVIEW_STAGES.length - 1];
  const next = new Date(createdAt.getTime() + stage.offsetMs);
  return next.toISOString();
}

function calculateOneHourFromNowISO() {
  const next = new Date(Date.now() + HOUR_MS);
  return next.toISOString();
}

function getCompletedReviewStageKeys(word) {
  const completed = new Set();
  const legacyStageCount = Number.isInteger(word.reviewStage)
    ? Math.min(Math.max(word.reviewStage, 0), REVIEW_STAGES.length)
    : 0;

  for (let index = 0; index < legacyStageCount; index += 1) {
    completed.add(REVIEW_STAGES[index].key);
  }

  (word.reviewHistory || []).forEach((record) => {
    if (Array.isArray(record.completedStages)) {
      record.completedStages.forEach((stageKey) => completed.add(stageKey));
      return;
    }

    if (Number.isInteger(record.completedStage)) {
      const stage = REVIEW_STAGES[record.completedStage];
      if (stage) completed.add(stage.key);
    }
  });
  return completed;
}

function getDueUncompletedReviewStages(word, nowMs = Date.now()) {
  const createdAtMs = new Date(word.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return [];

  const completed = getCompletedReviewStageKeys(word);
  return REVIEW_STAGES.filter((stage) => (
    createdAtMs + stage.offsetMs <= nowMs && !completed.has(stage.key)
  ));
}

function getNextFutureReviewStage(word, nowMs = Date.now()) {
  const createdAtMs = new Date(word.createdAt).getTime();
  if (!Number.isFinite(createdAtMs)) return null;

  const completed = getCompletedReviewStageKeys(word);
  return REVIEW_STAGES.find((stage) => (
    createdAtMs + stage.offsetMs > nowMs && !completed.has(stage.key)
  )) || null;
}

function getNextFutureReviewAt(word, nowMs = Date.now()) {
  const createdAtMs = new Date(word.createdAt).getTime();
  const nextStage = getNextFutureReviewStage(word, nowMs);
  if (!nextStage || !Number.isFinite(createdAtMs)) return '';
  return new Date(createdAtMs + nextStage.offsetMs).toISOString();
}

function getReviewStageIndexFromHistory(word) {
  const completed = getCompletedReviewStageKeys(word);
  const firstUncompletedIndex = REVIEW_STAGES.findIndex((stage) => !completed.has(stage.key));
  return firstUncompletedIndex === -1 ? REVIEW_STAGES.length : firstUncompletedIndex;
}

function getReviewInfo(word, nowMs = Date.now()) {
  const retryDue = (
    word.status !== 'mastered'
    && word.nextReviewAt
    && word.reviewRetry
    && new Date(word.nextReviewAt).getTime() <= nowMs
  );
  const dueStages = getDueUncompletedReviewStages(word, nowMs);

  return {
    dueStages,
    isDue: word.status !== 'mastered' && (retryDue || dueStages.length > 0),
    nextFutureStage: getNextFutureReviewStage(word, nowMs),
    retryDue,
  };
}

function normalizeWord(word) {
  const safeWord = { ...word };
  const createdDate = safeWord.createdDate || getTodayDateString();
  const createdAt = safeWord.createdAt || new Date(`${createdDate}T00:00:00`).toISOString();
  const reviewHistory = Array.isArray(safeWord.reviewHistory) ? safeWord.reviewHistory : [];
  const normalizedBase = {
    ...safeWord,
    createdAt,
    reviewHistory,
  };
  const reviewStage = getReviewStageIndexFromHistory(normalizedBase);

  let nextReviewAt = safeWord.nextReviewAt;

  if (!nextReviewAt && safeWord.nextReviewDate) {
    nextReviewAt = new Date(`${safeWord.nextReviewDate}T00:00:00`).toISOString();
  }

  if (!nextReviewAt) {
    nextReviewAt = getNextFutureReviewAt(normalizedBase) || '';
  }

  return {
    id: safeWord.id || `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    text: safeWord.text || '',
    meaning: safeWord.meaning || '',
    createdDate,
    createdAt,
    reviewStage,
    nextReviewAt,
    status: safeWord.status || 'learning',
    reviewRetry: Boolean(safeWord.reviewRetry),
    reviewHistory,
  };
}

function getDatesWithSavedWords() {
  const dateSet = new Set();
  words.forEach((word) => {
    if (word.createdDate) dateSet.add(word.createdDate);
  });
  return dateSet;
}

function getMonthBoundsRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  start.setMonth(start.getMonth() - 11);
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end };
}

function canNavigateMonth(targetMonthDate) {
  const { start, end } = getMonthBoundsRange();
  return targetMonthDate >= start && targetMonthDate <= end;
}

function renderCalendar(container) {
  const year = currentMonthDate.getFullYear();
  const month = currentMonthDate.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  const startWeekday = firstDay.getDay();
  const datesWithWords = getDatesWithSavedWords();

  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const { start, end } = getMonthBoundsRange();
  const prevMonth = new Date(year, month - 1, 1);
  const nextMonth = new Date(year, month + 1, 1);

  let html = `
    <div class="month-controls">
      <button class="control-btn" id="prev-month" ${prevMonth < start ? 'disabled' : ''}>Previous</button>
      <div class="month-label">${MONTH_LABELS[month]} ${year}</div>
      <button class="control-btn" id="next-month" ${nextMonth > end ? 'disabled' : ''}>Next</button>
    </div>
    <div class="calendar-grid">
      ${weekdays.map((w) => `<div class="weekday">${w}</div>`).join('')}
  `;

  for (let i = 0; i < startWeekday; i += 1) {
    html += '<div class="day-cell"><button class="day-btn" disabled></button></div>';
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const dayDate = formatDateToYMD(new Date(year, month, day));
    const hasWords = datesWithWords.has(dayDate);
    html += `
      <div class="day-cell">
        <button class="day-btn ${hasWords ? 'has-words' : ''}" data-date="${dayDate}">${day}</button>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;

  const prevBtn = container.querySelector('#prev-month');
  const nextBtn = container.querySelector('#next-month');

  prevBtn?.addEventListener('click', () => {
    const target = new Date(year, month - 1, 1);
    if (canNavigateMonth(target)) {
      currentMonthDate = target;
      renderDatePage();
    }
  });

  nextBtn?.addEventListener('click', () => {
    const target = new Date(year, month + 1, 1);
    if (canNavigateMonth(target)) {
      currentMonthDate = target;
      renderDatePage();
    }
  });

  container.querySelectorAll('.day-btn[data-date]').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDate = btn.dataset.date;
      renderDatePage();
    });
  });
}

function renderDateDetail() {
  if (!selectedDate) return '';

  const selectedWords = words.filter((word) => word.createdDate === selectedDate);

  let content = `
    <div class="detail-box">
      <h2 class="section-title">date</h2>
      <div>${selectedDate}</div>
      <h3 class="section-title">Words</h3>
  `;

  if (selectedWords.length === 0) {
    content += '<p class="empty-text">Sorry, you didn\'t save any words on that day.</p>';
  } else {
    content += '<ol class="today-word-list">';
    selectedWords.forEach((word, index) => {
      content += `
        <li class="today-word-item">
          <span class="today-word-main">
            <span class="today-word-number">${index + 1}.</span>
            <span class="today-word-text">${word.text}${word.meaning ? ` - ${word.meaning}` : ''}</span>
          </span>
          <button class="delete-word-btn" data-id="${word.id}" aria-label="Delete word">&times;</button>
        </li>
      `;
    });
    content += '</ol>';
  }

  content += '</div>';
  return content;
}

function renderDatePage() {
  const now = new Date();
  pageDate.innerHTML = `
    <div class="page-content date-page-content">
      <div class="date-content">
        <h1 class="page-title">date</h1>
        <div class="year-text">${now.getFullYear()}</div>
        <div id="calendar-wrap"></div>
        ${renderDateDetail()}
      </div>
    </div>
  `;

  const calendarWrap = document.getElementById('calendar-wrap');
  renderCalendar(calendarWrap);

  pageDate.querySelectorAll('.delete-word-btn').forEach((button) => {
    button.addEventListener('click', () => {
      deleteWord(button.dataset.id);
    });
  });
}

function renderTodaysWords() {
  const today = getTodayDateString();
  const todaysWords = words.filter((word) => word.createdDate === today);

  if (todaysWords.length === 0) {
    return '<p class="empty-text">No words added today.</p>';
  }

  let html = '<ol class="today-word-list">';
  todaysWords.forEach((word, index) => {
    html += `
      <li class="today-word-item">
        <span class="today-word-main">
          <span class="today-word-number">${index + 1}.</span>
          <span class="today-word-text">${word.text}${word.meaning ? ` - ${word.meaning}` : ''}</span>
        </span>
        <button class="delete-word-btn" data-id="${word.id}" aria-label="Delete word">&times;</button>
      </li>
    `;
  });
  html += '</ol>';
  return html;
}

function deleteWord(wordId) {
  const storedWords = loadWordsFromStorage();
  const nextWords = storedWords.filter((word) => word.id !== wordId);
  words = nextWords;
  saveWordsToStorage(nextWords);

  if (activeTab === 'remember') renderRememberPage();
  if (activeTab === 'date') renderDatePage();
  if (activeTab === 'review') renderReviewPage();
}

function renderRememberPage() {
  pageRemember.innerHTML = `
    <div class="page-content remember-page-content">
      <div class="remember-content">
        <h1 class="page-title">remember words</h1>
        <div class="remember-layout">
          <div class="remember-left">
            <p class="remember-text">Type the words that you want to remember</p>
            <input id="word-input" class="input" type="text" placeholder="Word" />
            <textarea id="meaning-input" class="textarea" placeholder="Meaning / note (optional)"></textarea>
            <button id="add-word-btn" class="add-btn">Add Word</button>
          </div>
          <div class="remember-right">
            <h2 class="list-title">today</h2>
            <h3 class="section-title">words</h3>
            <div id="today-words-list">${renderTodaysWords()}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  const addBtn = document.getElementById('add-word-btn');
  addBtn?.addEventListener('click', () => {
    const wordInput = document.getElementById('word-input');
    const meaningInput = document.getElementById('meaning-input');
    const text = wordInput.value.trim();
    const meaning = meaningInput.value.trim();

    if (!text) return;

    const createdDate = getTodayDateString();
    const createdAt = getNowISO();

    const newWord = {
      id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      text,
      meaning,
      createdDate,
      createdAt,
      reviewStage: 0,
      nextReviewAt: calculateNextReviewAtFromCreated(createdAt, 0),
      status: 'learning',
      reviewRetry: false,
      reviewHistory: [],
    };

    words.push(newWord);
    saveWordsToStorage(words);

    wordInput.value = '';
    meaningInput.value = '';

    renderRememberPage();
    if (activeTab === 'date') renderDatePage();
  });

  pageRemember.querySelectorAll('.delete-word-btn').forEach((button) => {
    button.addEventListener('click', () => {
      deleteWord(button.dataset.id);
    });
  });
}

function getWordsForReviewToday() {
  const nowMs = Date.now();
  return words.filter((word) => getReviewInfo(word, nowMs).isDue);
}

function getDueReviewWords() {
  return getWordsForReviewToday();
}

function hideReviewToast() {
  const toast = document.getElementById('review-toast');
  if (toast) toast.remove();
}

function showReviewToast() {
  if (hasShownReviewToast) return;
  hasShownReviewToast = true;

  hideReviewToast();

  const dueWords = getDueReviewWords();
  const dueCount = dueWords.length;

  const toast = document.createElement('div');
  toast.id = 'review-toast';
  toast.className = 'review-toast';
  toast.title = 'Go to review';
  toast.setAttribute('role', 'button');
  toast.setAttribute('tabindex', '0');
  toast.setAttribute('aria-label', 'Open review page');
  toast.innerHTML = dueCount > 0
    ? `
      <div class="review-toast-title">Hello!</div>
      <div class="review-toast-body">You have ${dueCount} words to review.</div>
      <div class="review-toast-hint">Click here to start.</div>
    `
    : `
      <div class="review-toast-title">Hello!</div>
      <div class="review-toast-body">You have no words to review right now.</div>
      <div class="review-toast-hint">Click here to add words.</div>
    `;

  const openTargetPage = () => {
    if (dueCount > 0) {
      switchTab('review');
    } else {
      switchTab('remember');
    }
    hideReviewToast();
  };

  toast.addEventListener('click', openTargetPage);
  toast.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openTargetPage();
    }
  });

  document.body.appendChild(toast);
}

function initReviewToast() {
  setTimeout(() => {
    showReviewToast();
  }, 700);

  if (hasBoundFirstInteractionForToast) return;
  hasBoundFirstInteractionForToast = true;

  const showOnFirstInteraction = () => {
    showReviewToast();
  };

  document.addEventListener('click', showOnFirstInteraction, { once: true });
}

function renderReviewWords() {
  const reviewWords = getWordsForReviewToday();
  if (reviewWords.length === 0) {
    return '<div class="review-empty"><p class="empty-text">No words to review today.</p></div>';
  }

  return reviewWords
    .map((word) => {
      const reviewInfo = getReviewInfo(word);
      const stageLabel = reviewInfo.retryDue
        ? 'forgot retry'
        : reviewInfo.dueStages.map((stage) => stage.label).join(', ');

      return `
      <div class="review-card" data-id="${word.id}">
        <div><strong>${word.text}</strong></div>
        ${word.meaning ? `<div>${word.meaning}</div>` : ''}
        <div>added date: ${word.createdDate}</div>
        <div>current review stage: ${stageLabel}</div>
        <div class="review-buttons">
          <button class="review-btn remember-btn" data-id="${word.id}">I remember</button>
          <button class="review-btn forgot-btn" data-id="${word.id}">I forgot</button>
        </div>
      </div>
    `;
    })
    .join('');
}

function handleReviewAction(wordId, remembered) {
  const nowIso = getNowISO();
  const idx = words.findIndex((word) => word.id === wordId);
  if (idx === -1) return;

  const current = words[idx];
  const updated = { ...current };
  const dueStages = getDueUncompletedReviewStages(updated);
  const completedStages = dueStages.map((stage) => stage.key);

  updated.reviewHistory = [
    ...updated.reviewHistory,
    {
      reviewedAt: nowIso,
      datetime: nowIso,
      result: remembered ? 'remembered' : 'forgot',
      completedStages,
    },
  ];
  updated.reviewRetry = false;

  if (remembered) {
    const nextReviewAt = getNextFutureReviewAt(updated);
    updated.reviewStage = getReviewStageIndexFromHistory(updated);

    if (!nextReviewAt) {
      updated.status = 'mastered';
      updated.nextReviewAt = '';
    } else {
      updated.nextReviewAt = nextReviewAt;
      updated.status = 'learning';
    }
  } else {
    updated.reviewStage = getReviewStageIndexFromHistory(updated);
    updated.nextReviewAt = calculateOneHourFromNowISO();
    updated.reviewRetry = true;
    updated.status = 'learning';
  }

  words[idx] = updated;
  saveWordsToStorage(words);
  renderReviewPage();
}

function renderReviewPage() {
  const reviewWords = getWordsForReviewToday();

  pageReview.innerHTML = `
    <div class="page-content review-page-content">
      <div class="review-content">
        <h1 class="page-title">review</h1>
        <h2 class="section-title">Today's Review</h2>
        <p>Words to review today: ${reviewWords.length}</p>
        <div id="review-list">${renderReviewWords()}</div>
      </div>
    </div>
  `;

  pageReview.querySelectorAll('.remember-btn').forEach((button) => {
    button.addEventListener('click', () => {
      handleReviewAction(button.dataset.id, true);
    });
  });

  pageReview.querySelectorAll('.forgot-btn').forEach((button) => {
    button.addEventListener('click', () => {
      handleReviewAction(button.dataset.id, false);
    });
  });
}

function switchTab(tabName) {
  activeTab = tabName;

  pageDate.classList.toggle('active', tabName === 'date');
  pageRemember.classList.toggle('active', tabName === 'remember');
  pageReview.classList.toggle('active', tabName === 'review');

  navTabs.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  if (tabName === 'date') renderDatePage();
  if (tabName === 'remember') renderRememberPage();
  if (tabName === 'review') renderReviewPage();
}

function initNav() {
  navTabs.forEach((btn) => {
    btn.addEventListener('click', () => {
      switchTab(btn.dataset.tab);
    });
  });
}

function initApp() {
  initNav();
  switchTab('date');
  initReviewToast();
}

initApp();
