const STORAGE_KEY = 'wordMemoryApp_words';
const REVIEW_INTERVALS_MS = [
  5 * 60 * 1000,
  30 * 60 * 1000,
  12 * 60 * 60 * 1000,
  24 * 60 * 60 * 1000,
  2 * 24 * 60 * 60 * 1000,
  4 * 24 * 60 * 60 * 1000,
  7 * 24 * 60 * 60 * 1000,
  15 * 24 * 60 * 60 * 1000,
  30 * 24 * 60 * 60 * 1000,
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

function addDays(dateString, days) {
  const [year, month, day] = dateString.split('-').map(Number);
  const d = new Date(year, month - 1, day);
  d.setDate(d.getDate() + days);
  return formatDateToYMD(d);
}

function calculateNextReviewAtFromCreated(createdAtISO, stageIndex) {
  const createdAt = new Date(createdAtISO);
  const next = new Date(createdAt.getTime() + REVIEW_INTERVALS_MS[stageIndex]);
  return next.toISOString();
}

function calculateFiveMinutesFromNowISO() {
  const next = new Date(Date.now() + REVIEW_INTERVALS_MS[0]);
  return next.toISOString();
}

function normalizeWord(word) {
  const safeWord = { ...word };
  const createdDate = safeWord.createdDate || getTodayDateString();
  const createdAt = safeWord.createdAt || new Date(`${createdDate}T00:00:00`).toISOString();
  const reviewStage = Number.isInteger(safeWord.reviewStage) ? safeWord.reviewStage : 0;

  let nextReviewAt = safeWord.nextReviewAt;

  if (!nextReviewAt && safeWord.nextReviewDate) {
    nextReviewAt = new Date(`${safeWord.nextReviewDate}T00:00:00`).toISOString();
  }

  if (!nextReviewAt) {
    nextReviewAt = calculateNextReviewAtFromCreated(createdAt, Math.min(reviewStage, REVIEW_INTERVALS_MS.length - 1));
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
    reviewHistory: Array.isArray(safeWord.reviewHistory) ? safeWord.reviewHistory : [],
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
    content += '<ol>';
    selectedWords.forEach((word) => {
      content += `<li>${word.text}${word.meaning ? ` - ${word.meaning}` : ''}</li>`;
    });
    content += '</ol>';
  }

  content += '</div>';
  return content;
}

function renderDatePage() {
  const now = new Date();
  pageDate.innerHTML = `
    <div class="page-content">
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
  return words.filter((word) => word.status !== 'mastered' && new Date(word.nextReviewAt).getTime() <= nowMs);
}

function renderReviewWords() {
  const reviewWords = getWordsForReviewToday();
  if (reviewWords.length === 0) {
    return '<div class="review-empty"><p class="empty-text">No words to review today.</p></div>';
  }

  return reviewWords
    .map(
      (word) => `
      <div class="review-card" data-id="${word.id}">
        <div><strong>${word.text}</strong></div>
        ${word.meaning ? `<div>${word.meaning}</div>` : ''}
        <div>added date: ${word.createdDate}</div>
        <div>current review stage: ${word.reviewStage + 1}</div>
        <div class="review-buttons">
          <button class="review-btn remember-btn" data-id="${word.id}">I remember</button>
          <button class="review-btn forgot-btn" data-id="${word.id}">I forgot</button>
        </div>
      </div>
    `,
    )
    .join('');
}

function handleReviewAction(wordId, remembered) {
  const nowIso = getNowISO();
  const idx = words.findIndex((word) => word.id === wordId);
  if (idx === -1) return;

  const current = words[idx];
  const updated = { ...current };

  updated.reviewHistory = [
    ...updated.reviewHistory,
    { datetime: nowIso, result: remembered ? 'remembered' : 'forgot' },
  ];

  if (remembered) {
    const nextStage = updated.reviewStage + 1;
    if (nextStage >= REVIEW_INTERVALS_MS.length) {
      updated.reviewStage = REVIEW_INTERVALS_MS.length;
      updated.status = 'mastered';
      updated.nextReviewAt = '';
    } else {
      updated.reviewStage = nextStage;
      updated.nextReviewAt = calculateNextReviewAtFromCreated(updated.createdAt, nextStage);
      updated.status = 'learning';
    }
  } else {
    updated.nextReviewAt = calculateFiveMinutesFromNowISO();
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
}

initApp();
