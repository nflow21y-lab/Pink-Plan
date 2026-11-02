/**
 * 핑키 플랜 (Pinky Plan) - 클라우드 동기화 모듈
 * 크롬 계정(이메일) + 비밀번호 기반 AES-256 종단간 암호화(E2EE) 지원
 */

const CloudSync = (function () {
  'use strict';

  const STORAGE_KEY_USER = 'pinky_cloud_user';
  const STORAGE_KEY_FIREBASE_URL = 'pinky_custom_firebase_url';
  const STORAGE_KEY_LAST_SYNC = 'pinky_last_sync_time';

  // 기본 무료 클라우드 저장소
  const DEFAULT_KV_BUCKET = 'https://kvdb.io/A8v5eW5xTf749r8jXjWkP8';

  let currentUser = localStorage.getItem(STORAGE_KEY_USER) || null;
  let currentPassword = sessionStorage.getItem('pinky_active_session_pass') || null;
  let customFirebaseUrl = localStorage.getItem(STORAGE_KEY_FIREBASE_URL) || null;
  let statusListeners = [];
  let isSyncing = false;

  function notifyStatus(status, message) {
    statusListeners.forEach((fn) => {
      try { fn(status, message); } catch (e) { console.error(e); }
    });
  }

  function emailToKey(email) {
    const cleaned = (email || '').trim().toLowerCase();
    let hash = 5381;
    for (let i = 0; i < cleaned.length; i++) {
      hash = ((hash << 5) + hash) + cleaned.charCodeAt(i);
      hash = hash & hash;
    }
    const safePrefix = cleaned.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 16);
    return `usr_${safePrefix}_${Math.abs(hash).toString(36)}`;
  }

  // --- Web Crypto API: AES-GCM 256비트 종단간 암호화 ---
  async function deriveKey(password, saltStr) {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: enc.encode(saltStr),
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encryptPayload(dataObj, password, email) {
    try {
      const plaintext = JSON.stringify(dataObj);
      const enc = new TextEncoder();
      const key = await deriveKey(password, email);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        enc.encode(plaintext)
      );

      const combined = new Uint8Array(iv.length + encrypted.byteLength);
      combined.set(iv);
      combined.set(new Uint8Array(encrypted), iv.length);

      let binary = '';
      for (let i = 0; i < combined.length; i++) {
        binary += String.fromCharCode(combined[i]);
      }
      return btoa(binary);
    } catch (err) {
      console.error('암호화 실패:', err);
      throw new Error('일정 데이터 암호화에 실패했습니다.');
    }
  }

  async function decryptPayload(cipherBase64, password, email) {
    try {
      const binary = atob(cipherBase64);
      const combined = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        combined[i] = binary.charCodeAt(i);
      }
      const iv = combined.slice(0, 12);
      const data = combined.slice(12);

      const key = await deriveKey(password, email);
      const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        data
      );

      const dec = new TextDecoder();
      const plaintext = dec.decode(decrypted);
      return JSON.parse(plaintext);
    } catch (err) {
      throw new Error('비밀번호가 일치하지 않습니다. 올바른 비밀번호를 입력해주세요.');
    }
  }

  function getEndpointUrl(userKey) {
    if (customFirebaseUrl) {
      let baseUrl = customFirebaseUrl.trim().replace(/\/+$/, '');
      if (!baseUrl.endsWith('.json')) {
        baseUrl += `/pinky_users/${userKey}.json`;
      }
      return { url: baseUrl, isFirebase: true };
    }
    return { url: `${DEFAULT_KV_BUCKET}/${userKey}`, isFirebase: false };
  }

  return {
    onStatusChange: function (fn) {
      statusListeners.push(fn);
    },

    getCurrentUser: function () {
      return currentUser;
    },

    hasActiveSession: function () {
      return !!(currentUser && currentPassword);
    },

    getCustomFirebaseUrl: function () {
      return customFirebaseUrl;
    },

    setCustomFirebaseUrl: function (url) {
      customFirebaseUrl = url ? url.trim() : null;
      if (customFirebaseUrl) {
        localStorage.setItem(STORAGE_KEY_FIREBASE_URL, customFirebaseUrl);
      } else {
        localStorage.removeItem(STORAGE_KEY_FIREBASE_URL);
      }
    },

    getLastSyncTime: function () {
      const ts = localStorage.getItem(STORAGE_KEY_LAST_SYNC);
      if (!ts) return null;
      const d = new Date(parseInt(ts, 10));
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    },

    // 계정 로그인 및 비밀번호 확인
    login: async function (email, password) {
      const cleanedEmail = (email || '').trim().toLowerCase();
      const cleanedPass = (password || '').trim();

      if (!cleanedEmail || !cleanedEmail.includes('@')) {
        throw new Error('올바른 이메일 주소를 입력해주세요.');
      }
      if (!cleanedPass || cleanedPass.length < 4) {
        throw new Error('비밀번호는 최소 4자리 이상 입력해주세요.');
      }

      notifyStatus('syncing', '클라우드 보안 데이터 확인 중...');
      const key = emailToKey(cleanedEmail);
      const endpoint = getEndpointUrl(key);

      let remoteRecord = null;
      try {
        const res = await fetch(endpoint.url, { headers: { 'Cache-Control': 'no-cache' } });
        if (res.ok) {
          if (endpoint.isFirebase) {
            remoteRecord = await res.json();
          } else {
            const text = await res.text();
            if (text && text.trim().startsWith('{')) {
              remoteRecord = JSON.parse(text);
            }
          }
        }
      } catch (err) {
        console.warn('원격 데이터 확인 실패:', err);
      }

      // 1. 기존 데이터가 있는 경우 복호화 검증
      if (remoteRecord && remoteRecord.encryptedData) {
        try {
          const decrypted = await decryptPayload(remoteRecord.encryptedData, cleanedPass, cleanedEmail);
          currentUser = cleanedEmail;
          currentPassword = cleanedPass;
          localStorage.setItem(STORAGE_KEY_USER, currentUser);
          sessionStorage.setItem('pinky_active_session_pass', currentPassword);
          localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
          notifyStatus('online', '동기화 완료');
          return decrypted.schedules;
        } catch (decryptErr) {
          throw new Error('비밀번호가 일치하지 않습니다. 올바른 비밀번호를 입력해주세요.');
        }
      }

      // 2. 신규 계정 등록
      currentUser = cleanedEmail;
      currentPassword = cleanedPass;
      localStorage.setItem(STORAGE_KEY_USER, currentUser);
      sessionStorage.setItem('pinky_active_session_pass', currentPassword);
      notifyStatus('online', '신규 보안 계정 등록 완료');
      return null;
    },

    // 로그아웃
    logout: function () {
      currentUser = null;
      currentPassword = null;
      localStorage.removeItem(STORAGE_KEY_USER);
      sessionStorage.removeItem('pinky_active_session_pass');
      localStorage.removeItem(STORAGE_KEY_LAST_SYNC);
      notifyStatus('offline', '로컬 단독 모드');
    },

    // 클라우드 저장
    pushToCloud: async function (schedules) {
      if (!currentUser || !currentPassword || isSyncing) return;
      isSyncing = true;
      notifyStatus('syncing', '데이터 암호화 및 클라우드 저장 중...');

      try {
        const key = emailToKey(currentUser);
        const endpoint = getEndpointUrl(key);

        const encryptedData = await encryptPayload({ schedules: schedules }, currentPassword, currentUser);

        const payload = {
          email: currentUser,
          encryptedData: encryptedData,
          updatedAt: Date.now()
        };

        let res;
        if (endpoint.isFirebase) {
          res = await fetch(endpoint.url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
        } else {
          res = await fetch(endpoint.url, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify(payload)
          });
        }

        if (res.ok) {
          localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
          notifyStatus('online', '보안 동기화 완료');
        } else {
          notifyStatus('warning', '클라우드 응답 지연');
        }
      } catch (err) {
        console.warn('클라우드 저장 실패:', err);
        notifyStatus('warning', '클라우드 연결 대기');
      } finally {
        isSyncing = false;
      }
    },

    // 클라우드 불러오기
    pullFromCloud: async function () {
      if (!currentUser || !currentPassword) return null;
      notifyStatus('syncing', '클라우드 데이터 확인 중...');

      try {
        const key = emailToKey(currentUser);
        const endpoint = getEndpointUrl(key);

        const res = await fetch(endpoint.url, { headers: { 'Cache-Control': 'no-cache' } });
        if (!res.ok) return null;

        let remoteRecord = null;
        if (endpoint.isFirebase) {
          remoteRecord = await res.json();
        } else {
          const text = await res.text();
          if (text && text.trim().startsWith('{')) {
            remoteRecord = JSON.parse(text);
          }
        }

        if (remoteRecord && remoteRecord.encryptedData) {
          const decrypted = await decryptPayload(remoteRecord.encryptedData, currentPassword, currentUser);
          if (decrypted && Array.isArray(decrypted.schedules)) {
            localStorage.setItem(STORAGE_KEY_LAST_SYNC, String(Date.now()));
            notifyStatus('online', '동기화 최신 상태');
            return decrypted.schedules;
          }
        }
        return null;
      } catch (err) {
        console.warn('클라우드 확인 실패:', err);
        return null;
      }
    }
  };
})();
