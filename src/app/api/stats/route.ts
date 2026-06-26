import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/stats — aggregated learning statistics for the global dashboard
// Computes sessions / messages / knowledge / mastery / weekly activity / achievements
export async function GET() {
  try {
    const [
      sessions,
      allMessages,
      allKnowledge,
      masteredKnowledge,
      recentSessions,
      allCards,
      allTasks,
    ] = await Promise.all([
      db.learningSession.findMany({ select: { id: true, createdAt: true, updatedAt: true, status: true } }),
      db.learningMessage.findMany({ select: { id: true, role: true, sessionId: true, createdAt: true } }),
      db.knowledgeNode.findMany({ select: { id: true, mastered: true, sessionId: true, createdAt: true } }),
      db.knowledgeNode.findMany({ where: { mastered: true }, select: { id: true } }),
      db.learningSession.findMany({
        take: 200,
        orderBy: { updatedAt: 'desc' },
        select: { id: true, updatedAt: true, createdAt: true },
      }),
      db.card.findMany({ select: { id: true, mastered: true, ease: true, dueAt: true, lastReviewedAt: true, repetition: true } }),
      db.task.findMany({ select: { id: true, done: true } }),
    ]);

    // Per-session message counts (for max-round achievement & overall totals)
    const msgCountBySession = new Map<string, number>();
    let userMsgCount = 0;
    for (const m of allMessages) {
      msgCountBySession.set(m.sessionId, (msgCountBySession.get(m.sessionId) || 0) + 1);
      if (m.role === 'user') userMsgCount += 1;
    }
    const maxRoundsInOneSession = Array.from(msgCountBySession.values()).reduce((max, c) => Math.max(max, c), 0);

    // Estimate learning time: each message ~1.5 min (rough heuristic)
    const totalMinutes = Math.round(allMessages.length * 1.5);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const learningTimeLabel = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

    // Weekly activity (last 7 days, by day of week)
    // Day labels: 一(1) 二(2) 三(3) 四(4) 五(5) 六(6) 日(0)
    const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayBuckets: Array<{ label: string; date: Date; count: number }> = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const wd = d.getDay();
      dayBuckets.push({ label: dayLabels[wd], date: d, count: 0 });
    }
    // Count messages per day (any activity = messages created that day)
    for (const m of allMessages) {
      const md = new Date(m.createdAt);
      md.setHours(0, 0, 0, 0);
      for (const b of dayBuckets) {
        if (b.date.getTime() === md.getTime()) {
          b.count += 1;
          break;
        }
      }
    }
    const weeklyActivity = dayBuckets.map(b => ({ label: b.label, count: b.count }));

    // Distinct active days (for "持续学习者" — 3 consecutive days)
    // Compute current streak ending today (or yesterday if today has no activity)
    const activeDays = new Set<string>();
    for (const m of allMessages) {
      const md = new Date(m.createdAt);
      md.setHours(0, 0, 0, 0);
      activeDays.add(md.toISOString().slice(0, 10));
    }
    let streak = 0;
    const cursor = new Date(today);
    // If no activity today, start from yesterday (don't break a streak just because today hasn't started yet)
    if (!activeDays.has(cursor.toISOString().slice(0, 10))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (activeDays.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Achievement progress (computed from real data)
    const achievements = [
      {
        id: 'ach-1',
        title: '初次对话',
        description: '发送第一条学习消息',
        icon: 'message',
        maxProgress: 1,
        progress: Math.min(userMsgCount, 1),
        unlocked: userMsgCount >= 1,
      },
      {
        id: 'ach-2',
        title: '知识探索者',
        description: '学习 5 个不同知识点',
        icon: 'compass',
        maxProgress: 5,
        progress: Math.min(allKnowledge.length, 5),
        unlocked: allKnowledge.length >= 5,
      },
      {
        id: 'ach-3',
        title: '持续学习者',
        description: '连续 3 天学习',
        icon: 'flame',
        maxProgress: 3,
        progress: Math.min(streak, 3),
        unlocked: streak >= 3,
      },
      {
        id: 'ach-4',
        title: '知识达人',
        description: '掌握 10 个知识点',
        icon: 'crown',
        maxProgress: 10,
        progress: Math.min(masteredKnowledge.length, 10),
        unlocked: masteredKnowledge.length >= 10,
      },
      {
        id: 'ach-5',
        title: '深度思考者',
        description: '单次对话超过 20 轮',
        icon: 'brain',
        maxProgress: 20,
        progress: Math.min(maxRoundsInOneSession, 20),
        unlocked: maxRoundsInOneSession >= 20,
      },
      {
        id: 'ach-6',
        title: '多面手',
        description: '创建 5 个学习主题',
        icon: 'layers',
        maxProgress: 5,
        progress: Math.min(sessions.length, 5),
        unlocked: sessions.length >= 5,
      },
    ];

    // Top sessions by message count (for "recent activity" UI)
    const topSessions = recentSessions
      .map(s => ({
        id: s.id,
        messageCount: msgCountBySession.get(s.id) || 0,
        updatedAt: s.updatedAt,
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 5);

    // ─── Card / SM-2 review metrics ─────────────────────────────────────────
    const now = new Date();
    const masteredCards = allCards.filter(c => c.mastered).length;
    const dueCards = allCards.filter(c => c.dueAt && c.dueAt <= now).length;
    const reviewedCards = allCards.filter(c => c.lastReviewedAt !== null).length;
    const reviewedEase = allCards.filter(c => c.lastReviewedAt !== null);
    const avgEase = reviewedEase.length > 0
      ? reviewedEase.reduce((s, c) => s + c.ease, 0) / reviewedEase.length
      : 2.5;

    // ─── Task metrics ───────────────────────────────────────────────────────
    const doneTasks = allTasks.filter(t => t.done).length;

    return NextResponse.json({
      totals: {
        sessions: sessions.length,
        messages: allMessages.length,
        userMessages: userMsgCount,
        knowledgeNodes: allKnowledge.length,
        masteredKnowledge: masteredKnowledge.length,
        learningTimeLabel,
        maxRoundsInOneSession,
        currentStreak: streak,
        totalCards: allCards.length,
        masteredCards,
        dueCards,
        reviewedCards,
        avgEase: Math.round(avgEase * 100) / 100,
        totalTasks: allTasks.length,
        doneTasks,
      },
      weeklyActivity,
      achievements,
      topSessions,
    });
  } catch (error) {
    console.error('GET /api/stats error:', error);
    return NextResponse.json({ error: 'Failed to compute stats' }, { status: 500 });
  }
}
