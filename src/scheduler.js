function getNextRunDate(schedule) {
  const next = new Date();
  next.setHours(schedule.hours, schedule.minutes, 0, 0);

  if (next <= new Date()) {
    next.setDate(next.getDate() + 1);
  }

  return next;
}

export function startDailyScheduler(schedule, job) {
  let timeoutId = null;

  const planNextRun = () => {
    const nextRun = getNextRunDate(schedule);
    const delay = nextRun.getTime() - Date.now();

    console.log(`Next run scheduled for ${nextRun.toString()}`);

    timeoutId = setTimeout(async () => {
      try {
        await job();
      } catch (error) {
        console.error(error);
      } finally {
        planNextRun();
      }
    }, delay);
  };

  planNextRun();

  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}
