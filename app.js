/**
 * 핑키 플랜 (Pinky Plan) - 메인 스케줄러 애플리케이션 로직
 */

(function () {
  'use strict';

  // --- 1. 앱 상태 관리 ---
  const state = {
    schedules: [],
    selectedDate: getTodayString(),
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth(), // 0 = 1월
    activeTab: 'calendar',
    editingId: null
  };

  // 한글 카테고리 정보
  const CATEGORIES = {
    personal: { name: '개인·일상', icon: '🌸', className: 'cat-personal' },
    work: { name: '공부·업무', icon: '💼', className: 'cat-work' },
    anniversary: { name: '기념일', icon: '🎂', className: 'cat-anniversary' },
    routine: { name: '루틴·건강', icon: '🌿', className: 'cat-routine' },
    study: { name: '스터디·독서', icon: '📚', className: 'cat-study' }
  };

  // --- 2. 로컬 & 클라우드 스토리지 어댑터 ---
  const Storage = {
    isChromeStorage: function () {
      return (
        typeof chrome !== 'undefined' &&
        chrome.storage &&
        chrome.storage.sync
      );
    },

    loadLocal: function (callback) {
      if (this.isChromeStorage()) {
        chrome.storage.sync.get(['pinky_schedules'], (result) => {
          let list = result.pinky_schedules || [];
          if (list.length === 0) {
            list = getInitialDefaultSchedules();
            this.saveLocal(list);
          }
          callback(list);
        });
      } else {
        const localData = localStorage.getItem('pinky_schedules');
        if (localData) {
          try {
            callback(JSON.parse(localData));
          } catch (e) {
            callback(getInitialDefaultSchedules());
          }
        } else {
          const defaults = getInitialDefaultSchedules();
          this.saveLocal(defaults);
          callback(defaults);
        }
      }
    },

    saveLocal: function (list, callback) {
      if (this.isChromeStorage()) {
        chrome.storage.sync.set({ pinky_schedules: list }, () => {
          this.notifyChromeService(list);
          if (callback) callback();
        });
      } else {
        localStorage.setItem('pinky_schedules', JSON.stringify(list));
        if (callback) callback();
      }
    },

    // 로컬 저장 후 로그인되어 있다면 클라우드로 자동 저장
    save: function (list, callback) {
      this.saveLocal(list, callback);
      if (typeof CloudSync !== 'undefined' && CloudSync.hasActiveSession()) {
        CloudSync.pushToCloud(list);
      }
    },

    notifyChromeService: function (list) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'updateBadge', schedules: list });
      }
    }
  };

  // 초기 샘플 일정 (친절한 한글 안내)
  function getInitialDefaultSchedules() {
    const today = getTodayString();
    const tomorrow = getDateOffsetString(1);
    const dayAfter = getDateOffsetString(3);

    return [
      {
        id: 'init-1',
        title: '🌸 핑키 플랜 스케줄러 사용법 둘러보기',
        date: today,
        time: '09:00',
        allDay: false,
        category: 'personal',
        completed: true,
        memo: '사랑스러운 파스텔 핑크 스케줄러에 오신 것을 환영합니다!',
        important: true,
        notify: false
      },
      {
        id: 'init-2',
        title: '☕ 달콤한 딸기 라떼 마시며 휴식하기',
        date: today,
        time: '15:00',
        allDay: false,
        category: 'routine',
        completed: false,
        memo: '오늘 할 일 체크하고 오후 재충전 시간 가지기',
        important: false,
        notify: true
      },
      {
        id: 'init-3',
        title: '☁️ 크롬 계정 동기화로 다른 컴퓨터와 연결하기',
        date: today,
        time: '18:00',
        allDay: false,
        category: 'work',
        completed: false,
        memo: '우측 상단 [계정 연동]을 눌러 이메일과 비밀번호를 등록하세요.',
        important: true,
        notify: false
      },
      {
        id: 'init-4',
        title: '🎂 소중한 친구 생일 파티 준비',
        date: tomorrow,
        time: '',
        allDay: true,
        category: 'anniversary',
        completed: false,
        memo: '축하 케이크 예약하고 예쁜 손편지 쓰기',
        important: true,
        notify: false
      },
      {
        id: 'init-5',
        title: '✈️ 주말 힐링 여행 디데이',
        date: dayAfter,
        time: '10:00',
        allDay: false,
        category: 'personal',
        completed: false,
        memo: '가방 챙기기 & 카메라 배터리 충전하기',
        important: true,
        notify: true
      }
    ];
  }

  // --- 3. 날짜 관련 도우미 함수 ---
  function getTodayString() {
    return formatDate(new Date());
  }

  function getDateOffsetString(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return formatDate(d);
  }

  function formatDate(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function calculateDDay(dateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const diffMs = target.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return { text: 'D-Day (오늘!)', countText: 'D-Day', diff: 0, isToday: true };
    if (diffDays > 0) return { text: `D-${diffDays} (${diffDays}일 남음)`, countText: `D-${diffDays}`, diff: diffDays, isFuture: true };
    return { text: `D+${Math.abs(diffDays)} (${Math.abs(diffDays)}일 지남)`, countText: `D+${Math.abs(diffDays)}`, diff: diffDays, isPast: true };
  }

  // --- 4. 화면 렌더링 ---
  function renderAll() {
    renderTodayBanner();
    renderCalendar();
    renderScheduleList();
    renderDDayView();
    renderAccountUI();
  }

  function renderAccountUI() {
    const chipText = document.getElementById('accountChipText');
    const statusDot = document.getElementById('syncStatusDot');
    const chipBtn = document.getElementById('btnAccountSync');

    if (!chipText || typeof CloudSync === 'undefined') return;

    const user = CloudSync.getCurrentUser();
    const hasSession = CloudSync.hasActiveSession();

    if (user && hasSession) {
      chipText.textContent = user;
      if (chipBtn) chipBtn.classList.add('logged-in');
      if (statusDot) {
        statusDot.className = 'sync-status-dot';
      }
    } else {
      chipText.textContent = '☁️ 계정 연동 (두 PC 동기화)';
      if (chipBtn) chipBtn.classList.remove('logged-in');
      if (statusDot) {
        statusDot.className = 'sync-status-dot';
      }
    }
  }

  function renderTodayBanner() {
    const todayStr = getTodayString();
    const todayList = state.schedules.filter((s) => s.date === todayStr);
    const total = todayList.length;
    const completed = todayList.filter((s) => s.completed).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    const bannerDateEl = document.getElementById('todayBannerDate');
    const bannerStatusEl = document.getElementById('todayBannerStatus');
    const progressFillEl = document.getElementById('bannerProgressFill');
    const percentEl = document.getElementById('bannerPercent');

    const todayDateObj = new Date();
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    const dateFormatted = `${todayDateObj.getFullYear()}년 ${todayDateObj.getMonth() + 1}월 ${todayDateObj.getDate()}일 (${dayNames[todayDateObj.getDay()]}요일)`;

    if (bannerDateEl) bannerDateEl.textContent = `📅 ${dateFormatted}`;
    if (bannerStatusEl) {
      if (total === 0) {
        bannerStatusEl.textContent = '오늘 예정된 일정이 없어요 🌸';
      } else if (completed === total) {
        bannerStatusEl.textContent = '오늘의 모든 할 일을 완료했어요! 축하합니다 🎉';
      } else {
        bannerStatusEl.textContent = `오늘 할 일 ${total}개 중 ${completed}개 완료! (힘내세요 💕)`;
      }
    }

    if (progressFillEl) progressFillEl.style.width = `${percent}%`;
    if (percentEl) percentEl.textContent = `${percent}% 달성`;
  }

  function renderCalendar() {
    const monthTitleEl = document.getElementById('calMonthTitle');
    const gridEl = document.getElementById('calDaysGrid');
    if (!gridEl) return;

    const year = state.currentYear;
    const month = state.currentMonth;

    if (monthTitleEl) {
      monthTitleEl.textContent = `${year}년 ${month + 1}월`;
    }

    gridEl.innerHTML = '';

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const prevMonthLastDay = new Date(year, month, 0);
    const startDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();
    const todayStr = getTodayString();

    // 1. 이전 달 날짜 셀
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const prevDateNum = prevMonthLastDay.getDate() - i;
      const cell = document.createElement('div');
      cell.className = 'cal-cell other-month';
      cell.textContent = prevDateNum;
      gridEl.appendChild(cell);
    }

    // 2. 이번 달 날짜 셀
    for (let d = 1; d <= daysInMonth; d++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell';
      cell.textContent = d;

      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = new Date(year, month, d).getDay();

      if (dayOfWeek === 0) cell.classList.add('sunday');
      if (dayOfWeek === 6) cell.classList.add('saturday');

      if (dateStr === todayStr) {
        cell.classList.add('today');
      }

      if (dateStr === state.selectedDate) {
        cell.classList.add('selected');
      }

      const daySchedules = state.schedules.filter((s) => s.date === dateStr);
      if (daySchedules.length > 0) {
        const dotsWrap = document.createElement('div');
        dotsWrap.className = 'cal-dots';
        const showCount = Math.min(daySchedules.length, 3);
        for (let k = 0; k < showCount; k++) {
          const dot = document.createElement('span');
          dot.className = 'cal-dot';
          dotsWrap.appendChild(dot);
        }
        cell.appendChild(dotsWrap);
      }

      cell.addEventListener('click', () => {
        state.selectedDate = dateStr;
        renderCalendar();
        renderScheduleList();
      });

      gridEl.appendChild(cell);
    }

    // 3. 다음 달 빈 칸
    const totalCells = startDayOfWeek + daysInMonth;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let n = 1; n <= remainingCells; n++) {
      const cell = document.createElement('div');
      cell.className = 'cal-cell other-month';
      cell.textContent = n;
      gridEl.appendChild(cell);
    }
  }

  function renderScheduleList() {
    const listEl = document.getElementById('scheduleList');
    const timelineListEl = document.getElementById('timelineList');
    const titleEl = document.getElementById('selectedDateTitle');
    const badgeEl = document.getElementById('selectedDateCount');

    // 1. 선택된 날짜의 일정 목록
    if (listEl) {
      const daySchedules = state.schedules
        .filter((s) => s.date === state.selectedDate)
        .sort((a, b) => (a.time || '23:59').localeCompare(b.time || '23:59'));

      if (titleEl) {
        const isToday = state.selectedDate === getTodayString();
        titleEl.textContent = `${state.selectedDate} ${isToday ? '🌸 오늘 일정' : '일정 목록'}`;
      }
      if (badgeEl) badgeEl.textContent = `${daySchedules.length}건`;

      listEl.innerHTML = '';
      if (daySchedules.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">🎀</div>
            <div class="empty-text">선택한 날짜에 등록된 일정이 없습니다.<br>새 일정을 등록해보세요!</div>
          </div>
        `;
      } else {
        daySchedules.forEach((item) => {
          listEl.appendChild(createScheduleCardElement(item, false));
        });
      }
    }

    // 2. 전체 타임라인 일정 목록
    if (timelineListEl) {
      const allSorted = [...state.schedules].sort((a, b) => {
        if (a.date !== b.date) return a.date.localeCompare(b.date);
        return (a.time || '23:59').localeCompare(b.time || '23:59');
      });

      timelineListEl.innerHTML = '';
      if (allSorted.length === 0) {
        timelineListEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📅</div>
            <div class="empty-text">등록된 전체 일정이 없습니다.</div>
          </div>
        `;
      } else {
        allSorted.forEach((item) => {
          timelineListEl.appendChild(createScheduleCardElement(item, true));
        });
      }
    }
  }

  function renderDDayView() {
    const gridEl = document.getElementById('ddayGrid');
    if (!gridEl) return;

    gridEl.innerHTML = '';

    const ddayList = state.schedules
      .filter((s) => s.date)
      .map((s) => ({
        ...s,
        ddayInfo: calculateDDay(s.date)
      }))
      .sort((a, b) => {
        if (a.ddayInfo.diff >= 0 && b.ddayInfo.diff < 0) return -1;
        if (a.ddayInfo.diff < 0 && b.ddayInfo.diff >= 0) return 1;
        return a.ddayInfo.diff - b.ddayInfo.diff;
      });

    if (ddayList.length === 0) {
      gridEl.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">⏳</div>
          <div class="empty-text">표시할 디데이(D-Day) 일정이 없습니다.</div>
        </div>
      `;
      return;
    }

    ddayList.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'dday-card';
      const catInfo = CATEGORIES[item.category] || CATEGORIES.personal;

      card.innerHTML = `
        <div>
          <span class="category-tag ${catInfo.className} dday-tag">${catInfo.icon} ${catInfo.name}</span>
          <div class="dday-count">${item.ddayInfo.countText}</div>
          <div class="dday-name">${escapeHtml(item.title)}</div>
        </div>
        <div class="dday-target-date">📅 목표일: ${item.date}</div>
      `;

      card.addEventListener('click', () => {
        state.selectedDate = item.date;
        switchTab('calendar');
        renderAll();
      });

      gridEl.appendChild(card);
    });
  }

  function createScheduleCardElement(item, showDate = false) {
    const card = document.createElement('div');
    card.className = `schedule-card ${item.completed ? 'completed' : ''}`;

    const catInfo = CATEGORIES[item.category] || CATEGORIES.personal;
    const dday = calculateDDay(item.date);

    let timeText = '종일';
    if (!item.allDay && item.time) {
      timeText = item.time;
    }

    card.innerHTML = `
      <div class="chk-wrap">
        <input type="checkbox" class="chk-custom" ${item.completed ? 'checked' : ''} title="완료 체크">
      </div>
      <div class="card-content">
        <div class="card-top">
          <span class="category-tag ${catInfo.className}">${catInfo.icon} ${catInfo.name}</span>
          <span class="time-badge">⏰ ${timeText}</span>
          ${showDate ? `<span class="time-badge">📅 ${item.date}</span>` : ''}
          ${dday ? `<span class="dday-badge">${dday.text}</span>` : ''}
        </div>
        <div class="schedule-title">
          ${item.important ? '<span class="star-icon">⭐</span>' : ''}
          <span>${escapeHtml(item.title)}</span>
        </div>
        ${item.memo ? `<div class="schedule-memo">${escapeHtml(item.memo)}</div>` : ''}
      </div>
      <div class="card-actions">
        <button class="btn-card-action btn-edit" title="일정 수정">✏️ 수정</button>
        <button class="btn-card-action btn-del" title="일정 삭제">🗑️ 삭제</button>
      </div>
    `;

    const chk = card.querySelector('.chk-custom');
    chk.addEventListener('change', () => {
      item.completed = chk.checked;
      Storage.save(state.schedules, () => {
        renderAll();
        showToast(item.completed ? '일정을 완료했습니다! 💕' : '완료를 취소했습니다.');
      });
    });

    const editBtn = card.querySelector('.btn-edit');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal(item);
    });

    const delBtn = card.querySelector('.btn-del');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`'${item.title}' 일정을 삭제하시겠습니까?`)) {
        deleteSchedule(item.id);
      }
    });

    return card;
  }

  // --- 5. CRUD 액션 ---
  function handleQuickAdd() {
    const input = document.getElementById('quickInput');
    if (!input) return;
    const text = input.value.trim();
    if (!text) return;

    const newSchedule = {
      id: 'pinky-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      title: text,
      date: state.selectedDate || getTodayString(),
      time: '',
      allDay: true,
      category: 'personal',
      completed: false,
      memo: '',
      important: false,
      notify: false
    };

    state.schedules.push(newSchedule);
    input.value = '';

    Storage.save(state.schedules, () => {
      renderAll();
      showToast('새 일정이 등록되었습니다 🌸');
    });
  }

  function deleteSchedule(id) {
    state.schedules = state.schedules.filter((s) => s.id !== id);
    Storage.save(state.schedules, () => {
      renderAll();
      showToast('일정이 삭제되었습니다.');
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'clearAlarm', id: id });
      }
    });
  }

  function openModal(itemToEdit = null) {
    const modal = document.getElementById('scheduleModal');
    const modalTitle = document.getElementById('modalTitle');
    if (!modal) return;

    const titleInput = document.getElementById('modalTitleInput');
    const dateInput = document.getElementById('modalDateInput');
    const timeInput = document.getElementById('modalTimeInput');
    const allDayChk = document.getElementById('modalAllDayInput');
    const categorySelect = document.getElementById('modalCategoryInput');
    const importantChk = document.getElementById('modalImportantInput');
    const notifyChk = document.getElementById('modalNotifyInput');
    const memoInput = document.getElementById('modalMemoInput');

    if (itemToEdit) {
      state.editingId = itemToEdit.id;
      modalTitle.innerHTML = '✏️ 일정 수정하기';
      titleInput.value = itemToEdit.title || '';
      dateInput.value = itemToEdit.date || state.selectedDate;
      timeInput.value = itemToEdit.time || '';
      allDayChk.checked = !!itemToEdit.allDay;
      categorySelect.value = itemToEdit.category || 'personal';
      importantChk.checked = !!itemToEdit.important;
      notifyChk.checked = !!itemToEdit.notify;
      memoInput.value = itemToEdit.memo || '';
    } else {
      state.editingId = null;
      modalTitle.innerHTML = '🌸 새 일정 등록하기';
      titleInput.value = '';
      dateInput.value = state.selectedDate || getTodayString();
      timeInput.value = '12:00';
      allDayChk.checked = false;
      categorySelect.value = 'personal';
      importantChk.checked = false;
      notifyChk.checked = true;
      memoInput.value = '';
    }

    timeInput.disabled = allDayChk.checked;
    modal.classList.add('active');
    titleInput.focus();
  }

  function closeModal() {
    const modal = document.getElementById('scheduleModal');
    if (modal) modal.classList.remove('active');
    state.editingId = null;
  }

  function handleModalSave(e) {
    e.preventDefault();

    const titleInput = document.getElementById('modalTitleInput');
    const dateInput = document.getElementById('modalDateInput');
    const timeInput = document.getElementById('modalTimeInput');
    const allDayChk = document.getElementById('modalAllDayInput');
    const categorySelect = document.getElementById('modalCategoryInput');
    const importantChk = document.getElementById('modalImportantInput');
    const notifyChk = document.getElementById('modalNotifyInput');
    const memoInput = document.getElementById('modalMemoInput');

    const title = titleInput.value.trim();
    if (!title) {
      titleInput.focus();
      return;
    }

    const isAllDay = allDayChk.checked;
    const scheduleData = {
      title: title,
      date: dateInput.value || getTodayString(),
      time: isAllDay ? '' : timeInput.value,
      allDay: isAllDay,
      category: categorySelect.value,
      important: importantChk.checked,
      notify: notifyChk.checked,
      memo: memoInput.value.trim()
    };

    if (state.editingId) {
      const idx = state.schedules.findIndex((s) => s.id === state.editingId);
      if (idx !== -1) {
        state.schedules[idx] = {
          ...state.schedules[idx],
          ...scheduleData
        };
      }
      showToast('일정이 수정되었습니다 💕');
    } else {
      const newItem = {
        id: 'pinky-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
        completed: false,
        ...scheduleData
      };
      state.schedules.push(newItem);
      showToast('새 일정이 등록되었습니다 🌸');

      if (newItem.notify && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ action: 'scheduleAlarm', schedule: newItem });
      }
    }

    Storage.save(state.schedules, () => {
      closeModal();
      renderAll();
    });
  }

  // --- 6. 계정 연동 및 비밀번호 보호 모달 ---
  function openAccountModal() {
    const modal = document.getElementById('accountModal');
    if (!modal) return;

    const emailInput = document.getElementById('syncEmailInput');
    const passInput = document.getElementById('syncPasswordInput');
    const inputGroup = document.getElementById('accountInputGroup');
    const passGroup = document.getElementById('accountPassGroup');
    const loggedInGroup = document.getElementById('accountLoggedInGroup');
    const loggedInEmailText = document.getElementById('loggedInEmailText');
    const logoutBtn = document.getElementById('accountLogoutBtn');
    const saveBtn = document.getElementById('accountSaveBtn');
    const customFirebaseInput = document.getElementById('customFirebaseInput');

    const currentUser = (typeof CloudSync !== 'undefined') ? CloudSync.getCurrentUser() : null;
    const hasActiveSession = (typeof CloudSync !== 'undefined') && CloudSync.hasActiveSession();

    if (customFirebaseInput && typeof CloudSync !== 'undefined') {
      customFirebaseInput.value = CloudSync.getCustomFirebaseUrl() || '';
    }

    if (hasActiveSession) {
      if (inputGroup) inputGroup.style.display = 'none';
      if (passGroup) passGroup.style.display = 'none';
      if (loggedInGroup) loggedInGroup.style.display = 'block';
      if (loggedInEmailText) loggedInEmailText.textContent = currentUser;
      if (logoutBtn) logoutBtn.style.display = 'inline-block';
      if (saveBtn) saveBtn.textContent = '설정 닫기';
    } else {
      if (inputGroup) inputGroup.style.display = 'block';
      if (passGroup) passGroup.style.display = 'block';
      if (loggedInGroup) loggedInGroup.style.display = 'none';
      if (emailInput) {
        emailInput.value = currentUser || '';
        setTimeout(() => {
          if (currentUser && passInput) passInput.focus();
          else emailInput.focus();
        }, 100);
      }
      if (passInput) passInput.value = '';
      if (logoutBtn) logoutBtn.style.display = currentUser ? 'inline-block' : 'none';
      if (saveBtn) saveBtn.textContent = '보안 동기화 시작';
    }

    modal.classList.add('active');
  }

  function closeAccountModal() {
    const modal = document.getElementById('accountModal');
    if (modal) modal.classList.remove('active');
  }

  async function handleAccountSave() {
    const emailInput = document.getElementById('syncEmailInput');
    const passInput = document.getElementById('syncPasswordInput');
    const customFirebaseInput = document.getElementById('customFirebaseInput');
    const currentUser = CloudSync.getCurrentUser();
    const hasActiveSession = CloudSync.hasActiveSession();

    if (customFirebaseInput) {
      CloudSync.setCustomFirebaseUrl(customFirebaseInput.value);
    }

    if (hasActiveSession) {
      closeAccountModal();
      showToast('설정이 완료되었습니다 ✨');
      return;
    }

    const email = (emailInput ? emailInput.value.trim() : '') || currentUser;
    const password = passInput ? passInput.value.trim() : '';

    if (!email) {
      alert('이메일 주소를 입력해주세요.');
      if (emailInput) emailInput.focus();
      return;
    }
    if (!password) {
      alert('데이터 보호를 위해 비밀번호(PIN)를 4자리 이상 입력해주세요.');
      if (passInput) passInput.focus();
      return;
    }

    try {
      showToast('🔒 암호화 확인 및 클라우드 연결 중...');
      const cloudSchedules = await CloudSync.login(email, password);

      if (cloudSchedules && cloudSchedules.length > 0) {
        state.schedules = cloudSchedules;
        Storage.saveLocal(cloudSchedules);
        showToast(`🎉 클라우드에서 ${cloudSchedules.length}개의 일정을 안전하게 복호화했습니다!`);
      } else {
        await CloudSync.pushToCloud(state.schedules);
        showToast('✨ 첫 AES-256 보안 암호화 저장이 완료되었습니다!');
      }

      closeAccountModal();
      renderAll();
    } catch (err) {
      alert(err.message || '계정 동기화 중 오류가 발생했습니다.');
    }
  }

  function handleAccountLogout() {
    if (confirm('계정 연동을 해제하시겠습니까? (현재 기기에 저장된 일정은 유지됩니다)')) {
      CloudSync.logout();
      closeAccountModal();
      renderAll();
      showToast('계정 연동이 해제되었습니다.');
    }
  }

  async function handleManualSync() {
    const refreshBtn = document.getElementById('btnManualSync');
    if (refreshBtn) refreshBtn.classList.add('spinning');

    const currentUser = CloudSync.getCurrentUser();
    if (!currentUser || !CloudSync.hasActiveSession()) {
      if (refreshBtn) refreshBtn.classList.remove('spinning');
      openAccountModal();
      return;
    }

    try {
      const cloudSchedules = await CloudSync.pullFromCloud();
      if (cloudSchedules && cloudSchedules.length > 0) {
        state.schedules = cloudSchedules;
        Storage.saveLocal(cloudSchedules);
        showToast('🔄 최신 일정이 클라우드와 동기화되었습니다!');
      } else {
        await CloudSync.pushToCloud(state.schedules);
        showToast('☁️ 현재 일정이 클라우드에 안전하게 저장되었습니다!');
      }
      renderAll();
    } catch (err) {
      showToast('동기화 실패 (인터넷 연결을 확인해주세요)');
    } finally {
      if (refreshBtn) {
        setTimeout(() => refreshBtn.classList.remove('spinning'), 500);
      }
    }
  }

  // --- 7. 유틸리티 & 탭 전환 ---
  function switchTab(tabName) {
    state.activeTab = tabName;

    document.querySelectorAll('.tab-btn').forEach((btn) => {
      if (btn.dataset.tab === tabName) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.tab-content').forEach((content) => {
      if (content.id === `tab-${tabName}`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });

    renderAll();
  }

  function showToast(msg) {
    let toast = document.getElementById('appToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'appToast';
      toast.className = 'toast';
      document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 2200);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 데이터 백업 (JSON 파일 다운로드)
  function exportData() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.schedules, null, 2));
    const dlAnchor = document.createElement('a');
    dlAnchor.setAttribute('href', dataStr);
    dlAnchor.setAttribute('download', `핑키플랜_일정백업_${getTodayString()}.json`);
    dlAnchor.click();
    showToast('일정 데이터가 파일로 안전하게 저장되었습니다 📁');
  }

  // 데이터 복원 (JSON 파일 가져오기)
  function importData() {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    fileInput.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (Array.isArray(imported)) {
            state.schedules = imported;
            Storage.save(state.schedules, () => {
              renderAll();
              showToast('파일에서 일정 복원이 완료되었습니다 ✨');
            });
          } else {
            alert('올바른 백업 파일(JSON)이 아닙니다.');
          }
        } catch (err) {
          alert('파일을 불러오는 도중 오류가 발생했습니다.');
        }
      };
      reader.readAsText(file);
    };
    fileInput.click();
  }

  function openInNewTab() {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: 'index.html' });
    } else {
      window.open('index.html', '_blank');
    }
  }

  // --- 8. 초기 이벤트 바인딩 ---
  function init() {
    // 탭 클릭
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 캘린더 월 이동
    const prevMonthBtn = document.getElementById('calPrevMonth');
    const nextMonthBtn = document.getElementById('calNextMonth');
    const todayBtn = document.getElementById('calTodayBtn');

    if (prevMonthBtn) {
      prevMonthBtn.addEventListener('click', () => {
        state.currentMonth--;
        if (state.currentMonth < 0) {
          state.currentMonth = 11;
          state.currentYear--;
        }
        renderCalendar();
      });
    }

    if (nextMonthBtn) {
      nextMonthBtn.addEventListener('click', () => {
        state.currentMonth++;
        if (state.currentMonth > 11) {
          state.currentMonth = 0;
          state.currentYear++;
        }
        renderCalendar();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        const now = new Date();
        state.currentYear = now.getFullYear();
        state.currentMonth = now.getMonth();
        state.selectedDate = getTodayString();
        renderCalendar();
        renderScheduleList();
      });
    }

    // 퀵 추가
    const quickInput = document.getElementById('quickInput');
    const quickAddBtn = document.getElementById('quickAddBtn');
    if (quickInput) {
      quickInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleQuickAdd();
        }
      });
    }
    if (quickAddBtn) {
      quickAddBtn.addEventListener('click', handleQuickAdd);
    }

    // 일정 모달
    const openModalBtn = document.getElementById('openModalBtn');
    if (openModalBtn) openModalBtn.addEventListener('click', () => openModal());

    const modalCloseBtn = document.getElementById('modalCloseBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalForm = document.getElementById('modalForm');
    const modalOverlay = document.getElementById('scheduleModal');
    const allDayChk = document.getElementById('modalAllDayInput');
    const timeInput = document.getElementById('modalTimeInput');

    if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
    if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);
    if (modalForm) modalForm.addEventListener('submit', handleModalSave);

    if (modalOverlay) {
      modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
      });
    }

    if (allDayChk && timeInput) {
      allDayChk.addEventListener('change', () => {
        timeInput.disabled = allDayChk.checked;
      });
    }

    // 계정 연동 버튼들
    const btnAccountSync = document.getElementById('btnAccountSync');
    const btnManualSync = document.getElementById('btnManualSync');
    const accountModalCloseBtn = document.getElementById('accountModalCloseBtn');
    const accountModalCancelBtn = document.getElementById('accountModalCancelBtn');
    const accountSaveBtn = document.getElementById('accountSaveBtn');
    const accountLogoutBtn = document.getElementById('accountLogoutBtn');
    const accountModalOverlay = document.getElementById('accountModal');

    if (btnAccountSync) btnAccountSync.addEventListener('click', openAccountModal);
    if (btnManualSync) btnManualSync.addEventListener('click', handleManualSync);
    if (accountModalCloseBtn) accountModalCloseBtn.addEventListener('click', closeAccountModal);
    if (accountModalCancelBtn) accountModalCancelBtn.addEventListener('click', closeAccountModal);
    if (accountSaveBtn) accountSaveBtn.addEventListener('click', handleAccountSave);
    if (accountLogoutBtn) accountLogoutBtn.addEventListener('click', handleAccountLogout);

    if (accountModalOverlay) {
      accountModalOverlay.addEventListener('click', (e) => {
        if (e.target === accountModalOverlay) closeAccountModal();
      });
    }

    if (typeof CloudSync !== 'undefined') {
      CloudSync.onStatusChange((status, message) => {
        const dot = document.getElementById('syncStatusDot');
        if (dot) {
          dot.className = `sync-status-dot ${status === 'syncing' ? 'syncing' : ''}`;
        }
      });
    }

    // 백업 및 새 창
    const newTabBtn = document.getElementById('btnNewTab');
    if (newTabBtn) newTabBtn.addEventListener('click', openInNewTab);

    const exportBtn = document.getElementById('btnExport');
    if (exportBtn) exportBtn.addEventListener('click', exportData);

    const importBtn = document.getElementById('btnImport');
    if (importBtn) importBtn.addEventListener('click', importData);

    // 데이터 로드
    Storage.loadLocal(async (loadedList) => {
      state.schedules = loadedList;
      renderAll();

      if (typeof CloudSync !== 'undefined' && CloudSync.hasActiveSession()) {
        try {
          const cloudList = await CloudSync.pullFromCloud();
          if (cloudList && Array.isArray(cloudList)) {
            state.schedules = cloudList;
            Storage.saveLocal(cloudList);
            renderAll();
          }
        } catch (e) {
          console.warn('초기 동기화 건너뜀:', e);
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
