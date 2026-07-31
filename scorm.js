(function (global) {
  'use strict';

  const SCORE_MIN = 0;
  const SCORE_MAX = 5;
  const SUSPEND_DATA_LIMIT = 4096;

  function isTrue(value) {
    return value === true || String(value).toLowerCase() === 'true';
  }

  function clampScore(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return SCORE_MIN;
    return Math.min(SCORE_MAX, Math.max(SCORE_MIN, number));
  }

  function formatSessionTime(milliseconds) {
    const totalHundredths = Math.max(0, Math.floor(milliseconds / 10));
    const hundredths = totalHundredths % 100;
    const totalSeconds = Math.floor(totalHundredths / 100);
    const seconds = totalSeconds % 60;
    const totalMinutes = Math.floor(totalSeconds / 60);
    const minutes = totalMinutes % 60;
    const hours = Math.min(9999, Math.floor(totalMinutes / 60));
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  function compactSuspendData(state) {
    const answerSummary = Array.isArray(state.answers)
      ? state.answers.slice(-24).map((answer) => ({
          id: answer.id,
          c: !!answer.correct,
          d: Number(answer.delta || 0),
          t: Number(answer.timeSec || 0),
          e: answer.event || ''
        }))
      : [];

    const payload = {
      v: 1,
      q: Number(state.questionIndex || 0),
      s: clampScore(state.score),
      e: Number(state.energy || 0),
      i: Number(state.integrity || 0),
      sec: Array.isArray(state.sectorProgress) ? state.sectorProgress : [],
      seed: Number(state.seed || 0),
      mode: state.mode || '',
      worlds: Array.isArray(state.selectedWorlds) ? state.selectedWorlds : [],
      topics: Array.isArray(state.selectedTopics) ? state.selectedTopics : [],
      a: answerSummary
    };

    let json = JSON.stringify(payload);
    while (json.length > SUSPEND_DATA_LIMIT && payload.a.length) {
      payload.a.shift();
      json = JSON.stringify(payload);
    }
    return json.length <= SUSPEND_DATA_LIMIT ? json : JSON.stringify({ v: 1, q: payload.q, s: payload.s });
  }

  const Scorm = {
    api: null,
    initialized: false,
    sessionStartedAt: 0,
    finished: false,

    findAPI(startWindow) {
      let current = startWindow;
      let attempts = 0;
      while (current && attempts < 50) {
        try {
          if (current.API) return current.API;
          if (!current.parent || current.parent === current) break;
          current = current.parent;
        } catch (_error) {
          break;
        }
        attempts += 1;
      }

      try {
        current = global.opener;
        attempts = 0;
        while (current && attempts < 50) {
          if (current.API) return current.API;
          if (!current.parent || current.parent === current) break;
          current = current.parent;
          attempts += 1;
        }
      } catch (_error) {
        // Cross-origin access can fail; absence of API simply means web/GitHub mode.
      }
      return null;
    },

    init() {
      if (this.initialized) return true;
      if (this.finished) return false;

      try {
        this.api = this.findAPI(global);
        if (!this.api) return false;

        const ok = this.api.LMSInitialize('');
        this.initialized = isTrue(ok);
        if (!this.initialized) return false;

        this.sessionStartedAt = Date.now();
        const status = this.get('cmi.core.lesson_status');
        if (!status || status === 'not attempted' || status === 'unknown') {
          this.set('cmi.core.lesson_status', 'incomplete');
        }
        this.set('cmi.core.score.min', SCORE_MIN);
        this.set('cmi.core.score.max', SCORE_MAX);
        this.commit();
        return true;
      } catch (error) {
        console.warn('SCORM 1.2 initialization failed.', error);
        this.initialized = false;
        return false;
      }
    },

    get(key) {
      try {
        return this.initialized ? this.api.LMSGetValue(key) : '';
      } catch (_error) {
        return '';
      }
    },

    set(key, value) {
      try {
        return this.initialized && isTrue(this.api.LMSSetValue(key, String(value)));
      } catch (_error) {
        return false;
      }
    },

    commit() {
      try {
        return this.initialized && isTrue(this.api.LMSCommit(''));
      } catch (_error) {
        return false;
      }
    },

    writeProgress(state) {
      if (!this.initialized || this.finished) return false;
      const score = clampScore(state && state.score);
      this.set('cmi.core.score.min', SCORE_MIN);
      this.set('cmi.core.score.max', SCORE_MAX);
      this.set('cmi.core.score.raw', score.toFixed(2));
      this.set('cmi.core.lesson_location', String((state && state.questionIndex) || 0));
      this.set('cmi.suspend_data', compactSuspendData(state || {}));
      return true;
    },

    saveProgress(state) {
      if (!this.initialized || this.finished) return false;
      this.writeProgress(state || {});
      this.set('cmi.core.exit', 'suspend');
      return this.commit();
    },

    suspend(state) {
      if (!this.initialized || this.finished) return false;
      this.writeProgress(state || {});
      this.set('cmi.core.exit', 'suspend');
      this.set('cmi.core.session_time', formatSessionTime(Date.now() - this.sessionStartedAt));
      this.commit();
      return this.terminate();
    },

    finish(score, status, location) {
      if (!this.initialized || this.finished) return false;
      const finalScore = clampScore(score);
      const finalStatus = status || (finalScore >= 3 ? 'passed' : 'failed');

      this.set('cmi.core.score.min', SCORE_MIN);
      this.set('cmi.core.score.max', SCORE_MAX);
      this.set('cmi.core.score.raw', finalScore.toFixed(2));
      this.set('cmi.core.lesson_status', finalStatus);
      if (location) this.set('cmi.core.lesson_location', location);
      this.set('cmi.core.exit', '');
      this.set('cmi.core.session_time', formatSessionTime(Date.now() - this.sessionStartedAt));
      this.commit();
      return this.terminate();
    },

    terminate() {
      if (!this.initialized || this.finished) return false;
      let ok = false;
      try {
        ok = isTrue(this.api.LMSFinish(''));
      } catch (_error) {
        ok = false;
      }
      this.initialized = false;
      this.finished = true;
      return ok;
    }
  };

  global.NVScorm = Scorm;
})(window);
