// 핑키 플랜 - 크롬 확장 프로그램 백그라운드 서비스 워커

chrome.runtime.onInstalled.addListener(() => {
  if (chrome.action && chrome.action.setBadgeBackgroundColor) {
    chrome.action.setBadgeBackgroundColor({ color: '#FF809F' });
  }

  chrome.storage.sync.get(['pinky_schedules'], (result) => {
    if (result.pinky_schedules) {
      updateBadge(result.pinky_schedules);
    }
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith('pinky_schedule_')) {
    chrome.storage.sync.get(['pinky_schedules'], (result) => {
      const schedules = result.pinky_schedules || [];
      const scheduleId = alarm.name.replace('pinky_schedule_', '');
      const item = schedules.find((s) => s.id === scheduleId);

      if (item && !item.completed) {
        chrome.notifications.create(alarm.name, {
          type: 'basic',
          iconUrl: 'icons/icon128.png',
          title: `🌸 [일정 알림] ${item.title}`,
          message: `${item.time ? item.time + ' - ' : ''}${item.memo || '예정된 일정이 시작됩니다.'}`,
          priority: 2
        });
      }
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateBadge') {
    updateBadge(request.schedules);
    sendResponse({ success: true });
  } else if (request.action === 'scheduleAlarm') {
    if (request.schedule && request.schedule.notify && request.schedule.date && request.schedule.time) {
      const targetTime = new Date(`${request.schedule.date}T${request.schedule.time}:00`).getTime();
      const now = Date.now();
      if (targetTime > now) {
        chrome.alarms.create(`pinky_schedule_${request.schedule.id}`, {
          when: targetTime
        });
      }
    }
    sendResponse({ success: true });
  } else if (request.action === 'clearAlarm') {
    if (request.id) {
      chrome.alarms.clear(`pinky_schedule_${request.id}`);
    }
    sendResponse({ success: true });
  }
  return true;
});

function updateBadge(schedules) {
  if (!schedules || !Array.isArray(schedules)) return;

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const todayStr = `${yyyy}-${mm}-${dd}`;

  const remainingCount = schedules.filter(
    (s) => s.date === todayStr && !s.completed
  ).length;

  if (chrome.action && chrome.action.setBadgeText) {
    if (remainingCount > 0) {
      chrome.action.setBadgeText({ text: String(remainingCount) });
      chrome.action.setBadgeTextColor({ color: '#FFFFFF' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  }
}
