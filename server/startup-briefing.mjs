// One read-only, bounded mailbox excerpt per app process; never a second model.
export function createStartupBriefing({ enabled, read, sanitize }) {
  let pending;
  let result = null;
  return {
    async run() {
      if (!enabled()) return { status: "disabled" };
      if (!pending)
        pending = (async () => {
          try {
            const data = await read();
            if (data.cancelled || !data.displayed)
              return (result = { status: "cancelled" });
            result = {
              status: "ready",
              fetchedAt: data.fetchedAt,
              scope:
                "Nur die letzten höchstens 20 abgerufenen Nachrichten, nicht das gesamte Postfach. Priorität ist eine Heuristik.",
              checkedMessages: data.messages.length,
              unread: data.unreadCount,
              today: data.summary?.todayCount,
              attention: data.attentionCount,
              topSubjects: (data.summary?.topSubjects || [])
                .slice(0, 3)
                .map((s) => String(s).slice(0, 150)),
            };
          } catch (error) {
            result = {
              status: "unavailable",
              error: sanitize(error.message).slice(0, 350),
            };
          }
          return result;
        })();
      return pending;
    },
    state: () => result,
  };
}
