// The shape of one learner's saved data. Same shape in local-only mode
// (localStorage) and in Firestore (document kids/{kidUid}).
//
// kids/{kidUid} = {
//   parentUid,             // the linked grown-up account (Firebase mode)
//   profile:  { nickname, username, avatar, onboarded, reasons, topics, placement, practiceTime, startLesson },
//   settings: { dailyGoalMin, sound, leniency, listening, pinHash, tutor, resetAt },
//   progress: { xp, days, streak, concepts, lessons, league, trophies, stats, recent, startedOn },
//   updatedAt
// }

import { initialStreak } from '../engine/streaks.js';
import { initialLeague } from '../engine/rewards.js';
import { localDateKey } from '../engine/dates.js';

export const AVATARS = ['🐆', '🦊', '🐼', '🦁', '🐸', '🐙', '🦅', '🐺', '🐯', '🐲'];
export const AVATAR_COLORS = ['#5B4BFF', '#FF8A1F', '#1FB871', '#FF5A5F', '#10A3A3', '#8E5CF7', '#F2B705', '#2F80ED'];

export function defaultProfile(nickname = '', username = '') {
  return {
    nickname,
    username,
    avatar: { icon: AVATARS[0], color: AVATAR_COLORS[0] },
    onboarded: false,
    reasons: [],
    topics: [],
    placement: null, // { level: 'new' | 'some' | 'strong', score }
    practiceTime: '',
    startLesson: 'u0-l1',
  };
}

export function defaultSettings() {
  return {
    dailyGoalMin: 10,
    streakGoal: 7, // kept in sync with progress.streak.goal
    sound: true,
    leniency: 'standard', // 'gentle' | 'standard'
    listening: 'auto', // 'auto' | 'cloud' | 'webspeech' | 'selfcheck'
    pinHash: '',
    tutor: true,
    resetAt: 0,
  };
}

export function freshProgress(today = localDateKey(), streakGoal = 7) {
  return {
    xp: 0,
    days: {}, // "YYYY-MM-DD": { sec, xp, goalMet, lessons, spoken, ok }
    streak: initialStreak(streakGoal, today),
    concepts: {}, // conceptId: mastery state (engine/mastery.js)
    lessons: {}, // lessonId: { done, best, times, last }
    league: initialLeague(today),
    trophies: {}, // trophyId: "YYYY-MM-DD"
    stats: { attempts: 0, spokenOk: 0, lessonsDone: 0, perfectLessons: 0, reviews: 0, roleplays: 0, freeTalks: 0, scoreSum: 0, scored: 0 },
    recent: [], // last activities, newest first
    startedOn: today,
  };
}

export function newKidDoc({ nickname = '', username = '', parentUid = '' } = {}) {
  return {
    parentUid,
    profile: defaultProfile(nickname, username),
    settings: defaultSettings(),
    progress: freshProgress(),
  };
}

/** Fill in any fields added in newer app versions. */
export function upgradeKidDoc(doc) {
  const d = { ...doc };
  d.profile = { ...defaultProfile(), ...(doc.profile || {}) };
  d.settings = { ...defaultSettings(), ...(doc.settings || {}) };
  const fresh = freshProgress();
  d.progress = { ...fresh, ...(doc.progress || {}) };
  d.progress.stats = { ...fresh.stats, ...(doc.progress?.stats || {}) };
  d.progress.streak = { ...fresh.streak, ...(doc.progress?.streak || {}) };
  return d;
}
